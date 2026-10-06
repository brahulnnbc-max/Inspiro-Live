import { JEEClass } from '../types/class';

// Fallback initial classes relative to the current IST time
export function generateDefaultClasses(): JEEClass[] {
  return [];
}

const STORAGE_KEY = 'inspiro_jee_classes_v2';

// Safe localStorage access - respects user deletions even if list is empty
function getLocalClasses(): JEEClass[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw !== null) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed; // Returns whatever user saved, including empty []
      }
    }
  } catch (e) {
    console.warn('localStorage read error:', e);
  }
  return [];
}

function setLocalClasses(classes: JEEClass[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(classes));
  } catch (e) {
    console.warn('localStorage write error:', e);
  }
}

/**
 * Universal Class Fetcher
 * Tries the /api/classes endpoint first.
 * If successful, syncs to localStorage and returns server state (even if empty []).
 */
export async function fetchAllClasses(): Promise<JEEClass[]> {
  try {
    const res = await fetch('/api/classes', {
  headers: { 'Accept': 'application/json' },
  cache: 'no-store',
});

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.classes)) {
        setLocalClasses(data.classes);
        return data.classes;
      }
    }
  } catch (err) {
    // Network / static host fallback
  }

  return getLocalClasses();
}

/**
 * Save new class
 */
export async function saveNewClass(newClass: Omit<JEEClass, 'id' | 'created_at'>): Promise<JEEClass> {
  try {
    const res = await fetch('/api/classes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newClass),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.class) {
        const current = getLocalClasses();
        const updated = [...current.filter(c => c.id !== data.class.id), data.class];
        setLocalClasses(updated);
        return data.class;
      }
    }
  } catch (err) {
    // Fallback to local
  }

  const localId = `class-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const created: JEEClass = {
    ...newClass,
    id: localId,
    created_at: new Date().toISOString(),
  };

  const current = getLocalClasses();
  const updated = [...current, created];
  setLocalClasses(updated);
  return created;
}

/**
 * Delete class
 */
export async function removeClass(id: string): Promise<boolean> {
  // 1. Immediately update local storage so deleted class vanishes from UI without re-appearing
  const current = getLocalClasses();
  const updated = current.filter(c => c.id !== id);
  setLocalClasses(updated);

  // 2. Call backend to remove from persistent file
  try {
    await fetch(`/api/classes/${id}`, {
  method: 'DELETE',
  cache: 'no-store',
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
        setLocalClasses(data.classes);
        return data.classes;
      }
    }
  } catch (err) {
    // Ignore
  }

  const defaults = generateDefaultClasses();
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
