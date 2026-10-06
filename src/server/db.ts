import type { JEEClass, PushSubscriptionData } from '../types/class.ts';
import fs from 'fs';
import path from 'path';

// Default seeded classes
function generateInitialClasses(): JEEClass[] {
  const now = Date.now();

  return [
    {
      id: 'class-physics-rotational',
      title: 'Rotational Motion: Moment of Inertia & Pure Rolling',
      subject: 'Physics',
      faculty: 'Er. R. Sharma (Ex-IIT Delhi)',
      topic: 'Mechanics (JEE Advanced Level)',
      description: 'Rigid body dynamics, theorem of parallel & perpendicular axes, and instantaneous center of rotation with previous year question breakdowns.',
      youtube_url: 'https://www.youtube.com/watch?v=x0_z2_t6a_w',
      youtube_id: 'x0_z2_t6a_w',
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
      start_at: new Date(now - 4 * 60 * 60 * 1000).toISOString(),
      duration_min: 90,
      is_embeddable: true,
      thumbnail_url: '/images/jee_classroom_hero_1791042392139.jpg',
      created_at: new Date(now - 172800000).toISOString(),
    },
  ];
}

// Resilient writable data directory selector (handles read-only filesystems on Vercel / Cloud Run / Lambda)
function resolveDataDirectory(): { readDir: string; writeDir: string } {
  const localDir = path.resolve(process.cwd(), 'data');
  let writeDir = localDir;

  try {
    if (!fs.existsSync(localDir)) {
      fs.mkdirSync(localDir, { recursive: true });
    }
    const testFile = path.join(localDir, '.write-test');
    fs.writeFileSync(testFile, 'ok');
    fs.unlinkSync(testFile);
  } catch (err) {
    // If local directory is read-only (e.g. Vercel deployment), fallback to /tmp
    const tmpDir = path.resolve('/tmp', 'jee-data');
    try {
      if (!fs.existsSync(tmpDir)) {
        fs.mkdirSync(tmpDir, { recursive: true });
      }
      writeDir = tmpDir;
    } catch {
      writeDir = localDir;
    }
  }

  return { readDir: localDir, writeDir };
}

const { readDir, writeDir } = resolveDataDirectory();
const CLASSES_FILE_WRITE = path.join(writeDir, 'classes.json');
const CLASSES_FILE_READ = path.join(readDir, 'classes.json');

