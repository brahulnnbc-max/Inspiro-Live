import type { JEEClass, PushSubscriptionData } from '../types/class.ts';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

// Default seeded classes - empty by default so user has absolute control over timetable
export function generateInitialClasses(): JEEClass[] {
  return [];
}

export const DUMMY_IDS = new Set([
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
  if (cls.id && DUMMY_IDS.has(cls.id)) return true;
  if (cls.faculty && DUMMY_FACULTY.has(cls.faculty)) return true;
  return false;
}

export function normalizeSubject(subject: string): 'Physics' | 'Chemistry' | 'Mathematics' {
  const s = (subject || '').trim().toLowerCase();
  if (s.includes('chem')) return 'Chemistry';
  if (s.includes('math')) return 'Mathematics';
  return 'Physics';
}

// -------------------------------------------------------------
// Cloud Persistence via Supabase REST API (Zero external npm packages needed)
// -------------------------------------------------------------
function getSupabaseConfig(): { url: string; key: string } | null {
  let rawUrl = (
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    ''
  ).trim();
  const key = (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    ''
  ).trim();

  if (!rawUrl || !key) return null;

  // Ignore default template / placeholder values that cause ENOTFOUND errors
  if (
    rawUrl.includes('your-project') ||
    rawUrl.includes('placeholder') ||
    rawUrl.includes('example.com') ||
    key.includes('your-') ||
    key.includes('placeholder')
  ) {
    return null;
  }

  // Auto-normalize if user pasted postgresql:// connection string instead of https://
  if (rawUrl.startsWith('postgresql://') || rawUrl.startsWith('postgres://')) {
    const match = rawUrl.match(/postgres\.([a-z0-9]+):/i);
    if (match && match[1]) {
      rawUrl = `https://${match[1]}.supabase.co`;
    }
  }

  rawUrl = rawUrl.replace(/\/+$/, '');
  return { url: rawUrl, key };
}

const supabaseConfig = getSupabaseConfig();

function getSupabaseHeaders(key: string) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  };
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DATA_DIR = path.resolve(process.cwd(), 'data');
const CLASSES_FILE = path.join(DATA_DIR, 'classes.json');
const TMP_CLASSES_FILE = path.join('/tmp', 'inspiro_classes.json');

function loadPersistedClasses(): JEEClass[] {
  // 1. Try writable /tmp first (persists across warm lambda invocations in serverless)
  try {
    if (fs.existsSync(TMP_CLASSES_FILE)) {
      const raw = fs.readFileSync(TMP_CLASSES_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter((c) => !isDummyClass(c));
      }
    }
  } catch (e) {}

  // 2. Try repo data/classes.json
  try {
    if (fs.existsSync(CLASSES_FILE)) {
      const raw = fs.readFileSync(CLASSES_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter((c) => !isDummyClass(c));
      }
    }
  } catch (e) {}
  return [];
}

function persistClasses(): void {
  const clean = classesStore.filter((c) => !isDummyClass(c));
  const dataStr = JSON.stringify(clean, null, 2);

  // Write to /tmp (always writable in Vercel serverless / Lambda / Cloud Run)
  try {
    fs.writeFileSync(TMP_CLASSES_FILE, dataStr, 'utf8');
  } catch (e) {}

  // Write to data/classes.json (for local development & persistent disk)
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(CLASSES_FILE, dataStr, 'utf8');
  } catch (e) {}
}

let classesStore: JEEClass[] = loadPersistedClasses();
let classesUpdatedAt: number = Date.now();
let subscriptionsStore: PushSubscriptionData[] = [];

export async function getAllClasses(): Promise<JEEClass[]> {
  const result = await getAllClassesWithTimestamp();
  return result.classes;
}

