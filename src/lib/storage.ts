import {
  BroadcastOrientation,
  ComputedClassState,
  LiveSession,
  SessionCategory,
  SlideDescriptor,
  Subject,
} from '../types';
import { buildSpacedRepetitionSessionsForChapter } from './spacedRepetition';

const DB_NAME = 'gatebell_live_classroom_db_v1';
const DB_VERSION = 1;
const STORE_SESSIONS = 'sessions';
const STORE_MEDIA = 'media_blobs';

export const MISSED_LIVE_COOLDOWN_MS = 12 * 60 * 60 * 1000; // 12 hours immediate vault lock on missed live broadcast

// Automatic in-memory fallback when IndexedDB is blocked (e.g. strict Incognito / mobile WebViews)
const memorySessionsFallback = new Map<string, LiveSession>();
const memoryMediaFallback = new Map<string, Blob | ArrayBuffer | string>();
let idbPermanentlyUnavailable = false;

function openClassroomDb(): Promise<IDBDatabase> {
  if (idbPermanentlyUnavailable || typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB unavailable'));
  }

  return new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_SESSIONS)) {
          db.createObjectStore(STORE_SESSIONS, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_MEDIA)) {
          db.createObjectStore(STORE_MEDIA);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        idbPermanentlyUnavailable = true;
        reject(req.error || new Error('IndexedDB unavailable'));
      };
    } catch (err) {
      idbPermanentlyUnavailable = true;
      reject(err instanceof Error ? err : new Error('IndexedDB blocked'));
    }
  });
}

export async function saveMediaBlob(
  key: string,
  data: Blob | ArrayBuffer | string
): Promise<void> {
  // Always keep fast reference in memory map as well so immediate reads take 0ms
  memoryMediaFallback.set(key, data);
  try {
    const db = await openClassroomDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_MEDIA, 'readwrite');
      tx.objectStore(STORE_MEDIA).put(data, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Failed to persist note file'));
    });
  } catch {
    // memoryMediaFallback already holds the reference
  }
}

export async function getMediaBlob(
  key: string
): Promise<Blob | ArrayBuffer | string | undefined> {
  const inMem = memoryMediaFallback.get(key);
  if (inMem !== undefined) {
    return inMem;
  }
  try {
    const db = await openClassroomDb();
    const res = await new Promise<Blob | ArrayBuffer | string | undefined>(
      (resolve, reject) => {
        const tx = db.transaction(STORE_MEDIA, 'readonly');
        const req = tx.objectStore(STORE_MEDIA).get(key);
        req.onsuccess = () =>
          resolve(req.result as Blob | ArrayBuffer | string | undefined);
        req.onerror = () => reject(req.error || new Error('Failed to load note file'));
      }
    );
    if (res !== undefined) {
      memoryMediaFallback.set(key, res);
    }
    return res;
  } catch {
    return memoryMediaFallback.get(key);
  }
}

export async function listAllSessions(): Promise<LiveSession[]> {
  try {
    const db = await openClassroomDb();
    return await new Promise<LiveSession[]>((resolve, reject) => {
      const tx = db.transaction(STORE_SESSIONS, 'readonly');
      const req = tx.objectStore(STORE_SESSIONS).getAll();
      req.onsuccess = () => {
        const items = (req.result as LiveSession[]) || [];
        items.sort((a, b) => a.scheduledStartMs - b.scheduledStartMs);
        resolve(items);
      };
      req.onerror = () => reject(req.error || new Error('Failed to read live schedule'));
    });
  } catch {
    const items = Array.from(memorySessionsFallback.values());
    items.sort((a, b) => a.scheduledStartMs - b.scheduledStartMs);
    return items;
  }
}

async function deleteSessionByIdInternal(id: string): Promise<void> {
  try {
    const db = await openClassroomDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_SESSIONS, 'readwrite');
      tx.objectStore(STORE_SESSIONS).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    memorySessionsFallback.delete(id);
  }
}

/**
 * Ensures any legacy fragmented sub-lectures (ELEC_L01..L07) are cleaned up and
 * replaced by ONE unified "Electrostatics" chapter live session.
 */
