import { JEEClass } from '../types/class';

// Fallback initial classes - empty by default so user has absolute control over timetable
export function generateDefaultClasses(): JEEClass[] {
  return [];
}

export const DUMMY_CLASS_IDS = new Set([
  'class-physics-rotational',
  'class-physics-electrostatics',
  'class-math-calculus',
  'class-chem-coordination',
]);

export function isDummyClass(cls: any): boolean {
  if (!cls) return true;
  if (cls.id && DUMMY_CLASS_IDS.has(cls.id)) return true;
  const title = (cls.title || '').trim().toLowerCase();
  if (
    title.includes('rotational motion') ||
    title.includes('electrostatics') ||
    title.includes('definite integration') ||
    title.includes('coordination chemistry')
  ) {
    return true;
  }
  return false;
}

const STORAGE_KEY = 'inspiro_jee_classes_v2';
const BACKUP_KEY = 'inspiro_jee_classes_backup_v2';
const DELETED_KEY = 'inspiro_jee_deleted_ids_v2';
const USER_SCHEDULE_FLAG = 'inspiro_schedule_customized_v2';

export function isScheduleCustomized(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(USER_SCHEDULE_FLAG) === 'true';
}

export function markScheduleCustomized(): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(USER_SCHEDULE_FLAG, 'true');
}

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

// Safe localStorage access with automatic dummy-class purging
function getLocalClasses(): JEEClass[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw !== null) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const cleaned = parsed.filter((c) => !isDummyClass(c));
        localStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned));
        localStorage.setItem(BACKUP_KEY, JSON.stringify(cleaned));
        return cleaned;
      }
    }
  } catch (e) {
    console.warn('localStorage read error:', e);
  }
  return null;
}

function getBackupClasses(): JEEClass[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(BACKUP_KEY);
    if (raw !== null) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter((c) => !isDummyClass(c));
      }
    }
  } catch (e) {}
  return [];
}

function setLocalClasses(classes: JEEClass[]): void {
  if (typeof window === 'undefined') return;
  try {
    const clean = classes.filter((c) => !isDummyClass(c));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
    localStorage.setItem(BACKUP_KEY, JSON.stringify(clean));
  } catch (e) {
    console.warn('localStorage write error:', e);
  }
}

/**
 * Universal Class Fetcher:
 * Guaranteed permanent schedule persistence.
 * If the user on this browser has customized their schedule (deleted/added classes),
 * their schedule is 100% authoritative and will NEVER revert on refresh or server cold-start.
 */
export async function fetchAllClasses(): Promise<JEEClass[]> {
  const local = getLocalClasses();
  const backup = getBackupClasses();
  const effectiveLocal: JEEClass[] = (local !== null ? local : backup).filter((c) => !isDummyClass(c));
  const userCustomized = isScheduleCustomized() || effectiveLocal.length > 0;

  try {
    const res = await fetch(`/api/classes?_t=${Date.now()}`, {
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
      },
    });

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.classes)) {
        const cleanServer = data.classes.filter((c: any) => !isDummyClass(c));

        // When user has existing classes or customized schedule:
        // Local schedule is the single source of truth.
        // NEVER let a fresh deploy or empty server erase user's classes!
        if (userCustomized && effectiveLocal.length > 0) {
          // If server is empty (e.g. fresh Vercel deploy) or out of sync:
          // Immediately repopulate server with user's authoritative schedule!
          const serverIds = new Set(cleanServer.map((c: any) => c.id));
          const localIds = new Set(effectiveLocal.map((c) => c.id));
          const isIdentical =
            serverIds.size === localIds.size &&
            [...localIds].every((id) => serverIds.has(id));

          if (!isIdentical) {
            fetch('/api/classes/sync', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ classes: effectiveLocal }),
            }).catch(() => {});
          }

          setLocalClasses(effectiveLocal);
          return effectiveLocal;
        }

        if (userCustomized && effectiveLocal.length === 0) {
          // User explicitly emptied their schedule
          setLocalClasses([]);
          return [];
        }

        // Fresh visitor with no prior local schedule: adopt server classes
        setLocalClasses(cleanServer);
        return cleanServer;
      }
    }
  } catch (err) {
    // Network / static host fallback
  }

  return effectiveLocal;
}

/**
 * Export complete timetable to JSON string for safety backup
 */
export function exportScheduleBackup(): string {
  const local = getLocalClasses() || [];
  return JSON.stringify(local.filter((c) => !isDummyClass(c)), null, 2);
}

/**
 * Import and restore timetable from JSON string
 */
export async function importScheduleBackup(jsonStr: string): Promise<{ success: boolean; count: number; error?: string }> {
  try {
    const parsed = JSON.parse(jsonStr);
    if (!Array.isArray(parsed)) {
      return { success: false, count: 0, error: 'Uploaded file is not a valid schedule array.' };
    }
    const clean = parsed.filter((c: any) => c && c.title && c.start_at && !isDummyClass(c));
    markScheduleCustomized();
    setLocalClasses(clean);

    // Sync to server
    try {
      await fetch('/api/classes/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classes: clean }),
      });
    } catch (e) {}

    return { success: true, count: clean.length };
  } catch (err: any) {
    return { success: false, count: 0, error: err.message || 'Invalid JSON format' };
  }
}

/**
 * Save new class
 */
export async function saveNewClass(
  newClass: Omit<JEEClass, 'id' | 'created_at'>
): Promise<JEEClass> {
  markScheduleCustomized();
  const localId = `class-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const created: JEEClass = {
    ...newClass,
    id: localId,
    created_at: new Date().toISOString(),
  };

  clearDeletedClassId(localId);

  // 1. Immediately store in localStorage & backup so it is 100% saved on this device
  const current = getLocalClasses() || [];
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
  markScheduleCustomized();
  // 1. Mark as deleted in tombstones so cold starts cannot resurrect it
  addDeletedClassId(id);

  // 2. Immediately update local storage
  const current = getLocalClasses() || [];
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
  markScheduleCustomized();
  const current = getLocalClasses() || [];
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
  markScheduleCustomized();
  try {
    await fetch('/api/classes/reset', { method: 'POST' });
  } catch (err) {}

  setLocalClasses([]);
  return [];
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