export async function getAllClassesWithTimestamp(): Promise<{ classes: JEEClass[]; updatedAt: number }> {
  const config = getSupabaseConfig();
  if (config) {
    try {
      const res = await fetch(`${config.url}/rest/v1/classes?select=*&order=start_at.asc`, {
        headers: getSupabaseHeaders(config.key),
      });

      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          // Clean out any dummy classes found in Supabase
          const validRows = data.filter((row: any) => !isDummyClass(row));
          const dummyRows = data.filter((row: any) => isDummyClass(row));

          // Purge dummy rows from Supabase in background
          if (dummyRows.length > 0) {
            for (const d of dummyRows) {
              if (d.id) {
                fetch(`${config.url}/rest/v1/classes?id=eq.${d.id}`, {
                  method: 'DELETE',
                  headers: getSupabaseHeaders(config.key),
                }).catch(() => {});
              }
            }
          }

          classesStore = validRows.map((row: any) => ({
            id: String(row.id),
            title: row.title,
            subject: normalizeSubject(row.subject),
            faculty: row.faculty || 'Faculty',
            topic: row.topic || '',
            description: row.description || '',
            youtube_url: row.youtube_url,
            youtube_id: row.youtube_id,
            start_at: row.start_at,
            duration_min: Number(row.duration_min),
            is_embeddable: row.is_embeddable !== false,
            thumbnail_url: row.thumbnail_url || (row.youtube_id ? `https://img.youtube.com/vi/${row.youtube_id}/hqdefault.jpg` : ''),
            created_at: row.created_at || new Date().toISOString(),
          }));
          persistClasses();
          return { classes: classesStore, updatedAt: classesUpdatedAt };
        }
      } else {
        const errText = await res.text();
        console.error(`[Supabase getAllClasses error ${res.status}]: ${errText}`);
      }
    } catch (sbErr) {
      console.warn('Supabase fetch classes error, falling back to local cache:', sbErr);
    }
  }

  const clean = [...classesStore]
    .filter((c) => !isDummyClass(c))
    .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
  return { classes: clean, updatedAt: classesUpdatedAt };
}

export async function getClassById(id: string): Promise<JEEClass | null> {
  const config = getSupabaseConfig();
  if (config) {
    try {
      const res = await fetch(`${config.url}/rest/v1/classes?id=eq.${id}&select=*`, {
        headers: getSupabaseHeaders(config.key),
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data[0] && !isDummyClass(data[0])) {
          const row = data[0];
          return {
            id: String(row.id),
            title: row.title,
            subject: normalizeSubject(row.subject),
            faculty: row.faculty || 'Faculty',
            topic: row.topic || '',
            description: row.description || '',
            youtube_url: row.youtube_url,
            youtube_id: row.youtube_id,
            start_at: row.start_at,
            duration_min: Number(row.duration_min),
            is_embeddable: row.is_embeddable !== false,
            thumbnail_url: row.thumbnail_url || (row.youtube_id ? `https://img.youtube.com/vi/${row.youtube_id}/hqdefault.jpg` : ''),
            created_at: row.created_at,
          };
        }
      }
    } catch (e) {}
  }

  const found = classesStore.find((c) => c.id === id && !isDummyClass(c));
  return found || null;
}

