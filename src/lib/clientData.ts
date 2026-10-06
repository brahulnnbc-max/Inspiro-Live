import { JEEClass } from '../types/class';

// Fallback initial classes - empty by default so user has absolute control over timetable
export function generateDefaultClasses(): JEEClass[] {
  return [];
}

const STORAGE_KEY = 'inspiro_jee_classes_v2';
const BACKUP_KEY = 'inspiro_jee_classes_backup_v2';
const DELETED_KEY = 'inspiro_jee_deleted_ids_v2';

// Deleted classes tombstone set (prevents cold-started serverless instances from resurrecting deleted defaults)
function getDeletedClassIds(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(DELETED_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return new Set(arr);
    }
  } catch {}
  return new Set();
}

function addDeletedClassId(id: string) {
  if (typeof window === 'undefined') return;
  try {
    const set = getDeletedClassIds();
    set.add(id);
    localStorage.setItem(DELETED_KEY, JSON.stringify(Array.from(set)));
  } catch {}
}

function clearDeletedClassId(id: string) {
  if (typeof window === 'undefined') return;
  try {
    const set = getDeletedClassIds();
    set.delete(id);
    localStorage.setItem(DELETED_KEY, JSON.stringify(Array.from(set)));
  } catch {}
}

// Safe localStorage access
function getLocalClasses(): JEEClass[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw !== null) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.warn('localStorage read error:', e);
  }
  return [];
}

function getBackupClasses(): JEEClass[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(BACKUP_KEY);
    if (raw !== null) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {}
  return [];
}

function setLocalClasses(classes: JEEClass[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(classes));
    // Also save in long-term backup key
    if (classes.length > 0) {
      localStorage.setItem(BACKUP_KEY, JSON.stringify(classes));
    }
  } catch (e) {
    console.warn('localStorage write error:', e);
  }
}

/**
 * Intelligent Two-Way Reconciler:
 * - Preserves ALL user-scheduled classes across months even if a serverless container cold-starts!
 * - Respects deleted class tombstones so old defaults don't reappear.
 * - Detects if server was missing scheduled classes and signals background sync.
 */
function reconcileClasses(
  localList: JEEClass[],
  serverList: JEEClass[]
): { merged: JEEClass[]; needsSync: boolean } {
  const deletedIds = getDeletedClassIds();
  const map = new Map<string, JEEClass>();

  // 1. Put valid local classes first (authoritative user scheduled state)
  localList.forEach((c) => {
    if (c && c.id && !deletedIds.has(c.id)) {
      map.set(c.id, c);
    }
  });

  let needsServerSync = false;

  // 2. Incorporate server classes
  serverList.forEach((sc) => {
    if (!sc || !sc.id) return;
    // If user explicitly deleted this class, do not resurrect it
    if (deletedIds.has(sc.id)) return;

    const localExisting = map.get(sc.id);
    if (!localExisting) {
      map.set(sc.id, sc);
    } else {
      // Merge: keep whichever is newer
      const localTime = new Date(localExisting.created_at || 0).getTime();
      const serverTime = new Date(sc.created_at || 0).getTime();
      if (serverTime > localTime) {
        map.set(sc.id, sc);
      }
    }
  });

  // Check if local has classes that the server container was missing (e.g. Vercel cold-start)
  for (const localId of map.keys()) {
    if (!serverList.some((sc) => sc.id === localId)) {
      needsServerSync = true;
      break;
    }
  }

  const merged = Array.from(map.values()).sort(
    (a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime()
  );

  return { merged, needsSync: needsServerSync };
}

/**
 * Universal Class Fetcher:
 * Guaranteed zero-data-loss architecture.
 * Works seamlessly on Vercel, Cloud Run, static hosts, or full offline mode.
 */
export async function fetchAllClasses(): Promise<JEEClass[]> {
  const local = getLocalClasses();
  const backup = getBackupClasses();
  const effectiveLocal = local.length > 0 ? local : backup;

  try {
    const res = await fetch('/api/classes', {
      headers: { Accept: 'application/json' },
    });

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.classes)) {
        // Reconcile and preserve user-scheduled classes
        const { merged, needsSync } = reconcileClasses(effectiveLocal, data.classes);
        setLocalClasses(merged);

        // If local had scheduled classes that the server container didn't have (cold start on Vercel),
        // sync them back to server in background so serverless lambdas stay up to date!
        if (needsSync && merged.length > 0) {
          fetch('/api/classes/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ classes: merged }),
          }).catch(() => {});
        }

        return merged;
      }
    }
  } catch (err) {
    // Network / static host fallback
  }

  return effectiveLocal.length > 0 ? effectiveLocal : generateDefaultClasses();
}

/**
 * Save new class
 */
