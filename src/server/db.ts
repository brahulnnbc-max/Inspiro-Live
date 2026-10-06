import type { JEEClass, PushSubscriptionData } from '../types/class.ts';
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

// Default seeded classes - empty by default so user has absolute control over timetable
function generateInitialClasses(): JEEClass[] {
  return [];
}

// -------------------------------------------------------------
// Cloud Persistence via Supabase (PostgreSQL)
// -------------------------------------------------------------
function getSupabaseClient() {
  let rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    '';

  if (!rawUrl || !key) return null;

  // Auto-normalize if user pasted postgresql:// connection string instead of https://
  if (rawUrl.startsWith('postgresql://') || rawUrl.startsWith('postgres://')) {
    const match = rawUrl.match(/postgres\.([a-z0-9]+):/i);
    if (match && match[1]) {
      rawUrl = `https://${match[1]}.supabase.co`;
    }
  }

  try {
    return createClient(rawUrl, key, {
      auth: { persistSession: false },
    });
  } catch (err) {
    console.warn('Failed to initialize Supabase client:', err);
    return null;
  }
}

const supabase = getSupabaseClient();

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DATA_DIR = path.resolve(process.cwd(), 'data');
const CLASSES_FILE = path.join(DATA_DIR, 'classes.json');

function loadPersistedClasses(): JEEClass[] {
  try {
    if (fs.existsSync(CLASSES_FILE)) {
      const raw = fs.readFileSync(CLASSES_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {}
  return [];
}

let classesStore: JEEClass[] = loadPersistedClasses();
let subscriptionsStore: PushSubscriptionData[] = [];

export async function getAllClasses(): Promise<JEEClass[]> {
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('classes')
        .select('*')
        .order('start_at', { ascending: true });

      if (!error && Array.isArray(data)) {
        classesStore = data.map((row: any) => ({
          id: String(row.id),
          title: row.title,
          subject: row.subject,
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
        return classesStore;
      }
    } catch (sbErr) {
      console.warn('Supabase fetch classes error:', sbErr);
    }
  }

  return [...classesStore].sort(
    (a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime()
  );
}

export async function getClassById(id: string): Promise<JEEClass | null> {
  if (supabase) {
    try {
      const { data, error } = await supabase.from('classes').select('*').eq('id', id).single();
      if (!error && data) {
        return {
          id: String(data.id),
          title: data.title,
          subject: data.subject,
          faculty: data.faculty || 'Faculty',
          topic: data.topic || '',
          description: data.description || '',
          youtube_url: data.youtube_url,
          youtube_id: data.youtube_id,
          start_at: data.start_at,
          duration_min: Number(data.duration_min),
          is_embeddable: data.is_embeddable !== false,
          thumbnail_url: data.thumbnail_url || `https://img.youtube.com/vi/${data.youtube_id}/hqdefault.jpg`,
          created_at: data.created_at,
        };
      }
    } catch (e) {}
  }

  const found = classesStore.find((c) => c.id === id);
  return found || null;
}

export async function createClass(data: Omit<JEEClass, 'id' | 'created_at'> & { id?: string }): Promise<JEEClass> {
  const localId = data.id || `class-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const created_at = new Date().toISOString();

  if (supabase) {
    try {
      const insertPayload: any = {
        title: data.title,
        subject: data.subject,
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

      const { data: inserted, error } = await supabase
        .from('classes')
        .insert(insertPayload)
        .select()
        .single();

      if (!error && inserted) {
        const savedClass: JEEClass = {
          ...data,
          id: String(inserted.id),
          created_at: inserted.created_at || created_at,
        };
        classesStore.push(savedClass);
        return savedClass;
      }
    } catch (sbErr) {
      console.warn('Supabase createClass warning:', sbErr);
    }
  }

  const newClass: JEEClass = {
    ...data,
    id: localId,
    created_at,
  };
  classesStore.push(newClass);
  return newClass;
}

export async function updateClass(id: string, updates: Partial<JEEClass>): Promise<JEEClass | null> {
  if (supabase) {
    try {
      const updatePayload: any = {};
      if (updates.title) updatePayload.title = updates.title;
      if (updates.subject) updatePayload.subject = updates.subject;
      if (updates.faculty) updatePayload.faculty = updates.faculty;
      if (updates.topic !== undefined) updatePayload.topic = updates.topic;
      if (updates.description !== undefined) updatePayload.description = updates.description;
      if (updates.youtube_url) updatePayload.youtube_url = updates.youtube_url;
      if (updates.youtube_id) updatePayload.youtube_id = updates.youtube_id;
      if (updates.start_at) updatePayload.start_at = updates.start_at;
      if (updates.duration_min) updatePayload.duration_min = Number(updates.duration_min);
      if (updates.is_embeddable !== undefined) updatePayload.is_embeddable = updates.is_embeddable;

      await supabase.from('classes').update(updatePayload).eq('id', id);
    } catch (e) {}
  }

  const index = classesStore.findIndex((c) => c.id === id);
  if (index === -1) return null;
  classesStore[index] = { ...classesStore[index], ...updates };
  return classesStore[index];
}

export async function deleteClass(id: string): Promise<boolean> {
  if (supabase) {
    try {
      await supabase.from('classes').delete().eq('id', id);
    } catch (e) {}
  }

  classesStore = classesStore.filter((c) => c.id !== id);
  return true;
}

export async function clearAllClasses(): Promise<void> {
  if (supabase) {
    try {
      await supabase.from('classes').delete().neq('duration_min', -999);
    } catch (e) {}
  }

  classesStore = [];
}

export async function resetClasses(): Promise<JEEClass[]> {
  await clearAllClasses();
  return [];
}

export async function syncClasses(clientClasses: JEEClass[]): Promise<JEEClass[]> {
  if (!Array.isArray(clientClasses)) return getAllClasses();

  if (supabase && clientClasses.length > 0) {
    try {
      for (const cls of clientClasses) {
        if (!cls.title || !cls.youtube_url || !cls.start_at) continue;
        const row: any = {
          title: cls.title,
          subject: cls.subject,
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
          await supabase.from('classes').upsert(row);
        } else {
          const { data: existing } = await supabase
            .from('classes')
            .select('id')
            .eq('start_at', cls.start_at)
            .limit(1);
          if (!existing || existing.length === 0) {
            await supabase.from('classes').insert(row);
          }
        }
      }
      return await getAllClasses();
    } catch (e) {
      console.warn('Supabase syncClasses warning:', e);
    }
  }

  return getAllClasses();
}

export async function savePushSubscription(sub: PushSubscriptionData): Promise<void> {
  if (supabase) {
    try {
      await supabase.from('push_subscriptions').upsert({
        endpoint: sub.endpoint,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
        user_agent: sub.userAgent || '',
      });
    } catch (e) {}
  }
}

export async function getPushSubscriptions(): Promise<PushSubscriptionData[]> {
  if (supabase) {
    try {
      const { data, error } = await supabase.from('push_subscriptions').select('*');
      if (!error && Array.isArray(data)) {
        return data.map((r: any) => ({
          endpoint: r.endpoint,
          keys: {
            p256dh: r.p256dh,
            auth: r.auth,
          },
          userAgent: r.user_agent,
        }));
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

let bookmarksStore: ServerBookmark[] = [];

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
  return bm;
}

export async function deleteServerBookmark(id: string): Promise<boolean> {
  bookmarksStore = bookmarksStore.filter((b) => b.id !== id);
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

let studyRecordsStore: ServerStudyRecord[] = [];

export async function getAllServerStudyRecords(): Promise<ServerStudyRecord[]> {
  return [...studyRecordsStore];
}

export async function saveServerStudyRecords(records: ServerStudyRecord[]): Promise<void> {
  studyRecordsStore = records;
}

export interface ServerAttendanceRecord {
  classId: string;
  watchedMinutes: number;
  percent: number;
  completed: boolean;
  lastWatchedAt: string;
}

let attendanceStore: Record<string, ServerAttendanceRecord> = {};

export async function getServerAttendance(): Promise<Record<string, ServerAttendanceRecord>> {
  return { ...attendanceStore };
}

export async function saveServerAttendance(map: Record<string, ServerAttendanceRecord>): Promise<void> {
  attendanceStore = { ...attendanceStore, ...map };
        }
