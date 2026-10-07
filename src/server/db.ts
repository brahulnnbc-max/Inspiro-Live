import type { JEEClass, PushSubscriptionData } from '../types/class.ts';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

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

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function ensureValidUuid(id?: string): string {
  if (id && UUID_REGEX.test(id)) {
    return id;
  }
  return crypto.randomUUID();
}

// -------------------------------------------------------------
// Environment & Supabase Configuration
// -------------------------------------------------------------
const ENV_FILE = path.resolve(process.cwd(), '.env');

export interface SupabaseConfig {
  url: string;
  key: string;
}

export function getSupabaseConfig(): SupabaseConfig | null {
  // Check if .env file has newer vars on disk
  if (fs.existsSync(ENV_FILE)) {
    try {
      const content = fs.readFileSync(ENV_FILE, 'utf8');
      const parsed = dotenv.parse(content);
      for (const [k, v] of Object.entries(parsed)) {
        if (!process.env[k]) {
          process.env[k] = v;
        }
      }
    } catch {}
  }

  let rawUrl = (
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    ''
  ).trim();

  const key = (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
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

function getSupabaseHeaders(key: string) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  };
}

export function maskString(str?: string, keepHead = 8, keepTail = 4): string {
  if (!str) return '';
  if (str.length <= keepHead + keepTail) return '••••••••';
  return `${str.slice(0, keepHead)}••••••••${str.slice(-keepTail)}`;
}

// -------------------------------------------------------------
// Live Health & Status Diagnostics
// -------------------------------------------------------------
export interface SupabaseHealth {
  configured: boolean;
  connected: boolean;
  status: 'connected' | 'paused' | 'auth_error' | 'table_missing' | 'unreachable' | 'not_configured';
  message: string;
  url?: string;
  maskedKey?: string;
  rowCount?: number;
  lastChecked: number;
}

let cachedHealth: SupabaseHealth = {
  configured: false,
  connected: false,
  status: 'not_configured',
  message: 'Supabase URL & API Key not configured. Running on Server Backup.',
  lastChecked: 0,
};

