import type { JEEClass, PushSubscriptionData } from '../types/class.ts';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.resolve(process.cwd(), 'data');

// Initialize Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseKey) {
  console.warn('⚠️ Supabase credentials missing! Falling back to file-based storage.');
}

const supabase = supabaseUrl && supabaseKey 
  ? createClient(supabaseUrl, supabaseKey)
  : null;

// Ensure data directory exists for fallback
if (!fs.existsSync(DATA_DIR)) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (e) {
    // Ignore error
  }
}

let subscriptionsStore: PushSubscriptionData[] = [];

// =====================================================
// CLASSES - Now using Supabase with file fallback
// =====================================================

const CLASSES_FILE = path.join(DATA_DIR, 'classes.json');

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
      notification_15m_sent: false,
      notification_live_sent: false,
      created_at: new Date(now - 86400000).toISOString(),
    },
  ];
}

function loadPersistedClasses(): JEEClass[] {
  try {
    if (fs.existsSync(CLASSES_FILE)) {
      const raw = fs.readFileSync(CLASSES_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn('Failed to read classes.json:', e);
  }
  return [];
}

function persistClasses(classes: JEEClass[]) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(CLASSES_FILE, JSON.stringify(classes, null, 2), 'utf8');
  } catch (e) {
    console.error('Failed to write classes.json:', e);
  }
}

let classesStore: JEEClass[] = loadPersistedClasses();

export async function getAllClasses(): Promise<JEEClass[]> {
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('classes')
        .select('*')
        .order('start_at', { ascending: true });

      if (error) throw error;
      if (data) {
        classesStore = data as JEEClass[];
        // Sync to file as backup
        persistClasses(classesStore);
        return classesStore;
      }
    } catch (err) {
      console.error('Error fetching from Supabase:', err);
      // Fall back to in-memory
    }
  }

  return [...classesStore].sort(
    (a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime()
  );
}

export async function getClassById(id: string): Promise<JEEClass | null> {
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('classes')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      return (data as JEEClass) || null;
    } catch (err) {
      console.error('Error fetching class by ID:', err);
    }
  }

  const found = classesStore.find((c) => c.id === id);
  return found || null;
}

