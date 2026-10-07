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

const AUTO_BACKUP_KEY = 'inspiro_jee_classes_recovery_v3';

export function getLocalClasses(): JEEClass[] {
  if (typeof window === 'undefined') return [];
  const migrated = migrateLegacyStorage();
  if (migrated !== null && migrated.length > 0) return migrated;

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.filter((c) => !isDummyClass(c));
      }
    }
    // Safety recovery fallback key
    const recoveryRaw = localStorage.getItem(AUTO_BACKUP_KEY);
    if (recoveryRaw) {
      const parsed = JSON.parse(recoveryRaw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const clean = parsed.filter((c) => !isDummyClass(c));
        localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
        return clean;
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
    if (clean.length > 0) {
      localStorage.setItem(AUTO_BACKUP_KEY, JSON.stringify(clean));
    }
    markScheduleCustomized();
    window.dispatchEvent(new CustomEvent('inspiro_classes_updated', { detail: clean }));
  } catch (e) {
    console.warn('localStorage write error:', e);
  }
}

/**
 * Universal Class Fetcher:
 * Queries the server timetable while strictly protecting the student's local 6-month study schedule.
 * If a serverless host (such as Vercel) cold-starts empty without Supabase, the student's phone schedule
 * is never wiped—instead, it self-heals the server.
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
        const serverUpdatedAt = typeof data.updatedAt === 'number' ? data.updatedAt : Date.now();

        // CASE 1: Student has 6-month study schedule on phone, but server cold-started empty (e.g. Vercel without DB)
        if (local.length > 0 && cleanServer.length === 0) {
          // NEVER wipe student schedule! Keep local and heal the serverless container
          fetch('/api/classes/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ classes: local, updatedAt: localUpdatedAt || Date.now() }),
          }).catch(() => {});
          return local;
        }

        // CASE 2: Both phone and server have classes -> Merge by ID so zero classes are lost
        if (local.length > 0 && cleanServer.length > 0) {
          const map = new Map<string, JEEClass>();
          cleanServer.forEach((c) => map.set(c.id, c));
          local.forEach((c) => {
            if (!map.has(c.id)) {
              map.set(c.id, c);
            }
          });
          const merged = Array.from(map.values()).sort(
            (a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime()
          );
          setLocalClasses(merged, Math.max(serverUpdatedAt, localUpdatedAt));
          return merged;
        }

        // CASE 3: Fresh device / incognito with no prior history -> Take server classes
        if (local.length === 0 && cleanServer.length > 0) {
          setLocalClasses(cleanServer, serverUpdatedAt);
          return cleanServer;
        }

        return local;
      }
    }
  } catch (err) {
    console.warn('Network offline or server unreachable, fallback to cached timetable:', err);
  }

  // Fallback to local offline cache only when network or server is unreachable
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
 * Import and restore timetable from JSON string (Admin only)
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
 * Generate standard RFC4122 v4 UUID
 */
function generateUuid(): string {
  if (typeof window !== 'undefined' && window.crypto && typeof window.crypto.randomUUID === 'function') {
    return window.crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Save new class
 */
export async function saveNewClass(
  newClass: Omit<JEEClass, 'id' | 'created_at'> & { id?: string }
): Promise<JEEClass> {
  const targetId = newClass.id || generateUuid();
  const payload = {
    ...newClass,
    id: targetId,
  };

  try {
    const res = await fetch('/api/classes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || err.error || `Server returned HTTP ${res.status}`);
    }

    const data = await res.json();
    const saved = data.class || payload;
    const current = getLocalClasses();
    const updated = [...current.filter((c) => c.id !== saved.id && c.id !== targetId), saved];
    setLocalClasses(updated, Date.now());
    return saved;
  } catch (err: any) {
    console.error('Error saving class to server:', err);
    throw err;
  }
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
  const updatedLocal = index !== -1 ? { ...current[index], ...updates } : null;

  try {
    const res = await fetch(`/api/classes/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store',
      },
      body: JSON.stringify(updates),
    });

    if (res.ok) {
      const data = await res.json();
      const saved = data.class || updatedLocal;
      if (saved) {
        const list = current.map((c) => (c.id === id ? saved : c));
        setLocalClasses(list, Date.now());
        return saved;
      }
    }
  } catch (e) {
    console.warn('Server offline during updateClassInStore, updating local cache:', e);
  }

  if (updatedLocal) {
    const list = current.map((c) => (c.id === id ? updatedLocal : c));
    setLocalClasses(list, Date.now());
    return updatedLocal;
  }

  return null;
}

/**
 * Delete class
 */
export async function removeClass(id: string): Promise<boolean> {
  try {
    await fetch(`/api/classes/${id}`, {
      method: 'DELETE',
      headers: { 'Cache-Control': 'no-cache, no-store' },
    });
  } catch (err) {
    console.warn('Server offline during removeClass, deleting locally:', err);
  }

  const current = getLocalClasses();
  const updated = current.filter((c) => c.id !== id);
  setLocalClasses(updated, Date.now());
  return true;
}

/**
 * Clear all classes (empty timetable)
 */
export async function clearAllClassesFromStore(): Promise<boolean> {
  try {
    await fetch('/api/classes/clear', {
      method: 'POST',
      headers: { 'Cache-Control': 'no-cache, no-store' },
    });
  } catch (err) {
    console.warn('Server offline during clearAllClassesFromStore:', err);
  }

  setLocalClasses([], Date.now());
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