export async function testSupabaseConnection(forceRefresh = true): Promise<SupabaseHealth> {
  const now = Date.now();
  if (!forceRefresh && now - cachedHealth.lastChecked < 10000) {
    return cachedHealth;
  }

  const config = getSupabaseConfig();
  if (!config) {
    cachedHealth = {
      configured: false,
      connected: false,
      status: 'not_configured',
      message: 'No Supabase URL or Key found in environment. Running on Server Backup.',
      lastChecked: now,
    };
    return cachedHealth;
  }

  const maskedUrl = config.url.replace(/^(https?:\/\/)([^.]+)(.*)$/, '$1$2$3');
  const maskedKey = maskString(config.key, 12, 6);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(`${config.url}/rest/v1/classes?select=id&limit=1`, {
      method: 'GET',
      headers: {
        ...getSupabaseHeaders(config.key),
        Prefer: 'count=exact',
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const responseText = await res.text();

    if (res.ok) {
      const contentRange = res.headers.get('content-range') || '';
      const countMatch = contentRange.match(/\/(\d+)/);
      const rowCount = countMatch ? parseInt(countMatch[1], 10) : undefined;

      cachedHealth = {
        configured: true,
        connected: true,
        status: 'connected',
        message: 'Successfully connected to Supabase PostgreSQL database.',
        url: maskedUrl,
        maskedKey,
        rowCount,
        lastChecked: now,
      };
      return cachedHealth;
    }

    // Check for Supabase Free Tier Inactivity Pause
    if (res.status === 503 || responseText.toLowerCase().includes('paused')) {
      cachedHealth = {
        configured: true,
        connected: false,
        status: 'paused',
        message: 'Supabase project is currently paused (Free tier inactivity pause). All classes are safely served from Server Backup.',
        url: maskedUrl,
        maskedKey,
        lastChecked: now,
      };
      return cachedHealth;
    }

    if (res.status === 401 || res.status === 403) {
      cachedHealth = {
        configured: true,
        connected: false,
        status: 'auth_error',
        message: 'Supabase authentication failed. Check your API key or Row Level Security (RLS) policies.',
        url: maskedUrl,
        maskedKey,
        lastChecked: now,
      };
      return cachedHealth;
    }

    if (res.status === 404 || responseText.includes('relation "public.classes" does not exist')) {
      cachedHealth = {
        configured: true,
        connected: false,
        status: 'table_missing',
        message: 'Table "classes" does not exist in Supabase. Run supabase/schema.sql in the Supabase SQL editor.',
        url: maskedUrl,
        maskedKey,
        lastChecked: now,
      };
      return cachedHealth;
    }

    cachedHealth = {
      configured: true,
      connected: false,
      status: 'unreachable',
      message: `Supabase returned HTTP ${res.status}: ${responseText.slice(0, 150)}`,
      url: maskedUrl,
      maskedKey,
      lastChecked: now,
    };
    return cachedHealth;
  } catch (err: any) {
    const isTimeout = err.name === 'AbortError';
    cachedHealth = {
      configured: true,
      connected: false,
      status: 'unreachable',
      message: isTimeout
        ? 'Supabase connection timed out. Free project may be paused or waking up.'
        : `Could not connect to Supabase: ${err.message}`,
      url: maskedUrl,
      maskedKey,
      lastChecked: now,
    };
    return cachedHealth;
  }
}

// -------------------------------------------------------------
// Save Supabase Configuration to .env
// -------------------------------------------------------------
export async function updateSupabaseConfig(url: string, key: string): Promise<SupabaseHealth> {
  const cleanUrl = url.trim().replace(/\/+$/, '');
  const cleanKey = key.trim();

  // 1. Update in-memory process.env immediately
  process.env.SUPABASE_URL = cleanUrl;
  process.env.SUPABASE_ANON_KEY = cleanKey;
  process.env.VITE_SUPABASE_URL = cleanUrl;
  process.env.VITE_SUPABASE_ANON_KEY = cleanKey;
  process.env.NEXT_PUBLIC_SUPABASE_URL = cleanUrl;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = cleanKey;

  // 2. Persist to .env file
  try {
    let existingEnv = '';
    if (fs.existsSync(ENV_FILE)) {
      existingEnv = fs.readFileSync(ENV_FILE, 'utf8');
    }

    const envMap: Record<string, string> = {};
    if (existingEnv) {
      const parsed = dotenv.parse(existingEnv);
      Object.assign(envMap, parsed);
    }

    envMap['SUPABASE_URL'] = cleanUrl;
    envMap['SUPABASE_ANON_KEY'] = cleanKey;
    envMap['VITE_SUPABASE_URL'] = cleanUrl;
    envMap['VITE_SUPABASE_ANON_KEY'] = cleanKey;
    envMap['NEXT_PUBLIC_SUPABASE_URL'] = cleanUrl;
    envMap['NEXT_PUBLIC_SUPABASE_ANON_KEY'] = cleanKey;

    const newContent = Object.entries(envMap)
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');

    fs.writeFileSync(ENV_FILE, newContent + '\n', 'utf8');
  } catch (e) {
    console.warn('Failed to write .env file:', e);
  }

  // 3. Immediately test connection
  return await testSupabaseConnection(true);
}

// -------------------------------------------------------------
// System 2: Local Server Backup Layer (Persistent Disk & Memory)
// -------------------------------------------------------------
const DATA_DIR = path.resolve(process.cwd(), 'data');
const CLASSES_FILE = path.join(DATA_DIR, 'classes.json');
const TMP_CLASSES_FILE = path.join('/tmp', 'inspiro_classes.json');

function loadPersistedClasses(): JEEClass[] {
  let loaded: any[] = [];

  // 1. Try writable /tmp first
  try {
    if (fs.existsSync(TMP_CLASSES_FILE)) {
      const raw = fs.readFileSync(TMP_CLASSES_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        loaded = parsed;
      }
    }
  } catch (e) {}

  // 2. Try repo data/classes.json
  if (loaded.length === 0) {
    try {
      if (fs.existsSync(CLASSES_FILE)) {
        const raw = fs.readFileSync(CLASSES_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          loaded = parsed;
        }
      }
    } catch (e) {}
  }

  // Ensure all classes have valid UUIDs for seamless Supabase compatibility
  return loaded
    .filter((c) => !isDummyClass(c))
    .map((c) => ({
      ...c,
      id: ensureValidUuid(c.id),
      subject: normalizeSubject(c.subject),
    }));
}

let classesStore: JEEClass[] = loadPersistedClasses();
let classesUpdatedAt: number = Date.now();
let subscriptionsStore: PushSubscriptionData[] = [];

function persistClasses(): void {
  const clean = classesStore.filter((c) => !isDummyClass(c));
  const dataStr = JSON.stringify(clean, null, 2);

  // Write to /tmp
  try {
    fs.writeFileSync(TMP_CLASSES_FILE, dataStr, 'utf8');
  } catch (e) {}

  // Write to data/classes.json
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(CLASSES_FILE, dataStr, 'utf8');
  } catch (e) {}
}

// Immediately persist loaded classes if any had IDs normalized to UUIDs
persistClasses();

// -------------------------------------------------------------
// Dual-System Storage Accessors (Supabase Primary + Backup Fallback)
// -------------------------------------------------------------

export async function getOverallStorageStatus() {
  const health = await testSupabaseConnection(false);
  return {
    primary: health,
    backup: {
      engine: 'Server Disk & Memory Backup',
      classesCount: classesStore.length,
      classesFilePath: CLASSES_FILE,
      lastUpdated: classesUpdatedAt,
      isHealthy: true,
    },
    activeEngine: health.connected ? 'supabase' : 'server_backup',
  };
}

export async function getAllClasses(): Promise<JEEClass[]> {
  const result = await getAllClassesWithTimestamp();
  return result.classes;
}

export async function getAllClassesWithTimestamp(): Promise<{
  classes: JEEClass[];
  updatedAt: number;
  storageSource: 'supabase' | 'server_backup';
}> {
  const config = getSupabaseConfig();

  if (config) {
    try {
      const res = await fetch(`${config.url}/rest/v1/classes?select=*&order=start_at.asc`, {
        headers: getSupabaseHeaders(config.key),
      });

      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          const validRows = data.filter((row: any) => !isDummyClass(row));

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

          // Keep Server Backup 100% in sync with Supabase
          classesUpdatedAt = Date.now();
          persistClasses();

          cachedHealth.connected = true;
          cachedHealth.status = 'connected';

          return {
            classes: classesStore,
            updatedAt: classesUpdatedAt,
            storageSource: 'supabase',
          };
        }
      } else {
        const errText = await res.text();
        console.warn(`[Supabase fetch HTTP ${res.status}]: ${errText.slice(0, 100)} - Falling back to Server Backup`);
        if (res.status === 503 || errText.toLowerCase().includes('paused')) {
          cachedHealth.connected = false;
          cachedHealth.status = 'paused';
        }
      }
    } catch (sbErr: any) {
      console.warn('Supabase fetch failed, smoothly serving from Server Backup:', sbErr.message);
      cachedHealth.connected = false;
      cachedHealth.status = 'unreachable';
    }
  }

  // Fallback to Server Backup
  const clean = [...classesStore]
    .filter((c) => !isDummyClass(c))
    .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());

  return {
    classes: clean,
    updatedAt: classesUpdatedAt,
    storageSource: 'server_backup',
  };
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
  const normalizedSubject = normalizeSubject(data.subject);
  const targetId = ensureValidUuid(data.id);
  const created_at = new Date().toISOString();

  const newClass: JEEClass = {
    ...data,
    subject: normalizedSubject,
    id: targetId,
    created_at,
  };

  // 1. ALWAYS save to Server Backup immediately (Zero data loss guarantee)
  classesStore = classesStore.filter((c) => c.id !== targetId && !isDummyClass(c));
  classesStore.push(newClass);
  classesUpdatedAt = Date.now();
  persistClasses();

  // 2. Save to Supabase Cloud if configured
  const config = getSupabaseConfig();
  if (config) {
    try {
      const insertPayload: any = {
        id: targetId,
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
        thumbnail_url: data.thumbnail_url,
      };

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
          newClass.id = String(row.id);
          newClass.created_at = row.created_at || created_at;
          persistClasses();
        }
      } else {
        const errText = await res.text();
        console.warn(`[Supabase createClass warning HTTP ${res.status}]: ${errText.slice(0, 100)} - Safely saved in Server Backup.`);
      }
    } catch (sbErr: any) {
      console.warn('Supabase createClass error, preserved in Server Backup:', sbErr.message);
    }
  }

  return newClass;
}