export async function loadAndNormalizeClassroomSessions(
  electrostaticsSlides: SlideDescriptor[]
): Promise<LiveSession[]> {
  const rawSessions = await listAllSessions();
  const preservedDoubtPdfPages = new Set<number>();
  const keptSessions: LiveSession[] = [];

  for (const s of rawSessions) {
    const isLegacySplit =
      Boolean(s.moduleCode && s.moduleCode.startsWith('ELEC_L')) ||
      s.id.startsWith('elec_l0') ||
      s.id.startsWith('elec_batch_') ||
      s.id.startsWith('elec_slice_') ||
      s.id.startsWith('weak_live_') ||
      s.id.startsWith('trial_');

    if (isLegacySplit) {
      for (const idx of s.starredSlideIndices) {
        const p = s.slides[idx]?.pdfPageNumber;
        if (p) preservedDoubtPdfPages.add(p);
      }
      await deleteSessionByIdInternal(s.id);
    } else {
      keptSessions.push(s);
    }
  }

  const existingUnified = keptSessions.find(
    (s) => s.moduleCode === 'ELECTROSTATICS_CHAPTER'
  );

  if (!existingUnified) {
    const now = Date.now();
    const baseSec = 50;
    const emergSec = 45;

    const migratedStarIndices: number[] = [];
    if (preservedDoubtPdfPages.size > 0) {
      electrostaticsSlides.forEach((sl, idx) => {
        if (sl.pdfPageNumber && preservedDoubtPdfPages.has(sl.pdfPageNumber)) {
          migratedStarIndices.push(idx);
        }
      });
    }

    const unifiedChapter: LiveSession = {
      id: 'electrostatics_chapter_live',
      title: 'Electrostatics',
      subject: Subject.PHYSICS,
      chapterName: 'Electrostatics',
      scheduledStartMs: now,
      baseSecondsPerSlide: baseSec,
      emergencySecondsPerSlide: emergSec,
      hardCloseMs: now + electrostaticsSlides.length * (baseSec + emergSec) * 1000,
      defaultOrientation: BroadcastOrientation.LANDSCAPE,
      slides: electrostaticsSlides,
      lockedAtMs: now,
      moduleCode: 'ELECTROSTATICS_CHAPTER',
      category: SessionCategory.PRIMARY_CHAPTER,
      emergencyUsedBySlide: {},
      attendedSlides: [],
      lateMissedSlides: [],
      starredSlideIndices: migratedStarIndices,
      presenceChecksPassed: 0,
      presenceChecksMissed: 0,
      tabSwitchCount: 0,
      recordedReplaysCount: 0,
    };

    await createLockedSession(unifiedChapter);
    keptSessions.push(unifiedChapter);
  }

  keptSessions.sort((a, b) => a.scheduledStartMs - b.scheduledStartMs);
  return keptSessions;
}

/**
 * Publishes and IMMEDIATELY LOCKS a new live session.
 * Existing session IDs cannot be overwritten via this method.
 */
export async function createLockedSession(session: LiveSession): Promise<void> {
  try {
    const db = await openClassroomDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_SESSIONS, 'readwrite');
      const store = tx.objectStore(STORE_SESSIONS);
      const checkReq = store.get(session.id);
      checkReq.onsuccess = () => {
        if (checkReq.result) {
          resolve();
          return;
        }
        store.add(session);
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Failed to lock session'));
    });
  } catch {
    if (!memorySessionsFallback.has(session.id)) {
      memorySessionsFallback.set(session.id, session);
    }
  }
}

export interface LiveTelemetryPatch {
  emergencyUsedBySlide?: Record<number, number>;
  attendedSlides?: number[];
  lateMissedSlides?: number[];
  starredSlideIndices?: number[];
  presenceChecksPassed?: number;
  presenceChecksMissed?: number;
  tabSwitchCount?: number;
  firstJoinedLiveAtMs?: number;
  finalizedAfterLive?: boolean;
  missedCooldownUntilMs?: number;
  recordedReplaysCount?: number;
  spacedScheduleGenerated?: boolean;
}

