import type { JEEClass, PushSubscriptionData } from '../types/class.ts';


  ];
}

import fs from 'fs';
import path from 'path';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const CLASSES_FILE = path.join(DATA_DIR, 'classes.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (e) {
    // Ignore error
  }
}

function loadPersistedClasses(): JEEClass[] {
  try {
    if (fs.existsSync(CLASSES_FILE)) {
      const raw = fs.readFileSync(CLASSES_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed; // returns whatever is saved, even if empty []
      }
    }
  } catch (e) {
    console.warn('Failed to read classes.json:', e);
  }
  return [];
}

function persistClasses() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(CLASSES_FILE, JSON.stringify(classesStore, null, 2), 'utf8');
  } catch (e) {
    console.error('Failed to write classes.json:', e);
  }
}

// In-memory data cache synced with persistent disk storage
let classesStore: JEEClass[] = loadPersistedClasses();
let subscriptionsStore: PushSubscriptionData[] = [];

export async function getAllClasses(): Promise<JEEClass[]> {
  // Sort by start_at ascending
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

export async function savePushSubscription(sub: PushSubscriptionData): Promise<void> {
  const exists = subscriptionsStore.find((s) => s.endpoint === sub.endpoint);
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

// -------------------------------------------------------------
// Long-Term Persistence: Study Records & Real-Time Hours
// -------------------------------------------------------------
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

// -------------------------------------------------------------
// Long-Term Persistence: Class Attendance
// -------------------------------------------------------------
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