function loadPersistedClasses(): JEEClass[] {
  // Try write location first (has latest writes)
  try {
    if (fs.existsSync(CLASSES_FILE_WRITE)) {
      const raw = fs.readFileSync(CLASSES_FILE_WRITE, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {
    // Continue to read location
  }

  // Fallback to repo's committed data location
  try {
    if (CLASSES_FILE_WRITE !== CLASSES_FILE_READ && fs.existsSync(CLASSES_FILE_READ)) {
      const raw = fs.readFileSync(CLASSES_FILE_READ, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {
    console.warn('Failed to read classes.json:', e);
  }

  return generateInitialClasses();
}

function persistClasses() {
  try {
    if (!fs.existsSync(writeDir)) {
      fs.mkdirSync(writeDir, { recursive: true });
    }
    fs.writeFileSync(CLASSES_FILE_WRITE, JSON.stringify(classesStore, null, 2), 'utf8');
  } catch (e) {
    console.warn('Persist classes warning (in-memory preserved):', e);
  }
}

// In-memory data store
let classesStore: JEEClass[] = loadPersistedClasses();
let subscriptionsStore: PushSubscriptionData[] = [];

export async function getAllClasses(): Promise<JEEClass[]> {
  return [...classesStore].sort(
    (a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime()
  );
}

export async function getClassById(id: string): Promise<JEEClass | null> {
  const found = classesStore.find((c) => c.id === id);
  return found || null;
}

export async function createClass(data: Omit<JEEClass, 'id' | 'created_at'>): Promise<JEEClass> {
  const newClass: JEEClass = {
    ...data,
    id: `class-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    created_at: new Date().toISOString(),
  };
  classesStore.push(newClass);
  persistClasses();
  return newClass;
}

export async function updateClass(id: string, updates: Partial<JEEClass>): Promise<JEEClass | null> {
  const index = classesStore.findIndex((c) => c.id === id);
  if (index === -1) return null;
  classesStore[index] = {
    ...classesStore[index],
    ...updates,
  };
  persistClasses();
  return classesStore[index];
}

export async function deleteClass(id: string): Promise<boolean> {
  const initialLength = classesStore.length;
  classesStore = classesStore.filter((c) => c.id !== id);
  const deleted = classesStore.length < initialLength;
  if (deleted) {
    persistClasses();
  }
  return deleted;
}

export async function clearAllClasses(): Promise<void> {
  classesStore = [];
  persistClasses();
}

export async function resetClasses(): Promise<JEEClass[]> {
  classesStore = generateInitialClasses();
  persistClasses();
  return getAllClasses();
}

// Bidirectional synchronization from client to server (reconciles scheduled classes)
export async function syncClasses(clientClasses: JEEClass[]): Promise<JEEClass[]> {
  if (!Array.isArray(clientClasses)) return getAllClasses();

  const classMap = new Map<string, JEEClass>();
  // 1. Put current server classes
  classesStore.forEach((c) => {
    if (c && c.id) classMap.set(c.id, c);
  });

  // 2. Merge client classes (preserves all user-scheduled classes across months)
  clientClasses.forEach((clientClass) => {
    if (!clientClass || !clientClass.id) return;
    const existing = classMap.get(clientClass.id);
    if (!existing) {
      classMap.set(clientClass.id, clientClass);
    } else {
      const clientTime = new Date(clientClass.created_at || 0).getTime();
      const serverTime = new Date(existing.created_at || 0).getTime();
      if (clientTime >= serverTime) {
        classMap.set(clientClass.id, { ...existing, ...clientClass });
      }
    }
  });

  classesStore = Array.from(classMap.values());
  persistClasses();
  return getAllClasses();
}

export async function savePushSubscription(sub: PushSubscriptionData): Promise<void> {
  const exists = subscriptionsStore.some((s) => s.endpoint === sub.endpoint);
  if (!exists) {
    subscriptionsStore.push(sub);
  }
}

export async function getPushSubscriptions(): Promise<PushSubscriptionData[]> {
  return [...subscriptionsStore];
}

// -------------------------------------------------------------
// Long-Term Persistence: Key Moment Bookmarks
// -------------------------------------------------------------
const BOOKMARKS_FILE_WRITE = path.join(writeDir, 'bookmarks.json');
const BOOKMARKS_FILE_READ = path.join(readDir, 'bookmarks.json');

export interface ServerBookmark {
  id: string;
  classId: string;
  seconds: number;
  timestampFormatted: string;
  category: string;
  note: string;
  createdAt: string;
}

function loadPersistedBookmarks(): ServerBookmark[] {
  try {
    if (fs.existsSync(BOOKMARKS_FILE_WRITE)) {
      const raw = fs.readFileSync(BOOKMARKS_FILE_WRITE, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
    if (BOOKMARKS_FILE_WRITE !== BOOKMARKS_FILE_READ && fs.existsSync(BOOKMARKS_FILE_READ)) {
      const raw = fs.readFileSync(BOOKMARKS_FILE_READ, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.warn('Failed to read bookmarks.json:', e);
  }
  return [];
}

let bookmarksStore: ServerBookmark[] = loadPersistedBookmarks();

function persistBookmarks() {
  try {
    if (!fs.existsSync(writeDir)) fs.mkdirSync(writeDir, { recursive: true });
    fs.writeFileSync(BOOKMARKS_FILE_WRITE, JSON.stringify(bookmarksStore, null, 2), 'utf8');
  } catch (e) {
    console.warn('Persist bookmarks warning:', e);
  }
}

export async function getAllServerBookmarks(): Promise<ServerBookmark[]> {
  return [...bookmarksStore];
}

export async function addServerBookmark(bm: ServerBookmark): Promise<ServerBookmark> {
  const existingIdx = bookmarksStore.findIndex((b) => b.id === bm.id);
  if (existingIdx !== -1) {
    bookmarksStore[existingIdx] = bm;
  } else {
    bookmarksStore.push(bm);
  }
  persistBookmarks();
  return bm;
}

export async function deleteServerBookmark(id: string): Promise<boolean> {
  const initial = bookmarksStore.length;
  bookmarksStore = bookmarksStore.filter((b) => b.id !== id);
  if (bookmarksStore.length < initial) {
    persistBookmarks();
    return true;
  }
  return false;
}

// -------------------------------------------------------------
// Long-Term Persistence: Study Records & Real-Time Hours
// -------------------------------------------------------------
const STUDY_HOURS_FILE_WRITE = path.join(writeDir, 'studyHours.json');
const STUDY_HOURS_FILE_READ = path.join(readDir, 'studyHours.json');

export interface ServerStudyRecord {
  id: string;
  subject: string;
  durationMinutes: number;
  timestamp: string;
  type: string;
  classTitle?: string;
}

function loadPersistedStudyRecords(): ServerStudyRecord[] {
  try {
    if (fs.existsSync(STUDY_HOURS_FILE_WRITE)) {
      const raw = fs.readFileSync(STUDY_HOURS_FILE_WRITE, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
    if (STUDY_HOURS_FILE_WRITE !== STUDY_HOURS_FILE_READ && fs.existsSync(STUDY_HOURS_FILE_READ)) {
      const raw = fs.readFileSync(STUDY_HOURS_FILE_READ, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.warn('Failed to read studyHours.json:', e);
  }
  return [];
}

let studyRecordsStore: ServerStudyRecord[] = loadPersistedStudyRecords();

function persistStudyRecords() {
  try {
    if (!fs.existsSync(writeDir)) fs.mkdirSync(writeDir, { recursive: true });
    fs.writeFileSync(STUDY_HOURS_FILE_WRITE, JSON.stringify(studyRecordsStore, null, 2), 'utf8');
  } catch (e) {
    console.warn('Persist studyHours warning:', e);
  }
}

export async function getAllServerStudyRecords(): Promise<ServerStudyRecord[]> {
  return [...studyRecordsStore];
}

export async function saveServerStudyRecords(records: ServerStudyRecord[]): Promise<void> {
  studyRecordsStore = records;
  persistStudyRecords();
}

// -------------------------------------------------------------
// Long-Term Persistence: Class Attendance
// -------------------------------------------------------------
const ATTENDANCE_FILE_WRITE = path.join(writeDir, 'attendance.json');
const ATTENDANCE_FILE_READ = path.join(readDir, 'attendance.json');

export interface ServerAttendanceRecord {
  classId: string;
  watchedMinutes: number;
  percent: number;
  completed: boolean;
  lastWatchedAt: string;
}

function loadPersistedAttendance(): Record<string, ServerAttendanceRecord> {
  try {
    if (fs.existsSync(ATTENDANCE_FILE_WRITE)) {
      const raw = fs.readFileSync(ATTENDANCE_FILE_WRITE, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed;
    }
    if (ATTENDANCE_FILE_WRITE !== ATTENDANCE_FILE_READ && fs.existsSync(ATTENDANCE_FILE_READ)) {
      const raw = fs.readFileSync(ATTENDANCE_FILE_READ, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch (e) {
    console.warn('Failed to read attendance.json:', e);
  }
  return {};
}

let attendanceStore: Record<string, ServerAttendanceRecord> = loadPersistedAttendance();

function persistAttendance() {
  try {
    if (!fs.existsSync(writeDir)) fs.mkdirSync(writeDir, { recursive: true });
    fs.writeFileSync(ATTENDANCE_FILE_WRITE, JSON.stringify(attendanceStore, null, 2), 'utf8');
  } catch (e) {
    console.warn('Persist attendance warning:', e);
  }
}

export async function getServerAttendance(): Promise<Record<string, ServerAttendanceRecord>> {
  return { ...attendanceStore };
}

export async function saveServerAttendance(map: Record<string, ServerAttendanceRecord>): Promise<void> {
  attendanceStore = { ...attendanceStore, ...map };
  persistAttendance();
}