function mergeSessionTelemetry(
  existing: LiveSession,
  patch: LiveTelemetryPatch
): LiveSession {
  return {
    ...existing,
    // Immutable core schedule & spaced-repetition fields explicitly preserved
    id: existing.id,
    title: existing.title,
    subject: existing.subject,
    chapterName: existing.chapterName,
    scheduledStartMs: existing.scheduledStartMs,
    baseSecondsPerSlide: existing.baseSecondsPerSlide,
    emergencySecondsPerSlide: existing.emergencySecondsPerSlide,
    hardCloseMs: existing.hardCloseMs,
    defaultOrientation: existing.defaultOrientation,
    slides: existing.slides,
    lockedAtMs: existing.lockedAtMs,
    moduleCode: existing.moduleCode,
    category: existing.category,
    parentChapterId: existing.parentChapterId,
    repetitionStage: existing.repetitionStage,
    repetitionIntervalDays: existing.repetitionIntervalDays,
    isDoubtTelecast: existing.isDoubtTelecast,
    // Append-only telemetry
    spacedScheduleGenerated:
      existing.spacedScheduleGenerated || Boolean(patch.spacedScheduleGenerated),
    emergencyUsedBySlide: patch.emergencyUsedBySlide ?? existing.emergencyUsedBySlide,
    attendedSlides: patch.attendedSlides ?? existing.attendedSlides,
    lateMissedSlides: patch.lateMissedSlides ?? existing.lateMissedSlides,
    starredSlideIndices: patch.starredSlideIndices ?? existing.starredSlideIndices,
    presenceChecksPassed: patch.presenceChecksPassed ?? existing.presenceChecksPassed,
    presenceChecksMissed: patch.presenceChecksMissed ?? existing.presenceChecksMissed,
    tabSwitchCount: patch.tabSwitchCount ?? existing.tabSwitchCount,
    firstJoinedLiveAtMs: existing.firstJoinedLiveAtMs ?? patch.firstJoinedLiveAtMs,
    finalizedAfterLive: patch.finalizedAfterLive ?? existing.finalizedAfterLive,
    missedCooldownUntilMs: patch.missedCooldownUntilMs ?? existing.missedCooldownUntilMs,
    recordedReplaysCount: patch.recordedReplaysCount ?? existing.recordedReplaysCount,
  };
}

/**
 * Strictly enforces immutability on scheduledStartMs, hardCloseMs, baseSecondsPerSlide,
 * emergencySecondsPerSlide, title, subject, and slides. Only live telemetry may advance.
 */
export async function appendSessionTelemetry(
  sessionId: string,
  patch: LiveTelemetryPatch
): Promise<LiveSession | null> {
  try {
    const db = await openClassroomDb();
    return await new Promise<LiveSession | null>((resolve, reject) => {
      const tx = db.transaction(STORE_SESSIONS, 'readwrite');
      const store = tx.objectStore(STORE_SESSIONS);
      const getReq = store.get(sessionId);
      let updated: LiveSession | null = null;

      getReq.onsuccess = () => {
        const existing = getReq.result as LiveSession | undefined;
        if (!existing) return;
        updated = mergeSessionTelemetry(existing, patch);
        store.put(updated);
      };

      tx.oncomplete = () => resolve(updated);
      tx.onerror = () => reject(tx.error || new Error('Failed to update live telemetry'));
    });
  } catch {
    const existing = memorySessionsFallback.get(sessionId);
    if (!existing) return null;
    const updated = mergeSessionTelemetry(existing, patch);
    memorySessionsFallback.set(sessionId, updated);
    return updated;
  }
}

/**
 * Automatically generates and locks the 06:00 AM Scientific Spaced Repetition timeline
 * (+3d @ 30s, +7d @ 22s, +21d @ 15s, +45d @ 10s + Day 3/7 Doubt Re-Telecasts)
 * for any revised primary chapter. Idempotent per chapter.
 */