export async function updateClass(id: string, updates: Partial<JEEClass>): Promise<JEEClass | null> {
  const index = classesStore.findIndex((c) => c.id === id);
  if (index === -1) return null;

  classesStore[index] = {
    ...classesStore[index],
    ...updates,
    subject: updates.subject ? normalizeSubject(updates.subject) : classesStore[index].subject,
  };
  classesUpdatedAt = Date.now();
  persistClasses();

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
      if (updates.thumbnail_url !== undefined) updatePayload.thumbnail_url = updates.thumbnail_url;

      await fetch(`${config.url}/rest/v1/classes?id=eq.${id}`, {
        method: 'PATCH',
        headers: getSupabaseHeaders(config.key),
        body: JSON.stringify(updatePayload),
      });
    } catch (e: any) {
      console.warn('Supabase updateClass error, saved in Server Backup:', e.message);
    }
  }

  return classesStore[index];
}

export async function deleteClass(id: string): Promise<boolean> {
  classesStore = classesStore.filter((c) => c.id !== id);
  classesUpdatedAt = Date.now();
  persistClasses();

  const config = getSupabaseConfig();
  if (config) {
    try {
      await fetch(`${config.url}/rest/v1/classes?id=eq.${id}`, {
        method: 'DELETE',
        headers: getSupabaseHeaders(config.key),
      });
    } catch (e: any) {
      console.warn('Supabase deleteClass error, deleted from Server Backup:', e.message);
    }
  }

  return true;
}