export async function createClass(data: Omit<JEEClass, 'id' | 'created_at'> & { id?: string }): Promise<JEEClass> {
  const config = getSupabaseConfig();
  const normalizedSubject = normalizeSubject(data.subject);
  const localId = data.id || `class-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const created_at = new Date().toISOString();

  if (config) {
    try {
      const insertPayload: any = {
        title: data.title,
        subject: normalizedSubject,
        faculty: data.faculty || 'Faculty',
        topic: data.topic || '',
        description: data.description || '',
        youtube_url: data.youtube_url,
        youtube_id: data.youtube_id,
        start_at: data.start_at,
        duration_min: Number(data.duration_min),
        is_embeddable: data.is_embeddable !== false,
      };

      if (data.id && UUID_REGEX.test(data.id)) {
        insertPayload.id = data.id;
      }

      const res = await fetch(`${config.url}/rest/v1/classes`, {
        method: 'POST',
        headers: {
          ...getSupabaseHeaders(config.key),
          Prefer: 'return=representation',
        },
        body: JSON.stringify(insertPayload),
      });

      if (res.ok) {
        const inserted = await res.json();
        const row = Array.isArray(inserted) ? inserted[0] : inserted;
        if (row && row.id) {
          const savedClass: JEEClass = {
            ...data,
            subject: normalizedSubject,
            id: String(row.id),
            created_at: row.created_at || created_at,
          };
          classesStore = classesStore.filter((c) => c.id !== savedClass.id && !isDummyClass(c));
          classesStore.push(savedClass);
          classesUpdatedAt = Date.now();
          persistClasses();
          return savedClass;
        }
      } else {
        const errText = await res.text();
        console.error(`[Supabase createClass FAILED ${res.status}]: ${errText}`);
      }
    } catch (sbErr) {
      console.error('[Supabase createClass Exception]:', sbErr);
    }
  }

  const newClass: JEEClass = {
    ...data,
    subject: normalizedSubject,
    id: localId,
    created_at,
  };
  classesStore = classesStore.filter((c) => c.id !== localId && !isDummyClass(c));
  classesStore.push(newClass);
  classesUpdatedAt = Date.now();
  persistClasses();
  return newClass;
}

export async function updateClass(id: string, updates: Partial<JEEClass>): Promise<JEEClass | null> {
  const config = getSupabaseConfig();
  if (config) {
    try {
      const updatePayload: any = {};
      if (updates.title) updatePayload.title = updates.title;
      if (updates.subject) updatePayload.subject = normalizeSubject(updates.subject);
      if (updates.faculty) updatePayload.faculty = updates.faculty;
      if (updates.topic !== undefined) updatePayload.topic = updates.topic;
      if (updates.description !== undefined) updatePayload.description = updates.description;
      if (updates.youtube_url) updatePayload.youtube_url = updates.youtube_url;
      if (updates.youtube_id) updatePayload.youtube_id = updates.youtube_id;
      if (updates.start_at) updatePayload.start_at = updates.start_at;
      if (updates.duration_min) updatePayload.duration_min = Number(updates.duration_min);
      if (updates.is_embeddable !== undefined) updatePayload.is_embeddable = updates.is_embeddable;

      const res = await fetch(`${config.url}/rest/v1/classes?id=eq.${id}`, {
        method: 'PATCH',
        headers: getSupabaseHeaders(config.key),
        body: JSON.stringify(updatePayload),
      });
      if (!res.ok) {
        const errText = await res.text();
        console.error(`[Supabase updateClass FAILED ${res.status}]: ${errText}`);
      }
    } catch (e) {
      console.error('[Supabase updateClass Exception]:', e);
    }
  }

  const index = classesStore.findIndex((c) => c.id === id);
  if (index === -1) return null;
  classesStore[index] = {
    ...classesStore[index],
    ...updates,
    subject: updates.subject ? normalizeSubject(updates.subject) : classesStore[index].subject,
  };
  classesUpdatedAt = Date.now();
  persistClasses();
  return classesStore[index];
}

export async function deleteClass(id: string): Promise<boolean> {
  const config = getSupabaseConfig();
  if (config) {
    try {
      const res = await fetch(`${config.url}/rest/v1/classes?id=eq.${id}`, {
        method: 'DELETE',
        headers: getSupabaseHeaders(config.key),
      });
      if (!res.ok) {
        const errText = await res.text();
        console.error(`[Supabase deleteClass FAILED ${res.status}]: ${errText}`);
      }
    } catch (e) {
      console.error('[Supabase deleteClass Exception]:', e);
    }
  }

  classesStore = classesStore.filter((c) => c.id !== id);
  classesUpdatedAt = Date.now();
  persistClasses();
  return true;
}

export async function clearAllClasses(): Promise<void> {
  const config = getSupabaseConfig();
  if (config) {
    try {
      const res = await fetch(`${config.url}/rest/v1/classes?duration_min=gt.0`, {
        method: 'DELETE',
        headers: getSupabaseHeaders(config.key),
      });
      if (!res.ok) {
        const errText = await res.text();
        console.error(`[Supabase clearAllClasses FAILED ${res.status}]: ${errText}`);
      }
    } catch (e) {}
  }

  classesStore = [];
  classesUpdatedAt = Date.now();
  persistClasses();
}

export async function resetClasses(): Promise<JEEClass[]> {
  await clearAllClasses();
  return [];
}

export async function syncClasses(clientClasses: JEEClass[], clientUpdatedAt?: number): Promise<JEEClass[]> {
  if (!Array.isArray(clientClasses)) return getAllClasses();

  // Strip all dummy classes immediately
  const cleanList = clientClasses.filter((c) => !isDummyClass(c));
  classesStore = cleanList;
  classesUpdatedAt = typeof clientUpdatedAt === 'number' && clientUpdatedAt > 0 ? clientUpdatedAt : Date.now();
  persistClasses();

  const config = getSupabaseConfig();
  if (config) {
    try {
      if (cleanList.length === 0) {
        await fetch(`${config.url}/rest/v1/classes?duration_min=gt.0`, {
          method: 'DELETE',
          headers: getSupabaseHeaders(config.key),
        });
      } else {
        for (const cls of cleanList) {
          if (!cls.title || !cls.youtube_url || !cls.start_at) continue;
          const row: any = {
            title: cls.title,
            subject: normalizeSubject(cls.subject),
            faculty: cls.faculty || 'Faculty',
            topic: cls.topic || '',
            description: cls.description || '',
            youtube_url: cls.youtube_url,
            youtube_id: cls.youtube_id,
            start_at: cls.start_at,
            duration_min: Number(cls.duration_min),
            is_embeddable: cls.is_embeddable !== false,
          };

          if (cls.id && UUID_REGEX.test(cls.id)) {
            row.id = cls.id;
            await fetch(`${config.url}/rest/v1/classes`, {
              method: 'POST',
              headers: {
                ...getSupabaseHeaders(config.key),
                Prefer: 'resolution=merge-duplicates',
              },
              body: JSON.stringify(row),
            });
          } else {
            const checkRes = await fetch(
              `${config.url}/rest/v1/classes?start_at=eq.${encodeURIComponent(cls.start_at)}&select=id`,
              { headers: getSupabaseHeaders(config.key) }
            );
            if (checkRes.ok) {
              const existing = await checkRes.json();
              if (!Array.isArray(existing) || existing.length === 0) {
                await fetch(`${config.url}/rest/v1/classes`, {
                  method: 'POST',
                  headers: getSupabaseHeaders(config.key),
                  body: JSON.stringify(row),
                });
              }
            }
          }
        }
      }
    } catch (e) {
      console.warn('Supabase syncClasses warning:', e);
    }
  }

  return cleanList;
}

export async function savePushSubscription(sub: PushSubscriptionData): Promise<void> {
  if (supabaseConfig) {
    try {
      await fetch(`${supabaseConfig.url}/rest/v1/push_subscriptions`, {
        method: 'POST',
        headers: {
          ...getSupabaseHeaders(supabaseConfig.key),
          Prefer: 'resolution=merge-duplicates',
        },
        body: JSON.stringify({
          endpoint: sub.endpoint,
          p256dh: sub.keys.p256dh,
          auth: sub.keys.auth,
          user_agent: sub.userAgent || '',
        }),
      });
    } catch (e) {}
  }
}

export async function getPushSubscriptions(): Promise<PushSubscriptionData[]> {
  if (supabaseConfig) {
    try {
      const res = await fetch(`${supabaseConfig.url}/rest/v1/push_subscriptions?select=*`, {
        headers: getSupabaseHeaders(supabaseConfig.key),
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          return data.map((r: any) => ({
            endpoint: r.endpoint,
            keys: {
              p256dh: r.p256dh,
              auth: r.auth,
            },
            userAgent: r.user_agent,
          }));
        }
      }
    } catch (e) {}
  }
  return [];
}

export interface ServerBookmark {
  id: string;
  classId: string;
  seconds: number;
  timestampFormatted: string;
  category: string;
  note: string;
  createdAt: string;
}

const BOOKMARKS_FILE = path.join(DATA_DIR, 'bookmarks.json');

function loadPersistedBookmarks(): ServerBookmark[] {
  try {
    if (fs.existsSync(BOOKMARKS_FILE)) {
      const raw = fs.readFileSync(BOOKMARKS_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {}
  return [];
}

let bookmarksStore: ServerBookmark[] = loadPersistedBookmarks();

function persistBookmarks(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(BOOKMARKS_FILE, JSON.stringify(bookmarksStore, null, 2), 'utf8');
  } catch (e) {}
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
  bookmarksStore = bookmarksStore.filter((b) => b.id !== id);
  persistBookmarks();
  return true;
}

export interface ServerStudyRecord {
  id: string;
  subject: string;
  durationMinutes: number;
  timestamp: string;
  type: string;
  classTitle?: string;
}

const STUDY_HOURS_FILE = path.join(DATA_DIR, 'studyHours.json');

function loadPersistedStudyRecords(): ServerStudyRecord[] {
  try {
    if (fs.existsSync(STUDY_HOURS_FILE)) {
      const raw = fs.readFileSync(STUDY_HOURS_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {}
  return [];
}

let studyRecordsStore: ServerStudyRecord[] = loadPersistedStudyRecords();

function persistStudyRecords(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(STUDY_HOURS_FILE, JSON.stringify(studyRecordsStore, null, 2), 'utf8');
  } catch (e) {}
}

export async function getAllServerStudyRecords(): Promise<ServerStudyRecord[]> {
  return [...studyRecordsStore];
}

export async function saveServerStudyRecords(records: ServerStudyRecord[]): Promise<void> {
  studyRecordsStore = records;
  persistStudyRecords();
}

export interface ServerAttendanceRecord {
  classId: string;
  watchedMinutes: number;
  percent: number;
  completed: boolean;
  lastWatchedAt: string;
}

const ATTENDANCE_FILE = path.join(DATA_DIR, 'attendance.json');

function loadPersistedAttendance(): Record<string, ServerAttendanceRecord> {
  try {
    if (fs.existsSync(ATTENDANCE_FILE)) {
      const raw = fs.readFileSync(ATTENDANCE_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch (e) {}
  return {};
}

let attendanceStore: Record<string, ServerAttendanceRecord> = loadPersistedAttendance();

function persistAttendance(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(ATTENDANCE_FILE, JSON.stringify(attendanceStore, null, 2), 'utf8');
  } catch (e) {}
}

export async function getServerAttendance(): Promise<Record<string, ServerAttendanceRecord>> {
  return { ...attendanceStore };
}

export async function saveServerAttendance(map: Record<string, ServerAttendanceRecord>): Promise<void> {
  attendanceStore = { ...attendanceStore, ...map };
  persistAttendance();
}