export async function enrollChapterInMorningSpacedRepetition(
  chapterSessionId: string,
  completedAtMs: number = Date.now()
): Promise<LiveSession[]> {
  const all = await listAllSessions();
  const source = all.find((s) => s.id === chapterSessionId);
  if (
    !source ||
    source.category === SessionCategory.SPACED_REVISION ||
    source.spacedScheduleGenerated
  ) {
    return all;
  }

  // Double-check no spaced children exist already
  const alreadyHasChildren = all.some(
    (s) =>
      s.category === SessionCategory.SPACED_REVISION &&
      s.parentChapterId === source.id
  );
  if (alreadyHasChildren) {
    await appendSessionTelemetry(source.id, { spacedScheduleGenerated: true });
    return await listAllSessions();
  }

  const generated = buildSpacedRepetitionSessionsForChapter(
    source,
    all,
    completedAtMs
  );

  await appendSessionTelemetry(source.id, { spacedScheduleGenerated: true });
  for (const sp of generated) {
    await createLockedSession(sp);
  }

  return await listAllSessions();
}

export function getEffectiveLiveEndMs(session: LiveSession): number {
  let totalSec = 0;
  for (let i = 0; i < session.slides.length; i++) {
    totalSec += session.baseSecondsPerSlide;
    if (session.emergencyUsedBySlide[i]) {
      totalSec += session.emergencySecondsPerSlide;
    }
  }
  const streamEnd = session.scheduledStartMs + totalSec * 1000;
  return Math.min(streamEnd, session.hardCloseMs);
}

export function computeSessionWallState(
  session: LiveSession,
  nowMs: number
): ComputedClassState {
  if (nowMs < session.scheduledStartMs) {
    return ComputedClassState.UPCOMING;
  }

  const effectiveEnd = getEffectiveLiveEndMs(session);
  if (nowMs < effectiveEnd) {
    return ComputedClassState.LIVE_NOW;
  }

  const attendedCount = session.attendedSlides.length;
  if (attendedCount === 0) {
    const lockUntil = session.missedCooldownUntilMs || effectiveEnd + MISSED_LIVE_COOLDOWN_MS;
    if (nowMs < lockUntil) {
      return ComputedClassState.LOCKED_COOLDOWN;
    }
  }

  return ComputedClassState.RECORDED_READY;
}

export function resolveLiveSlidePosition(
  session: LiveSession,
  anchorStartMs: number,
  emergencyMap: Record<number, number>,
  nowMs: number
): {
  ended: boolean;
  slideIndex: number;
  slideElapsedMs: number;
  slideTotalMs: number;
  slideRemainingMs: number;
  inEmergencyWindow: boolean;
} {
  const hardLimitMs =
    anchorStartMs === session.scheduledStartMs
      ? session.hardCloseMs
      : anchorStartMs +
        session.slides.length *
          (session.baseSecondsPerSlide + session.emergencySecondsPerSlide) *
          1000;

  if (nowMs >= hardLimitMs) {
    return {
      ended: true,
      slideIndex: Math.max(0, session.slides.length - 1),
      slideElapsedMs: 0,
      slideTotalMs: session.baseSecondsPerSlide * 1000,
      slideRemainingMs: 0,
      inEmergencyWindow: false,
    };
  }

  let cursorMs = anchorStartMs;
  for (let i = 0; i < session.slides.length; i++) {
    const hasEmergency = Boolean(emergencyMap[i]);
    const slideDurationSec =
      session.baseSecondsPerSlide +
      (hasEmergency ? session.emergencySecondsPerSlide : 0);
    const slideDurationMs = slideDurationSec * 1000;
    const nextCursorMs = Math.min(cursorMs + slideDurationMs, hardLimitMs);

    if (nowMs < nextCursorMs) {
      const slideElapsedMs = Math.max(0, nowMs - cursorMs);
      const slideRemainingMs = Math.max(0, nextCursorMs - nowMs);
      const inEmergencyWindow = slideElapsedMs >= session.baseSecondsPerSlide * 1000;
      return {
        ended: false,
        slideIndex: i,
        slideElapsedMs,
        slideTotalMs: nextCursorMs - cursorMs,
        slideRemainingMs,
        inEmergencyWindow,
      };
    }

    cursorMs = nextCursorMs;
    if (cursorMs >= hardLimitMs) break;
  }

  return {
    ended: true,
    slideIndex: Math.max(0, session.slides.length - 1),
    slideElapsedMs: 0,
    slideTotalMs: session.baseSecondsPerSlide * 1000,
    slideRemainingMs: 0,
    inEmergencyWindow: false,
  };
}