export async function createClass(data: Omit<JEEClass, 'id' | 'created_at'>): Promise<JEEClass> {
  const newClass: JEEClass = {
    ...data,
    id: `class-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    created_at: new Date().toISOString(),
    notification_15m_sent: false,
    notification_live_sent: false,
  };

  if (supabase) {
    try {
      const { error } = await supabase
        .from('classes')
        .insert([newClass]);

      if (error) throw error;
    } catch (err) {
      console.error('Error creating class in Supabase:', err);
    }
  }

  classesStore.push(newClass);
  persistClasses(classesStore);
  return newClass;
}

export async function updateClass(id: string, updates: Partial<JEEClass>): Promise<JEEClass | null> {
  const index = classesStore.findIndex((c) => c.id === id);
  if (index === -1) return null;

  classesStore[index] = {
    ...classesStore[index],
    ...updates,
  };

  if (supabase) {
    try {
      const { error } = await supabase
        .from('classes')
        .update(updates)
        .eq('id', id);

      if (error) throw error;
    } catch (err) {
      console.error('Error updating class in Supabase:', err);
    }
  }

  persistClasses(classesStore);
  return classesStore[index];
}

export async function deleteClass(id: string): Promise<boolean> {
  const initialLength = classesStore.length;
  classesStore = classesStore.filter((c) => c.id !== id);
  const deleted = classesStore.length < initialLength;

  if (deleted) {
    if (supabase) {
      try {
        const { error } = await supabase
          .from('classes')
          .delete()
          .eq('id', id);

        if (error) throw error;
      } catch (err) {
        console.error('Error deleting class in Supabase:', err);
      }
    }
    persistClasses(classesStore);
  }

  return deleted;
}

export async function clearAllClasses(): Promise<void> {
  classesStore = [];

  if (supabase) {
    try {
      const { error } = await supabase
        .from('classes')
        .delete()
        .neq('id', ''); // Delete all

      if (error) throw error;
    } catch (err) {
      console.error('Error clearing classes in Supabase:', err);
    }
  }

  persistClasses(classesStore);
}

export async function resetClasses(): Promise<JEEClass[]> {
  classesStore = generateInitialClasses();

  if (supabase) {
    try {
      // Clear existing
      await supabase
        .from('classes')
        .delete()
        .neq('id', '');

      // Insert fresh samples
      const { error } = await supabase
        .from('classes')
        .insert(classesStore);

      if (error) throw error;
    } catch (err) {
      console.error('Error resetting classes in Supabase:', err);
    }
  }

  persistClasses(classesStore);
  return await getAllClasses();
}

export async function savePushSubscription(sub: PushSubscriptionData): Promise<void> {
  const exists = subscriptionsStore.find((s) => s.endpoint === sub.endpoint);
  if (!exists) {
    subscriptionsStore.push(sub);
  }
}

export async function getPushSubscriptions(): Promise<PushSubscriptionData[]> {
  return [...subscriptionsStore];
}

// =====================================================
// BOOKMARKS - File-based with future Supabase support
// =====================================================

const BOOKMARKS_FILE = path.join(DATA_DIR, 'bookmarks.json');

export interface ServerBookmark {
  id: string;
  classId: string;
  seconds: number;
  timestampFormatted: string;
  category: 'mistake' | 'formula' | 'derivation' | 'doubt';
  note: string;
  createdAt: string;
}

function loadPersistedBookmarks(): ServerBookmark[] {
  try {
    if (fs.existsSync(BOOKMARKS_FILE)) {
      const raw = fs.readFileSync(BOOKMARKS_FILE, 'utf8');
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
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(BOOKMARKS_FILE, JSON.stringify(bookmarksStore, null, 2), 'utf8');
  } catch (e) {
    console.error('Failed to write bookmarks.json:', e);
  }
}

export async function getAllServerBookmarks(): Promise<ServerBookmark[]> {
  return [...bookmarksStore];
}

export async function addServerBookmark(bm: ServerBookmark): Promise<ServerBookmark> {
  bookmarksStore.push(bm);
  persistBookmarks();
  return bm;
}

export async function deleteServerBookmark(id: string): Promise<boolean> {
  const initialLength = bookmarksStore.length;
  bookmarksStore = bookmarksStore.filter(b => b.id !== id);
  if (bookmarksStore.length < initialLength) {
    persistBookmarks();
    return true;
  }
  return false;
}

// =====================================================
// STUDY RECORDS - File-based with future Supabase support
// =====================================================

const STUDY_HOURS_FILE = path.join(DATA_DIR, 'studyHours.json');

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
    if (fs.existsSync(STUDY_HOURS_FILE)) {
      const raw = fs.readFileSync(STUDY_HOURS_FILE, 'utf8');
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
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(STUDY_HOURS_FILE, JSON.stringify(studyRecordsStore, null, 2), 'utf8');
  } catch (e) {
    console.error('Failed to write studyHours.json:', e);
  }
}

export async function getAllServerStudyRecords(): Promise<ServerStudyRecord[]> {
  return [...studyRecordsStore];
}

export async function saveServerStudyRecords(records: ServerStudyRecord[]): Promise<void> {
  studyRecordsStore = records;
  persistStudyRecords();
}

// =====================================================
// ATTENDANCE - File-based with future Supabase support
// =====================================================

const ATTENDANCE_FILE = path.join(DATA_DIR, 'attendance.json');

export interface ServerAttendanceRecord {
  classId: string;
  watchedMinutes: number;
  percent: number;
  completed: boolean;
  lastWatchedAt: string;
}

function loadPersistedAttendance(): Record<string, ServerAttendanceRecord> {
  try {
    if (fs.existsSync(ATTENDANCE_FILE)) {
      const raw = fs.readFileSync(ATTENDANCE_FILE, 'utf8');
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
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(ATTENDANCE_FILE, JSON.stringify(attendanceStore, null, 2), 'utf8');
  } catch (e) {
    console.error('Failed to write attendance.json:', e);
  }
}

export async function getServerAttendance(): Promise<Record<string, ServerAttendanceRecord>> {
  return { ...attendanceStore };
}

export async function saveServerAttendance(map: Record<string, ServerAttendanceRecord>): Promise<void> {
  attendanceStore = { ...attendanceStore, ...map };
  persistAttendance();
}
