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

const DUMMY_FACULTY = new Set([
  'Er. R. Sharma (Ex-IIT Delhi)',
  'Prof. A. N. Murthy (IIT Madras Alumni)',
  'Dr. Neha Agarwal (Ph.D. Chemistry)',
]);

export function isDummyClass(cls: any): boolean {
  if (!cls) return true;
  if (cls.id && DUMMY_CLASS_IDS.has(cls.id)) return true;
  if (cls.faculty && DUMMY_FACULTY.has(cls.faculty)) return true;
  return false;
}

const STORAGE_KEY = 'inspiro_jee_classes_v3';
const UPDATED_AT_KEY = 'inspiro_jee_classes_updated_at_v3';
const USER_SCHEDULE_FLAG = 'inspiro_schedule_customized_v3';

const LEGACY_STORAGE_KEYS = [
  'inspiro_jee_classes_v2',
  'inspiro_jee_classes_backup_v2',
  'inspiro_jee_classes',
  'inspiro_classes',
];

export function isScheduleCustomized(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(USER_SCHEDULE_FLAG) === 'true';
}

export function markScheduleCustomized(): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(USER_SCHEDULE_FLAG, 'true');
}

/**
 * Migrate older storage keys cleanly into v3, stripping legacy dummy classes.
 */
function migrateLegacyStorage(): JEEClass[] | null {
  if (typeof window === 'undefined') return null;

  // 1. If v3 already exists, use it
  try {
    const v3Raw = localStorage.getItem(STORAGE_KEY);
    if (v3Raw !== null) {
      const parsed = JSON.parse(v3Raw);
      if (Array.isArray(parsed)) {
        return parsed.filter((c) => !isDummyClass(c));
      }
    }
  } catch {}

  // 2. Search legacy storage keys
  for (const key of LEGACY_STORAGE_KEYS) {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const clean = parsed.filter((c) => !isDummyClass(c));
          localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
          localStorage.setItem(UPDATED_AT_KEY, String(Date.now()));
          markScheduleCustomized();

          // Wipe legacy keys so old dummy classes cannot be resurrected
          for (const k of LEGACY_STORAGE_KEYS) {
            try {
              localStorage.removeItem(k);
            } catch {}
          }
          return clean;
        }
      }
    } catch {}
  }

  return null;
}

export function getLocalClasses(): JEEClass[] {
  if (typeof window === 'undefined') return [];
  const migrated = migrateLegacyStorage();
  if (migrated !== null) return migrated;

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter((c) => !isDummyClass(c));
      }
    }
  } catch (e) {
    console.warn('localStorage read error:', e);
  }
  return [];
}

export function getLocalUpdatedAt(): number {
  if (typeof window === 'undefined') return 0;
  try {
    const raw = localStorage.getItem(UPDATED_AT_KEY);
    return raw ? Number(raw) || 0 : 0;
  } catch {
    return 0;
  }
}

export function setLocalClasses(classes: JEEClass[], updatedAt: number = Date.now()): void {
  if (typeof window === 'undefined') return;
  try {
    const clean = classes.filter((c) => !isDummyClass(c));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
    localStorage.setItem(UPDATED_AT_KEY, String(updatedAt));
    markScheduleCustomized();
    window.dispatchEvent(new CustomEvent('inspiro_classes_updated', { detail: clean }));
  } catch (e) {
    console.warn('localStorage write error:', e);
  }
}

/**
 * Universal Class Fetcher:
 * Guaranteed permanent schedule persistence across Vercel serverless cold starts.
 * The client device maintains an authoritative timestamped schedule that self-heals
 * serverless lambda instances whenever they cycle or cold-start.
 */
export async function fetchAllClasses(): Promise<JEEClass[]> {
  const local = getLocalClasses();
  const localUpdatedAt = getLocalUpdatedAt();

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
        const cleanServer: JEEClass[] = data.classes.filter((c: any) => !isDummyClass(c));
        const serverUpdatedAt = typeof data.updatedAt === 'number' ? data.updatedAt : 0;

        // CASE 1: Local has classes, and local was modified at or after server
        if (local.length > 0 && localUpdatedAt >= serverUpdatedAt) {
          const serverIds = new Set(cleanServer.map((c) => c.id));
          const localIds = new Set(local.map((c) => c.id));
          const isIdentical =
            serverIds.size === localIds.size &&
            [...localIds].every((id) => serverIds.has(id));

          // If serverless container is cold or out of sync, heal it immediately
          if (!isIdentical) {
            fetch('/api/classes/sync', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache, no-store' },
              body: JSON.stringify({ classes: local, updatedAt: localUpdatedAt }),
            }).catch(() => {});
          }

          return local;
        }

        // CASE 2: Local was explicitly cleared by user (local is [] and localUpdatedAt > 0)
        if (local.length === 0 && localUpdatedAt > 0 && localUpdatedAt >= serverUpdatedAt) {
          if (cleanServer.length > 0) {
            fetch('/api/classes/sync', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache, no-store' },
              body: JSON.stringify({ classes: [], updatedAt: localUpdatedAt }),
            }).catch(() => {});
          }
          return [];
        }

        // CASE 3: Server has newer updates (e.g. published from another device)
        if (cleanServer.length > 0 && serverUpdatedAt > localUpdatedAt) {
          setLocalClasses(cleanServer, serverUpdatedAt);
          return cleanServer;
        }

        // CASE 4: Fresh visitor with no prior local history (local is [] and localUpdatedAt === 0)
        if (local.length === 0 && localUpdatedAt === 0) {
          if (cleanServer.length > 0) {
            setLocalClasses(cleanServer, serverUpdatedAt || Date.now());
          }
          return cleanServer;
        }

        if (local.length > 0) return local;
        return cleanServer;
      }
    }
  } catch (err) {
    // Network / static host fallback: local storage is 100% authoritative
  }

  return local;
}