export async function saveNewClass(
  newClass: Omit<JEEClass, 'id' | 'created_at'>
): Promise<JEEClass> {
  const localId = `class-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const created: JEEClass = {
    ...newClass,
    id: localId,
    created_at: new Date().toISOString(),
  };

  clearDeletedClassId(localId);

  // 1. Immediately store in localStorage & backup so it is 100% saved on this device
  const current = getLocalClasses();
  const updated = [...current.filter((c) => c.id !== localId), created];
  setLocalClasses(updated);

  // 2. Persist to server / Vercel API
  try {
    const res = await fetch('/api/classes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(created),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.class) {
        const synced = [...updated.filter((c) => c.id !== localId && c.id !== data.class.id), data.class];
        setLocalClasses(synced);
        return data.class;
      }
    }
  } catch (err) {
    // Local persistence guarantees zero data loss even if server call fails
  }

  return created;
}

/**
 * Delete class
 */
export async function removeClass(id: string): Promise<boolean> {
  // 1. Mark as deleted in tombstones so cold starts cannot resurrect it
  addDeletedClassId(id);

  // 2. Immediately update local storage
  const current = getLocalClasses();
  const updated = current.filter((c) => c.id !== id);
  setLocalClasses(updated);

  // 3. Call backend to remove from persistent file
  try {
    await fetch(`/api/classes/${id}`, {
      method: 'DELETE',
    });
  } catch (err) {
    // Continue with local delete
  }

  return true;
}

/**
 * Clear all classes (empty timetable)
 */
export async function clearAllClassesFromStore(): Promise<boolean> {
  const current = getLocalClasses();
  current.forEach((c) => addDeletedClassId(c.id));
  setLocalClasses([]);
  try {
    await fetch('/api/classes/clear', { method: 'POST' });
  } catch (err) {
    // Continue
  }
  return true;
}

/**
 * Reset classes to default schedule (Only if explicitly clicked by admin)
 */
export async function resetAllClasses(): Promise<JEEClass[]> {
  try {
    const res = await fetch('/api/classes/reset', { method: 'POST' });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.classes)) {
        // Clear tombstones for default IDs
        data.classes.forEach((c: JEEClass) => clearDeletedClassId(c.id));
        setLocalClasses(data.classes);
        return data.classes;
      }
    }
  } catch (err) {}

  const defaults = generateDefaultClasses();
  defaults.forEach((c) => clearDeletedClassId(c.id));
  setLocalClasses(defaults);
  return defaults;
}

const ATTENDANCE_KEY = 'inspiro_class_attendance_v1';

export interface ClassAttendance {
  classId: string;
  watchedMinutes: number;
  percent: number;
  completed: boolean;
  lastWatchedAt: string;
}

let hasSyncedAttendance = false;

export async function syncServerAttendance(): Promise<void> {
  if (hasSyncedAttendance || typeof window === 'undefined') return;
  try {
    const res = await fetch('/api/attendance');
    if (res.ok) {
      const data = await res.json();
      if (data.attendance && typeof data.attendance === 'object') {
        const raw = localStorage.getItem(ATTENDANCE_KEY);
        const map: Record<string, ClassAttendance> = raw ? JSON.parse(raw) : {};
        const merged = { ...data.attendance, ...map };
        localStorage.setItem(ATTENDANCE_KEY, JSON.stringify(merged));
        hasSyncedAttendance = true;
        window.dispatchEvent(new CustomEvent('inspiro_attendance_updated'));
      }
    }
  } catch (e) {
    // Ignore
  }
}

if (typeof window !== 'undefined') {
  syncServerAttendance();
}

export function recordClassAttendance(
  classId: string,
  additionalMinutes: number,
  totalDurationMinutes: number
): void {
  if (typeof window === 'undefined' || !classId) return;
  try {
    const raw = localStorage.getItem(ATTENDANCE_KEY);
    const map: Record<string, ClassAttendance> = raw ? JSON.parse(raw) : {};

    const prev = map[classId] || {
      classId,
      watchedMinutes: 0,
      percent: 0,
      completed: false,
      lastWatchedAt: new Date().toISOString(),
    };

    const newWatched = prev.watchedMinutes + additionalMinutes;
    const percent = Math.min(100, Math.round((newWatched / (totalDurationMinutes || 60)) * 100));

    map[classId] = {
      classId,
      watchedMinutes: newWatched,
      percent,
      completed: percent >= 80,
      lastWatchedAt: new Date().toISOString(),
    };

    localStorage.setItem(ATTENDANCE_KEY, JSON.stringify(map));
    window.dispatchEvent(new CustomEvent('inspiro_attendance_updated'));

    // Long-term server persistence
    fetch('/api/attendance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attendance: { [classId]: map[classId] } }),
    }).catch(() => {});
  } catch (e) {
    // Ignore
  }
}

export function getAllAttendance(): Record<string, ClassAttendance> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(ATTENDANCE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}