export async function clearAllClasses(): Promise<void> {
  classesStore = [];
  classesUpdatedAt = Date.now();
  persistClasses();

  const config = getSupabaseConfig();
  if (config) {
    try {
      await fetch(`${config.url}/rest/v1/classes?duration_min=gt.0`, {
        method: 'DELETE',
        headers: getSupabaseHeaders(config.key),
      });
    } catch (e) {}
  }
}

export async function resetClasses(): Promise<JEEClass[]> {
  await clearAllClasses();
  return [];
}

// -------------------------------------------------------------
// Two-Way Sync Utilities (Backup <-> Supabase)
// -------------------------------------------------------------

export async function pushBackupToSupabase(): Promise<{ success: boolean; count: number; error?: string }> {
  const config = getSupabaseConfig();
  if (!config) {
    return { success: false, count: 0, error: 'Supabase URL & API Key are not configured.' };
  }

  const cleanList = classesStore.filter((c) => !isDummyClass(c));
  if (cleanList.length === 0) {
    return { success: true, count: 0 };
  }

  let successCount = 0;
  const errors: string[] = [];

  for (const cls of cleanList) {
    const row = {
      id: ensureValidUuid(cls.id),
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
      thumbnail_url: cls.thumbnail_url || (cls.youtube_id ? `https://img.youtube.com/vi/${cls.youtube_id}/hqdefault.jpg` : ''),
    };

    try {
      const res = await fetch(`${config.url}/rest/v1/classes`, {
        method: 'POST',
        headers: {
          ...getSupabaseHeaders(config.key),
          Prefer: 'resolution=merge-duplicates',
        },
        body: JSON.stringify(row),
      });

      if (res.ok) {
        successCount++;
      } else {
        const text = await res.text();
        errors.push(`Row ${row.title}: ${text.slice(0, 80)}`);
      }
    } catch (e: any) {
      errors.push(`Row ${row.title}: ${e.message}`);
    }
  }

  if (successCount > 0) {
    return { success: true, count: successCount, error: errors.length > 0 ? errors.join('; ') : undefined };
  }

  return { success: false, count: 0, error: errors.join('; ') || 'Failed to push classes to Supabase' };
}

