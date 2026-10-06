import { JEEClass } from '../types/class';

// Fallback initial classes relative to the current IST time
export function generateDefaultClasses(): JEEClass[] {
  return [];
}
    {
      id: 'class-physics-rotational',
      title: 'Rotational Motion: Moment of Inertia & Pure Rolling',
      subject: 'Physics',
      faculty: 'Er. R. Sharma (Ex-IIT Delhi)',
      topic: 'Mechanics (JEE Advanced Level)',
      description: 'Rigid body dynamics, theorem of parallel & perpendicular axes, and instantaneous center of rotation with previous year question breakdowns.',
      youtube_url: 'https://www.youtube.com/watch?v=x0_z2_t6a_w',
      youtube_id: 'x0_z2_t6a_w',
      // Started 15 minutes ago, lasts 90 minutes -> currently LIVE!
      start_at: new Date(now - 15 * 60 * 1000).toISOString(),
      duration_min: 90,
      is_embeddable: true,
      thumbnail_url: '/images/jee_physics_thumb_1791042406423.jpg',
      created_at: new Date(now - 86400000).toISOString(),
    },
    {
      id: 'class-math-calculus',
      title: 'Definite Integration & Area Under Curves (PYQs)',
      subject: 'Mathematics',
      faculty: 'Prof. A. N. Murthy (IIT Madras Alumni)',
      topic: 'Integral Calculus (JEE Main + Adv)',
      description: 'Properties of definite integrals, Leibniz rule of differentiation, and graphical symmetry methods for high-speed problem solving.',
      youtube_url: 'https://www.youtube.com/watch?v=3fumBcKC6RE',
      youtube_id: '3fumBcKC6RE',
      // Starts in 20 minutes
      start_at: new Date(now + 20 * 60 * 1000).toISOString(),
      duration_min: 75,
      is_embeddable: true,
      thumbnail_url: '/images/jee_math_thumb_1791042443540.jpg',
      created_at: new Date(now - 43200000).toISOString(),
    },
    {
      id: 'class-chem-coordination',
      title: 'Coordination Chemistry & Crystal Field Theory',
      subject: 'Chemistry',
      faculty: 'Dr. Neha Agarwal (Ph.D. Chemistry)',
      topic: 'Inorganic Chemistry',
      description: 'Spectrochemical series, isomerism in coordination complexes, high spin vs low spin splitting and magnetic moment calculations.',
      youtube_url: 'https://www.youtube.com/watch?v=kJQP7kiw5Fk',
      youtube_id: 'kJQP7kiw5Fk',
      // Tomorrow at 10:00 AM IST
      start_at: new Date(now + 18 * 60 * 60 * 1000).toISOString(),
      duration_min: 60,
      is_embeddable: true,
      thumbnail_url: '/images/jee_chemistry_thumb_1791042430591.jpg',
      created_at: new Date(now - 20000000).toISOString(),
    },
    {
      id: 'class-physics-electrostatics',
      title: 'Electrostatics & Gauss Law: Advanced Applications',
      subject: 'Physics',
      faculty: 'Er. R. Sharma (Ex-IIT Delhi)',
      topic: 'Electromagnetism',
      description: 'Electric flux calculation through closed surfaces, conducting shells, self-energy of charge distribution, and electrostatic shielding.',
      youtube_url: 'https://www.youtube.com/watch?v=hB9pZ3v9sW8',
      youtube_id: 'hB9pZ3v9sW8',
      // Completed 3 hours ago -> REPLAY
      start_at: new Date(now - 4 * 60 * 60 * 1000).toISOString(),
      duration_min: 90,
      is_embeddable: true,
      thumbnail_url: '/images/jee_classroom_hero_1791042392139.jpg',
      created_at: new Date(now - 172800000).toISOString(),
    },
  ];
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
