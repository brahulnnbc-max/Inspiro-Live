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