export async function pullFromSupabase(): Promise<{ success: boolean; count: number; error?: string }> {
  const config = getSupabaseConfig();
  if (!config) {
    return { success: false, count: 0, error: 'Supabase URL & API Key are not configured.' };
  }

  try {
    const res = await fetch(`${config.url}/rest/v1/classes?select=*&order=start_at.asc`, {
      headers: getSupabaseHeaders(config.key),
    });

    if (!res.ok) {
      const text = await res.text();
      return { success: false, count: 0, error: `Supabase returned HTTP ${res.status}: ${text}` };
    }

    const data = await res.json();
    if (!Array.isArray(data)) {
      return { success: false, count: 0, error: 'Invalid response format from Supabase' };
    }

    const validRows = data.filter((row: any) => !isDummyClass(row));
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

    classesUpdatedAt = Date.now();
    persistClasses();

    return { success: true, count: classesStore.length };
  } catch (err: any) {
    return { success: false, count: 0, error: err.message };
  }
}

export async function syncClasses(clientClasses: JEEClass[], clientUpdatedAt?: number): Promise<JEEClass[]> {
  if (!Array.isArray(clientClasses)) return getAllClasses();

  const cleanList = clientClasses
    .filter((c) => !isDummyClass(c))
    .map((c) => ({
      ...c,
      id: ensureValidUuid(c.id),
      subject: normalizeSubject(c.subject),
    }));

  classesStore = cleanList;
  classesUpdatedAt = typeof clientUpdatedAt === 'number' && clientUpdatedAt > 0 ? clientUpdatedAt : Date.now();
  persistClasses();

  // Background push to Supabase if available
  pushBackupToSupabase().catch(() => {});

  return cleanList;
}

// -------------------------------------------------------------
// Push Subscriptions
// -------------------------------------------------------------
export async function savePushSubscription(sub: PushSubscriptionData): Promise<void> {
  const config = getSupabaseConfig();
  if (config) {
    try {
      await fetch(`${config.url}/rest/v1/push_subscriptions`, {
        method: 'POST',
        headers: {
          ...getSupabaseHeaders(config.key),
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

  const existingIdx = subscriptionsStore.findIndex((s) => s.endpoint === sub.endpoint);
  if (existingIdx !== -1) {
    subscriptionsStore[existingIdx] = sub;
  } else {
    subscriptionsStore.push(sub);
  }
}

export async function getPushSubscriptions(): Promise<PushSubscriptionData[]> {
  const config = getSupabaseConfig();
  if (config) {
    try {
      const res = await fetch(`${config.url}/rest/v1/push_subscriptions?select=*`, {
        headers: getSupabaseHeaders(config.key),
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
  return subscriptionsStore;
}

// -------------------------------------------------------------
// Bookmarks, Study Hours, Attendance (Local JSON Persistence)
// -------------------------------------------------------------

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