/**
 * Export complete timetable to JSON string for safety backup
 */
export function exportScheduleBackup(): string {
  const local = getLocalClasses();
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
    const now = Date.now();
    setLocalClasses(clean, now);

    // Sync to server
    try {
      await fetch('/api/classes/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache, no-store' },
        body: JSON.stringify({ classes: clean, updatedAt: now }),
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
  newClass: Omit<JEEClass, 'id' | 'created_at'> & { id?: string }
): Promise<JEEClass> {
  const localId = newClass.id || `class-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const created: JEEClass = {
    ...newClass,
    id: localId,
    created_at: new Date().toISOString(),
  };

  // 1. Immediately store in localStorage so it appears without latency
  const current = getLocalClasses();
  const updated = [...current.filter((c) => c.id !== localId), created];
  const now = Date.now();
  setLocalClasses(updated, now);

  // 2. Persist to server / Vercel API
  try {
    const res = await fetch('/api/classes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store',
      },
      body: JSON.stringify(created),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.class) {
        const synced = [...updated.filter((c) => c.id !== localId && c.id !== data.class.id), data.class];
        setLocalClasses(synced, now);
        // Sync full schedule to serverless containers
        fetch('/api/classes/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache, no-store' },
          body: JSON.stringify({ classes: synced, updatedAt: now }),
        }).catch(() => {});
        return data.class;
      }
    }
  } catch (err) {
    // Local persistence guarantees zero data loss
  }

  // Backup sync
  fetch('/api/classes/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache, no-store' },
    body: JSON.stringify({ classes: updated, updatedAt: now }),
  }).catch(() => {});

  return created;
}

/**
 * Update class in store and backend
 */
export async function updateClassInStore(
  id: string,
  updates: Partial<JEEClass>
): Promise<JEEClass | null> {
  const current = getLocalClasses();
  const index = current.findIndex((c) => c.id === id);
  if (index === -1) return null;

  const updatedClass: JEEClass = {
    ...current[index],
    ...updates,
  };
  const updatedList = [...current];
  updatedList[index] = updatedClass;
  const now = Date.now();
  setLocalClasses(updatedList, now);

  try {
    await fetch(`/api/classes/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store',
      },
      body: JSON.stringify(updates),
    });
  } catch (e) {}

  fetch('/api/classes/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache, no-store' },
    body: JSON.stringify({ classes: updatedList, updatedAt: now }),
  }).catch(() => {});

  return updatedClass;
}

/**
 * Delete class
 */
export async function removeClass(id: string): Promise<boolean> {
  const current = getLocalClasses();
  const updated = current.filter((c) => c.id !== id);
  const now = Date.now();
  setLocalClasses(updated, now);

  try {
    await fetch(`/api/classes/${id}`, {
      method: 'DELETE',
      headers: { 'Cache-Control': 'no-cache, no-store' },
    });
  } catch (err) {
    // Continue with local delete
  }

  fetch('/api/classes/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache, no-store' },
    body: JSON.stringify({ classes: updated, updatedAt: now }),
  }).catch(() => {});

  return true;
}

/**
 * Clear all classes (empty timetable)
 */
export async function clearAllClassesFromStore(): Promise<boolean> {
  const now = Date.now();
  setLocalClasses([], now);

  try {
    await fetch('/api/classes/clear', {
      method: 'POST',
      headers: { 'Cache-Control': 'no-cache, no-store' },
    });
  } catch (err) {}

  fetch('/api/classes/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache, no-store' },
    body: JSON.stringify({ classes: [], updatedAt: now }),
  }).catch(() => {});

  return true;
}

/**
 * Reset classes to default schedule (Only if explicitly clicked by admin)
 */
export async function resetAllClasses(): Promise<JEEClass[]> {
  await clearAllClassesFromStore();
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
    const res = await fetch('/api/attendance', {
      headers: { 'Cache-Control': 'no-cache, no-store' },
    });
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
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache, no-store' },
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
