import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bookmark,
  CheckCircle2,
  Clock,
  Lock,
  Monitor,
  Moon,
  Play,
  Plus,
  ShieldAlert,
  Smartphone,
  Sparkles,
  Sun,
  Sunrise,
} from 'lucide-react';
import {
  BroadcastOrientation,
  ComputedClassState,
  LiveSession,
  PlaybackMode,
  SessionCategory,
  SlideDescriptor,
  Subject,
} from './types';
import {
  appendSessionTelemetry,
  computeSessionWallState,
  enrollChapterInMorningSpacedRepetition,
  getEffectiveLiveEndMs,
  loadAndNormalizeClassroomSessions,
  MISSED_LIVE_COOLDOWN_MS,
  resolveLiveSlidePosition,
} from './lib/storage';
import { buildElectrostaticsChapterSlides } from './lib/electrostaticsCatalog';
import { SPACED_REPETITION_STAGES } from './lib/spacedRepetition';
import {
  playLiveGateBell,
  startRepeatingClassroomAlarm,
  stopRepeatingClassroomAlarm,
} from './lib/soundEngine';
import { dispatchSystemAlarmNotification } from './lib/notificationAlerts';
import { ScheduleModal } from './components/ScheduleModal';
import { LiveBroadcastPlayer } from './components/LiveBroadcastPlayer';
import { PdfThumbnail } from './components/PdfThumbnail';
import { PWAInstallButton } from './components/PWAInstallButton';
import { LiveAlarmModal } from './components/LiveAlarmModal';
import { NotificationSettingsButton } from './components/NotificationSettingsButton';

type ActiveTab = 'LIVE_HOME' | 'SPACED_6AM' | 'DOUBTS' | 'ATTENDANCE';

function formatCountdown(ms: number): string {
  const sec = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatDateTimeShort(ms: number): string {
  return new Date(ms).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function App() {
  const [isNightMode, setIsNightMode] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('gatebell_theme_mode');
      return saved ? saved === 'night' : true;
    } catch {
      return true;
    }
  });

  const [activeTab, setActiveTab] = useState<ActiveTab>('LIVE_HOME');
  const [sessions, setSessions] = useState<LiveSession[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  const [isScheduleOpen, setIsScheduleOpen] = useState<boolean>(false);
  const [confirmEnrollChapterId, setConfirmEnrollChapterId] = useState<string | null>(
    null
  );
  const [enrollToast, setEnrollToast] = useState<string>('');
  const [highlightedSessionId, setHighlightedSessionId] = useState<string | null>(null);
  const [armedAutoOpenIds, setArmedAutoOpenIds] = useState<string[]>([]);
  const [activeAlarmSession, setActiveAlarmSession] = useState<LiveSession | null>(null);
  const dismissedAlarmIdsRef = useRef<Set<string>>(new Set());

  const upcomingSectionRef = useRef<HTMLElement | null>(null);
  const enrollingIdsRef = useRef<Set<string>>(new Set());
  const prevUpcomingIdsRef = useRef<Set<string>>(new Set());
  const armedAutoOpenRef = useRef<Set<string>>(new Set());
  armedAutoOpenRef.current = new Set(armedAutoOpenIds);

  const [activePlayer, setActivePlayer] = useState<{
    sessionId: string;
    mode: PlaybackMode;
    doubtSlides?: SlideDescriptor[];
    orientationOverride?: BroadcastOrientation;
  } | null>(null);
  const activePlayerRef = useRef(activePlayer);
  activePlayerRef.current = activePlayer;

  const toggleNightDayMode = () => {
    setIsNightMode((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('gatebell_theme_mode', next ? 'night' : 'day');
      } catch {
        // Ignore storage error
      }
      return next;
    });
  };

  const refreshSessions = useCallback(async () => {
    const electroSlides = buildElectrostaticsChapterSlides();
    try {
      const normalized = await loadAndNormalizeClassroomSessions(electroSlides);
      const loadNow = Date.now();
      prevUpcomingIdsRef.current = new Set(
        normalized.filter((s) => s.scheduledStartMs > loadNow).map((s) => s.id)
      );
      setSessions(normalized);
    } catch {
      const now = Date.now();
      setSessions([
        {
          id: 'electrostatics_chapter_live',
          title: 'Electrostatics',
          subject: Subject.PHYSICS,
          chapterName: 'Electrostatics',
          scheduledStartMs: now,
          baseSecondsPerSlide: 50,
          emergencySecondsPerSlide: 45,
          hardCloseMs: now + electroSlides.length * 95 * 1000,
          defaultOrientation: BroadcastOrientation.LANDSCAPE,
          slides: electroSlides,
          lockedAtMs: now,
          moduleCode: 'ELECTROSTATICS_CHAPTER',
          category: SessionCategory.PRIMARY_CHAPTER,
          emergencyUsedBySlide: {},
          attendedSlides: [],
          lateMissedSlides: [],
          starredSlideIndices: [],
          presenceChecksPassed: 0,
          presenceChecksMissed: 0,
          tabSwitchCount: 0,
          recordedReplaysCount: 0,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshSessions();
  }, [refreshSessions]);

  // 500ms precision global wall-clock tick:
  // - Keeps scheduled chapters 100% SEALED until exact scheduledStartMs, then snaps LIVE on exact second
  // - Locks missed live sessions for 12 hours
  // - Automatically enrolls completed Primary Chapters into the 06:00 AM Spaced Repetition pipeline
  useEffect(() => {
    const id = window.setInterval(() => {
      const currentNow = Date.now();
      setNowMs(currentNow);

      setSessions((prev) => {
        let mutated = false;
        const nextUpcomingSet = new Set<string>();

        for (const s of prev) {
          if (currentNow < s.scheduledStartMs) {
            nextUpcomingSet.add(s.id);
            continue;
          }

          const endMs = getEffectiveLiveEndMs(s);

          // Exact-second Time-Lock opening transition: UPCOMING -> LIVE_NOW!
          if (prevUpcomingIdsRef.current.has(s.id) && currentNow < endMs) {
            playLiveGateBell(false);
            setEnrollToast(
              `LIVE NOW: "${s.chapterName || s.title}" has unlocked at its exact scheduled time!`
            );
            window.setTimeout(() => setEnrollToast(''), 6000);

            // 1. Dispatch System & PWA Notification alert
            dispatchSystemAlarmNotification(
              `inspiro LIVE ALARM: ${s.chapterName || s.title}`,
              'Scheduled revision is LIVE NOW! Click to enter live classroom before shutter locks.'
            );

            if (armedAutoOpenRef.current.has(s.id) && !activePlayerRef.current) {
              setActivePlayer({
                sessionId: s.id,
                mode: PlaybackMode.LIVE,
              });
            } else if (!activePlayerRef.current && !dismissedAlarmIdsRef.current.has(s.id)) {
              // 2. Start insistent repeating alarm sound & show alarm modal until opened
              startRepeatingClassroomAlarm();
              setActiveAlarmSession(s);
            }
          }

          if (currentNow < endMs) continue;

          if (!s.finalizedAfterLive && s.attendedSlides.length === 0) {
            mutated = true;
            appendSessionTelemetry(s.id, {
              finalizedAfterLive: true,
              missedCooldownUntilMs: endMs + MISSED_LIVE_COOLDOWN_MS,
            }).then((updated) => {
              if (updated) {
                setSessions((curr) =>
                  curr.map((item) => (item.id === updated.id ? updated : item))
                );
              }
            });
          } else if (
            s.category !== SessionCategory.SPACED_REVISION &&
            s.attendedSlides.length > 0 &&
            !s.spacedScheduleGenerated &&
            !enrollingIdsRef.current.has(s.id)
          ) {
            enrollingIdsRef.current.add(s.id);
            enrollChapterInMorningSpacedRepetition(s.id, endMs)
              .then((allUpdated) => {
                setSessions(allUpdated);
              })
              .finally(() => {
                enrollingIdsRef.current.delete(s.id);
              });
          }
        }

        prevUpcomingIdsRef.current = nextUpcomingSet;
        return mutated ? [...prev] : prev;
      });
    }, 500);
    return () => window.clearInterval(id);
  }, []);

  const toggleAutoOpenAtExactTime = (sessionId: string) => {
    setArmedAutoOpenIds((prev) =>
      prev.includes(sessionId)
        ? prev.filter((id) => id !== sessionId)
        : [...prev, sessionId]
    );
  };

  const notifyLockedBeforeExactTime = (session: LiveSession) => {
    const rem = Math.max(0, session.scheduledStartMs - Date.now());
    setEnrollToast(
      `Time-Locked: "${
        session.chapterName || session.title
      }" is sealed and cannot open early. Goes LIVE automatically at ${formatDateTimeShort(
        session.scheduledStartMs
      )} (in ${formatCountdown(rem)}).`
    );
    window.setTimeout(() => setEnrollToast(''), 4500);
  };

  const handleSessionUpdated = useCallback((updated: LiveSession) => {
    setSessions((prev) =>
      prev.map((item) => (item.id === updated.id ? updated : item))
    );
  }, []);

  const handleSessionLocked = useCallback(
    (created: LiveSession, autoOpenFullscreen: boolean) => {
      const currentNow = Date.now();
      if (created.scheduledStartMs > currentNow) {
        prevUpcomingIdsRef.current.add(created.id);
      }

      setSessions((prev) =>
        [...prev, created].sort((a, b) => a.scheduledStartMs - b.scheduledStartMs)
      );
      setIsScheduleOpen(false);

      if (autoOpenFullscreen && created.scheduledStartMs <= currentNow + 1000) {
        setActivePlayer({ sessionId: created.id, mode: PlaybackMode.LIVE });
      } else {
        // Strictly Time-Locked for a future date/time: never open live immediately!
        setActiveTab('LIVE_HOME');
        setArmedAutoOpenIds((prev) =>
          prev.includes(created.id) ? prev : [...prev, created.id]
        );
        setHighlightedSessionId(created.id);
        setEnrollToast(
          `Time-Locked: "${
            created.chapterName || created.title
          }" is sealed in Upcoming Live until exact ${formatDateTimeShort(
            created.scheduledStartMs
          )}.`
        );
        window.setTimeout(() => {
          upcomingSectionRef.current?.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
          });
        }, 100);
        window.setTimeout(() => {
          setHighlightedSessionId((curr) => (curr === created.id ? null : curr));
        }, 8000);
        window.setTimeout(() => setEnrollToast(''), 6500);
      }
    },
    []
  );

  // Enroll a revised chapter immediately into the 06:00 AM Scientific Spaced Repetition pipeline
  const handleManualEnrollInto6Am = async (chapter: LiveSession) => {
    if (confirmEnrollChapterId !== chapter.id) {
      setConfirmEnrollChapterId(chapter.id);
      return;
    }
    setConfirmEnrollChapterId(null);
    const updatedAll = await enrollChapterInMorningSpacedRepetition(
      chapter.id,
      Date.now()
    );
    setSessions(updatedAll);
    setEnrollToast(
      `${chapter.chapterName || chapter.title} locked into 6:00 AM Re-Revision (Day +3 · 30s, Day +7 · 22s, Day +21 · 15s, Day +45 · 10s).`
    );
    window.setTimeout(() => setEnrollToast(''), 5000);
  };

  // Split Primary Chapter sessions vs 6:00 AM Spaced Re-Revision sessions
  const primaryCategorized = useMemo(() => {
    const liveNow: LiveSession[] = [];
    const upcomingLive: LiveSession[] = [];
    const previousLive: Array<{ session: LiveSession; state: ComputedClassState }> = [];

    for (const s of sessions) {
      if (s.category === SessionCategory.SPACED_REVISION) continue;
      const st = computeSessionWallState(s, nowMs);
      if (st === ComputedClassState.LIVE_NOW) {
        liveNow.push(s);
      } else if (
        st === ComputedClassState.LOBBY ||
        st === ComputedClassState.UPCOMING
      ) {
        upcomingLive.push(s);
      } else {
        previousLive.push({ session: s, state: st });
      }
    }

    previousLive.sort((a, b) => b.session.scheduledStartMs - a.session.scheduledStartMs);
    return { liveNow, upcomingLive, previousLive };
  }, [sessions, nowMs]);

  const spaced6AmCategorized = useMemo(() => {
    const liveNow: LiveSession[] = [];
    const upcomingLive: LiveSession[] = [];
    const previousLive: Array<{ session: LiveSession; state: ComputedClassState }> = [];

    for (const s of sessions) {
      if (s.category !== SessionCategory.SPACED_REVISION) continue;
      const st = computeSessionWallState(s, nowMs);
      if (st === ComputedClassState.LIVE_NOW) {
        liveNow.push(s);
      } else if (
        st === ComputedClassState.LOBBY ||
        st === ComputedClassState.UPCOMING
      ) {
        upcomingLive.push(s);
      } else {
        previousLive.push({ session: s, state: st });
      }
    }

    upcomingLive.sort((a, b) => a.scheduledStartMs - b.scheduledStartMs);
    previousLive.sort((a, b) => b.session.scheduledStartMs - a.session.scheduledStartMs);
    return { liveNow, upcomingLive, previousLive };
  }, [sessions, nowMs]);

  // Primary chapters not yet queued in 6 AM Re-Revision
  const unqueuedPrimaryChapters = useMemo(
    () =>
      sessions.filter(
        (s) =>
          s.category !== SessionCategory.SPACED_REVISION &&
          !s.spacedScheduleGenerated
      ),
    [sessions]
  );

  // Group Doubts strictly by Primary Chapter Name (including doubts flagged during 6 AM Re-Revision)
  const chaptersWithDoubts = useMemo(() => {
    const list: Array<{
      session: LiveSession;
      chapterName: string;
      doubtSlides: SlideDescriptor[];
    }> = [];

    for (const s of sessions) {
      if (s.category === SessionCategory.SPACED_REVISION) continue;

      const mergedIndices = new Set<number>(s.starredSlideIndices);
      for (const child of sessions) {
        if (
          child.category === SessionCategory.SPACED_REVISION &&
          child.parentChapterId === s.id
        ) {
          for (const childStarIdx of child.starredSlideIndices) {
            const childSlide = child.slides[childStarIdx];
            const origIdx = childSlide?.originalSlideIndex ?? childStarIdx;
            mergedIndices.add(origIdx);
          }
        }
      }

      if (mergedIndices.size === 0) continue;
      const sortedIndices = Array.from(mergedIndices).sort((a, b) => a - b);
      const doubtSlides: SlideDescriptor[] = [];
      sortedIndices.forEach((origIdx) => {
        const sl = s.slides[origIdx];
        if (sl) {
          doubtSlides.push({
            ...sl,
            index: doubtSlides.length,
            originalSlideIndex: origIdx,
          });
        }
      });

      if (doubtSlides.length > 0) {
        list.push({
          session: s,
          chapterName: s.chapterName || s.title,
          doubtSlides,
        });
      }
    }
    return list;
  }, [sessions]);

  const activeSessionObj = activePlayer
    ? sessions.find((s) => s.id === activePlayer.sessionId) || null
    : null;

  // Night vs Day surface palette
  const pageBg = isNightMode
    ? 'bg-[#0F0F0F] text-zinc-100'
    : 'bg-slate-50 text-slate-900';
  const headerBg = isNightMode
    ? 'bg-[#0F0F0F]/95 border-white/10'
    : 'bg-white border-slate-200';
  const cardBg = isNightMode
    ? 'bg-[#18181B] border-white/10'
    : 'bg-white border-slate-200';
  const mutedText = isNightMode ? 'text-zinc-400' : 'text-slate-500';
  const subtleSurface = isNightMode
    ? 'bg-[#141417] border-white/10'
    : 'bg-slate-100 border-slate-200';

  const spacedCountBadge =
    spaced6AmCategorized.liveNow.length + spaced6AmCategorized.upcomingLive.length;

  return (
    <div className={`min-h-screen flex flex-col transition-colors ${pageBg}`}>
      {/* STRICT 3-ZONE TOP BAR CONTRACT */}
      <header
        className={`sticky top-0 z-30 border-b px-4 sm:px-6 py-3 flex items-center justify-between gap-6 backdrop-blur-xs ${headerBg}`}
      >
        {/* Zone 1: Brand + Live Wall Clock */}
        <div className="flex items-center gap-3 shrink-0">
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('LIVE_HOME');
            }}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#0F0F12] border border-white/15 text-xs font-bold tracking-tight whitespace-nowrap shadow-xs hover:border-white/30 transition-colors select-none"
          >
            <span className="text-white text-xs">inspiro</span>
            <span className="text-[#FF0000] font-extrabold tracking-wider text-[11px] ml-0.5">
              LIVE
            </span>
          </a>
          <span className={`hidden lg:inline text-xs font-mono tabular-nums ${mutedText}`}>
            {new Date(nowMs).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            })}
          </span>
        </div>

        {/* Zone 2: 4 Clean Single-Line Nav Links */}
        <nav className="hidden md:flex items-center gap-7 text-sm font-medium">
          <button
            type="button"
            onClick={() => setActiveTab('LIVE_HOME')}
            className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'LIVE_HOME'
                ? 'border-[#FF0000] font-semibold'
                : `border-transparent ${mutedText}`
            }`}
          >
            Live
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('SPACED_6AM')}
            className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'SPACED_6AM'
                ? 'border-[#FF0000] font-semibold'
                : `border-transparent ${mutedText}`
            }`}
          >
            6 AM Re-Revision{spacedCountBadge > 0 ? ` (${spacedCountBadge})` : ''}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('DOUBTS')}
            className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'DOUBTS'
                ? 'border-[#FF0000] font-semibold'
                : `border-transparent ${mutedText}`
            }`}
          >
            Doubts{chaptersWithDoubts.length > 0 ? ` (${chaptersWithDoubts.length})` : ''}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('ATTENDANCE')}
            className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'ATTENDANCE'
                ? 'border-[#FF0000] font-semibold'
                : `border-transparent ${mutedText}`
            }`}
          >
            Attendance
          </button>
        </nav>

        {/* Zone 3: Night/Day Screen Switch + Lock Chapter CTA */}
        <div className="flex items-center gap-2.5 shrink-0">
          <NotificationSettingsButton isNightMode={isNightMode} />
          <PWAInstallButton isNightMode={isNightMode} />

          <button
            type="button"
            onClick={toggleNightDayMode}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border transition-colors cursor-pointer whitespace-nowrap ${
              isNightMode
                ? 'bg-zinc-900 hover:bg-zinc-800 border-white/15 text-zinc-200'
                : 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-800'
            }`}
            title="Switch Night / Day Screen"
          >
            {isNightMode ? (
              <>
                <Sun className="w-3.5 h-3.5 text-amber-400" />
                <span className="hidden sm:inline">Day</span>
              </>
            ) : (
              <>
                <Moon className="w-3.5 h-3.5 text-slate-700" />
                <span className="hidden sm:inline">Night</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => setIsScheduleOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#FF0000] hover:bg-red-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Lock Chapter</span>
          </button>
        </div>
      </header>

      {/* Mobile Nav Strip */}
      <div
        className={`md:hidden border-b px-4 py-2 flex items-center gap-2 overflow-x-auto ${headerBg}`}
      >
        {(
          [
            ['LIVE_HOME', 'Live'],
            [
              'SPACED_6AM',
              `6 AM Re-Revision${spacedCountBadge > 0 ? ` (${spacedCountBadge})` : ''}`,
            ],
            [
              'DOUBTS',
              `Doubts${chaptersWithDoubts.length > 0 ? ` (${chaptersWithDoubts.length})` : ''}`,
            ],
            ['ATTENDANCE', 'Attendance'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveTab(key)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === key
                ? 'bg-[#FF0000] text-white'
                : `${subtleSurface} ${mutedText}`
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-7 space-y-10">
        {enrollToast && (
          <div className="px-4 py-3 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-xs font-medium text-emerald-400">
            {enrollToast}
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 1: MAIN CHAPTER LIVE CLASSROOM (Live Now · Upcoming · Past)   */}
        {/* ================================================================= */}
        {activeTab === 'LIVE_HOME' && (
          <div className="space-y-10">
            {/* 1. LIVE NOW */}
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <h1 className="text-lg font-bold tracking-tight">Live Now</h1>
                <span className={`text-xs font-mono tabular-nums ${mutedText}`}>
                  50s auto-slide · +45s hold
                </span>
              </div>

              {isLoading ? (
                <div className={`border rounded-xl p-10 text-center text-xs ${cardBg} ${mutedText}`}>
                  Loading live stream...
                </div>
              ) : primaryCategorized.liveNow.length === 0 ? (
                <div className={`border rounded-xl p-8 text-center space-y-3 ${cardBg}`}>
                  <p className="text-sm font-semibold">No chapter streaming right now</p>
                  <p className={`text-xs ${mutedText}`}>
                    Lock a chapter PDF to go live or check Upcoming &amp; Previous Live below.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {primaryCategorized.liveNow.map((session) => {
                    const livePos = resolveLiveSlidePosition(
                      session,
                      session.scheduledStartMs,
                      session.emergencyUsedBySlide,
                      nowMs
                    );
                    const pct = Math.min(
                      100,
                      Math.round(
                        ((livePos.slideIndex + 1) / Math.max(1, session.slides.length)) *
                          100
                      )
                    );
                    const activeSlide = session.slides[livePos.slideIndex];
                    const padDigits = session.slides.length >= 100 ? 3 : 2;

                    return (
                      <div
                        key={session.id}
                        onClick={() =>
                          setActivePlayer({
                            sessionId: session.id,
                            mode: PlaybackMode.LIVE,
                            orientationOverride: BroadcastOrientation.LANDSCAPE,
                          })
                        }
                        className={`group border rounded-xl overflow-hidden transition-colors cursor-pointer ${cardBg} hover:border-[#FF0000]`}
                      >
                        <div className="relative aspect-video bg-[#141417] overflow-hidden text-white">
                          <div className="absolute inset-0">
                            <PdfThumbnail slide={activeSlide} />
                          </div>

                          <div className="relative z-10 h-full bg-gradient-to-t from-black/85 via-transparent to-black/65 p-4 flex flex-col justify-between">
                            <div className="flex items-center justify-between gap-2">
                              <span className="bg-[#FF0000] text-white text-xs font-extrabold tracking-wider px-2.5 py-1 rounded flex items-center gap-1.5 shadow-md">
                                <span className="inline-block w-2 h-2 rounded-full bg-white" />
                                <span>LIVE</span>
                              </span>

                              <span className="bg-black/80 border border-white/15 text-xs font-mono tabular-nums px-2.5 py-1 rounded text-zinc-100">
                                {String(livePos.slideIndex + 1).padStart(padDigits, '0')}/
                                {String(session.slides.length).padStart(padDigits, '0')} ·{' '}
                                {formatCountdown(livePos.slideRemainingMs)}
                              </span>
                            </div>

                            <div className="space-y-2">
                              <svg className="w-full h-1 rounded overflow-hidden block">
                                <rect
                                  width="100%"
                                  height="100%"
                                  className="fill-white/25"
                                />
                                <rect
                                  width={`${pct}%`}
                                  height="100%"
                                  className="fill-[#FF0000]"
                                />
                              </svg>
                            </div>
                          </div>
                        </div>

                        <div className="p-4 flex items-center justify-between gap-4">
                          <div className="min-w-0">
                            <h2 className="text-base font-bold truncate">
                              {session.chapterName || session.title}
                            </h2>
                            <p className={`text-xs mt-0.5 truncate ${mutedText}`}>
                              {session.subject} · {session.slides.length} pages
                              {session.spacedScheduleGenerated
                                ? ' · 6 AM Re-Revision Locked'
                                : ' · Tap to watch fullscreen live'}
                            </p>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActivePlayer({
                                  sessionId: session.id,
                                  mode: PlaybackMode.LIVE,
                                  orientationOverride:
                                    BroadcastOrientation.VERTICAL,
                                });
                              }}
                              className={`p-2 rounded-lg border cursor-pointer ${subtleSurface}`}
                              title="Open in Vertical Real-Frame Live"
                            >
                              <Smartphone className="w-4 h-4 text-red-500" />
                            </button>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActivePlayer({
                                  sessionId: session.id,
                                  mode: PlaybackMode.LIVE,
                                  orientationOverride:
                                    BroadcastOrientation.LANDSCAPE,
                                });
                              }}
                              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-[#FF0000] hover:bg-red-700 text-white rounded-lg cursor-pointer whitespace-nowrap"
                            >
                              <Monitor className="w-3.5 h-3.5" />
                              <span>Watch Live</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* 2. UPCOMING LIVE (100% SEALED TIME-LOCK QUEUE) */}
            <section ref={upcomingSectionRef} className="space-y-4 scroll-mt-20">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-base font-bold tracking-tight">
                  Upcoming Live · Time-Locked ({primaryCategorized.upcomingLive.length})
                </h2>
                <span className={`text-xs font-mono ${mutedText}`}>
                  Auto-unlocks on exact clock second
                </span>
              </div>

              {primaryCategorized.upcomingLive.length === 0 ? (
                <div
                  className={`border rounded-xl px-5 py-6 flex flex-wrap items-center justify-between gap-4 ${cardBg}`}
                >
                  <div>
                    <p className="text-sm font-semibold">No upcoming chapters scheduled</p>
                    <p className={`text-xs mt-0.5 ${mutedText}`}>
                      Upload your next chapter PDF and lock an exact date &amp; clock time.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsScheduleOpen(true)}
                    className={`px-3.5 py-2 text-xs font-semibold rounded-lg border cursor-pointer ${subtleSurface}`}
                  >
                    + Time-Lock Upcoming Chapter
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                  {primaryCategorized.upcomingLive.map((session) => {
                    const untilStartMs = Math.max(
                      0,
                      session.scheduledStartMs - nowMs
                    );
                    const isHighlighted = highlightedSessionId === session.id;
                    const isAutoOpenArmed = armedAutoOpenIds.includes(session.id);

                    return (
                      <div
                        key={session.id}
                        onClick={() => notifyLockedBeforeExactTime(session)}
                        className={`border rounded-xl overflow-hidden flex flex-col justify-between transition-all cursor-not-allowed ${cardBg} ${
                          isHighlighted
                            ? 'ring-2 ring-amber-500 border-amber-500'
                            : ''
                        }`}
                      >
                        <div className="relative aspect-video bg-[#141417] overflow-hidden text-white">
                          <div className="absolute inset-0 opacity-40 blur-[2px]">
                            <PdfThumbnail slide={session.slides[0]} />
                          </div>
                          <div className="relative z-10 h-full bg-gradient-to-t from-black/95 via-black/55 to-black/80 p-3.5 flex flex-col justify-between">
                            <div className="flex items-center justify-between gap-2">
                              <span className="bg-amber-500 text-zinc-950 text-[11px] font-extrabold tracking-wider px-2.5 py-0.5 rounded flex items-center gap-1">
                                <Lock className="w-3 h-3" />
                                <span>TIME-LOCKED</span>
                              </span>
                              <span className="text-[11px] font-mono text-zinc-200 bg-black/75 border border-white/15 px-2 py-0.5 rounded">
                                {formatDateTimeShort(session.scheduledStartMs)}
                              </span>
                            </div>

                            <div className="space-y-0.5">
                              <div className="text-[11px] uppercase tracking-wider text-amber-400 font-semibold">
                                Goes Live Automatically In
                              </div>
                              <div className="text-lg font-mono font-bold tabular-nums text-white">
                                {formatCountdown(untilStartMs)}
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="p-4 space-y-3">
                          <div>
                            <h3 className="text-sm font-bold truncate">
                              {session.chapterName || session.title}
                            </h3>
                            <p className={`text-xs mt-0.5 ${mutedText}`}>
                              {session.subject} · {session.slides.length} pages ·{' '}
                              {session.baseSecondsPerSlide}s/slide
                            </p>
                          </div>

                          <div className="space-y-2">
                            <div
                              className={`w-full py-2 px-3 text-xs font-mono font-semibold text-center rounded-lg border flex items-center justify-center gap-1.5 ${subtleSurface} text-amber-500`}
                            >
                              <Lock className="w-3.5 h-3.5 shrink-0" />
                              <span>
                                Sealed Until {formatDateTimeShort(session.scheduledStartMs)}
                              </span>
                            </div>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleAutoOpenAtExactTime(session.id);
                              }}
                              className={`w-full py-1.5 px-3 text-[11px] font-semibold rounded-lg border transition-colors cursor-pointer ${
                                isAutoOpenArmed
                                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
                                  : `${subtleSurface} ${mutedText}`
                              }`}
                            >
                              {isAutoOpenArmed
                                ? 'Auto-Launch Fullscreen on Exact Time: ON'
                                : 'Auto-Launch Fullscreen on Exact Time: OFF'}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* 3. PREVIOUS LIVE */}
            <section className="space-y-4">
              <h2 className="text-base font-bold tracking-tight">
                Previous Live ({primaryCategorized.previousLive.length})
              </h2>

              {primaryCategorized.previousLive.length === 0 ? (
                <div className={`border rounded-xl p-6 text-xs ${cardBg} ${mutedText}`}>
                  Completed live chapters appear here and automatically enroll into 6:00 AM Re-Revision.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                  {primaryCategorized.previousLive.map(({ session, state }) => {
                    const isCooldownLocked =
                      state === ComputedClassState.LOCKED_COOLDOWN;
                    const lockEnd =
                      session.missedCooldownUntilMs ||
                      getEffectiveLiveEndMs(session) + MISSED_LIVE_COOLDOWN_MS;
                    const cooldownLeftMs = Math.max(0, lockEnd - nowMs);

                    return (
                      <div
                        key={session.id}
                        className={`border rounded-xl overflow-hidden flex flex-col justify-between ${cardBg}`}
                      >
                        <div className="relative aspect-video bg-[#141417] overflow-hidden text-white">
                          <div className="absolute inset-0 opacity-65">
                            <PdfThumbnail slide={session.slides[0]} />
                          </div>
                          <div className="relative z-10 h-full bg-gradient-to-t from-black/90 via-transparent to-black/70 p-3.5 flex flex-col justify-between">
                            <div className="flex items-center justify-between">
                              <span className="bg-black/80 border border-white/15 text-zinc-200 text-[11px] font-bold px-2 py-0.5 rounded">
                                PREVIOUS LIVE
                              </span>
                              {isCooldownLocked ? (
                                <span className="text-[11px] font-mono text-red-400">
                                  12h Lock
                                </span>
                              ) : (
                                <span className="text-[11px] font-mono text-emerald-400">
                                  6 AM Scheduled
                                </span>
                              )}
                            </div>

                            <div className="text-xs font-mono text-zinc-300">
                              {session.attendedSlides.length}/{session.slides.length} attended live
                            </div>
                          </div>
                        </div>

                        <div className="p-4 space-y-3">
                          <div>
                            <h3 className="text-sm font-bold truncate">
                              {session.chapterName || session.title}
                            </h3>
                            <p className={`text-xs mt-0.5 ${mutedText}`}>
                              {session.subject} · {formatDateTimeShort(session.scheduledStartMs)}
                            </p>
                          </div>

                          {isCooldownLocked ? (
                            <div className="py-2 px-3 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-400 flex items-center justify-between">
                              <span>Missed Live Lock</span>
                              <span className="font-mono font-bold tabular-nums">
                                {formatCountdown(cooldownLeftMs)}
                              </span>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() =>
                                setActivePlayer({
                                  sessionId: session.id,
                                  mode: PlaybackMode.RECORDED_REPLAY,
                                })
                              }
                              className={`w-full py-2 px-3 text-xs font-semibold rounded-lg border flex items-center justify-center gap-1.5 cursor-pointer ${subtleSurface}`}
                            >
                              <Play className="w-3.5 h-3.5 fill-current" />
                              <span>Watch Live-Pace Replay</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 2: 6:00 AM SCIENTIFIC SPACED RE-REVISION SECTION              */}
        {/* (Exact same structure: Live Now · Upcoming Live · Previous Live)  */}
        {/* ================================================================= */}
        {activeTab === 'SPACED_6AM' && (
          <div className="space-y-10">
            {/* Scientific Forgetting-Curve Protocol Header */}
            <section className={`border rounded-xl p-5 sm:p-6 space-y-5 ${cardBg}`}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-xs font-mono text-amber-500">
                    <Sunrise className="w-4 h-4 shrink-0" />
                    <span>FIXED DAILY SLOT · 06:00 AM SHARP · EBBINGHAUS SPACED REPETITION</span>
                  </div>
                  <h1 className="text-lg font-bold tracking-tight">
                    6:00 AM Scientific Re-Revision Stream
                  </h1>
                  <p className={`text-xs max-w-2xl leading-relaxed ${mutedText}`}>
                    Every revised chapter automatically schedules itself into future 6:00 AM live broadcasts right before the forgetting curve drops—with scientifically compressed slide durations as neural recall accelerates.
                  </p>
                </div>
              </div>

              {/* 4 Scientific Compression Intervals */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {SPACED_REPETITION_STAGES.map((st) => {
                  const sampleSec = Math.max(
                    st.minSecondsPerSlide,
                    Math.round(50 * st.timeRatio)
                  );
                  return (
                    <div
                      key={st.stage}
                      className={`p-3.5 rounded-lg border ${subtleSurface}`}
                    >
                      <div className="flex items-center justify-between text-xs font-mono">
                        <span className="font-bold text-[#FF0000]">
                          +{st.intervalDays} Days
                        </span>
                        <span className={mutedText}>06:00 AM</span>
                      </div>
                      <div className="text-lg font-mono font-bold tabular-nums mt-1">
                        {sampleSec}s / slide
                      </div>
                      <div className={`text-[11px] mt-0.5 ${mutedText}`}>
                        {Math.round(st.timeRatio * 100)}% of first-read time (+
                        {st.emergencySeconds}s hold)
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Quick Trigger for Active Revised Chapters */}
              {unqueuedPrimaryChapters.length > 0 && (
                <div
                  className={`pt-4 border-t flex flex-wrap items-center justify-between gap-3 ${
                    isNightMode ? 'border-white/10' : 'border-slate-200'
                  }`}
                >
                  <div className="text-xs">
                    <span className="font-semibold">
                      Auto-enroll happens automatically when a chapter finishes live
                    </span>
                    <span className={`ml-1.5 ${mutedText}`}>
                      — or mark an active chapter revised now to lock its 6:00 AM timeline immediately:
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {unqueuedPrimaryChapters.map((ch) => (
                      <button
                        key={ch.id}
                        type="button"
                        onClick={() => handleManualEnrollInto6Am(ch)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                          confirmEnrollChapterId === ch.id
                            ? 'bg-[#FF0000] text-white'
                            : 'bg-amber-500 hover:bg-amber-400 text-zinc-950'
                        }`}
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>
                          {confirmEnrollChapterId === ch.id
                            ? `Confirm Lock ${ch.chapterName || ch.title} at 6 AM`
                            : `Mark "${ch.chapterName || ch.title}" Revised → Lock 6 AM`}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </section>

            {/* 1. 6:00 AM LIVE NOW */}
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold tracking-tight">
                  Live Now · 6:00 AM Slot ({spaced6AmCategorized.liveNow.length})
                </h2>
              </div>

              {spaced6AmCategorized.liveNow.length === 0 ? (
                <div className={`border rounded-xl p-6 text-xs ${cardBg} ${mutedText}`}>
                  No 6:00 AM Re-Revision broadcast is live at this exact minute. Your locked morning revisions open automatically at 06:00 AM sharp.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {spaced6AmCategorized.liveNow.map((session) => {
                    const livePos = resolveLiveSlidePosition(
                      session,
                      session.scheduledStartMs,
                      session.emergencyUsedBySlide,
                      nowMs
                    );
                    const pct = Math.min(
                      100,
                      Math.round(
                        ((livePos.slideIndex + 1) / Math.max(1, session.slides.length)) *
                          100
                      )
                    );
                    const activeSlide = session.slides[livePos.slideIndex];
                    const padDigits = session.slides.length >= 100 ? 3 : 2;

                    return (
                      <div
                        key={session.id}
                        onClick={() =>
                          setActivePlayer({
                            sessionId: session.id,
                            mode: PlaybackMode.LIVE,
                            orientationOverride: BroadcastOrientation.LANDSCAPE,
                          })
                        }
                        className={`group border rounded-xl overflow-hidden transition-colors cursor-pointer ${cardBg} hover:border-[#FF0000]`}
                      >
                        <div className="relative aspect-video bg-[#141417] overflow-hidden text-white">
                          <div className="absolute inset-0">
                            <PdfThumbnail slide={activeSlide} />
                          </div>

                          <div className="relative z-10 h-full bg-gradient-to-t from-black/85 via-transparent to-black/65 p-4 flex flex-col justify-between">
                            <div className="flex items-center justify-between gap-2">
                              <span className="bg-[#FF0000] text-white text-xs font-extrabold tracking-wider px-2.5 py-1 rounded flex items-center gap-1.5 shadow-md">
                                <span className="inline-block w-2 h-2 rounded-full bg-white" />
                                <span>
                                  6AM R{session.repetitionStage ?? 1} LIVE
                                </span>
                              </span>

                              <span className="bg-black/80 border border-white/15 text-xs font-mono tabular-nums px-2.5 py-1 rounded text-zinc-100">
                                {String(livePos.slideIndex + 1).padStart(padDigits, '0')}/
                                {String(session.slides.length).padStart(padDigits, '0')} ·{' '}
                                {formatCountdown(livePos.slideRemainingMs)}
                              </span>
                            </div>

                            <svg className="w-full h-1 rounded overflow-hidden block">
                              <rect
                                width="100%"
                                height="100%"
                                className="fill-white/25"
                              />
                              <rect
                                width={`${pct}%`}
                                height="100%"
                                className="fill-[#FF0000]"
                              />
                            </svg>
                          </div>
                        </div>

                        <div className="p-4 flex items-center justify-between gap-4">
                          <div className="min-w-0">
                            <h3 className="text-base font-bold truncate">
                              {session.title}
                            </h3>
                            <p className={`text-xs mt-0.5 ${mutedText}`}>
                              Day +{session.repetitionIntervalDays} ·{' '}
                              {session.baseSecondsPerSlide}s/slide ·{' '}
                              {session.slides.length} pages
                            </p>
                          </div>

                          <button
                            type="button"
                            className="px-3.5 py-2 text-xs font-semibold bg-[#FF0000] text-white rounded-lg cursor-pointer whitespace-nowrap"
                          >
                            Join 6 AM Live
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* 2. 6:00 AM UPCOMING LIVE */}
            <section className="space-y-4">
              <h2 className="text-base font-bold tracking-tight">
                Upcoming Live · 6:00 AM Queue ({spaced6AmCategorized.upcomingLive.length})
              </h2>

              {spaced6AmCategorized.upcomingLive.length === 0 ? (
                <div className={`border rounded-xl p-6 text-xs ${cardBg} ${mutedText}`}>
                  Once a chapter completes its first live revision (or you click &ldquo;Mark Revised&rdquo; above), its Day +3, Day +7, Day +21, and Day +45 morning 6:00 AM live streams automatically lock here.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                  {spaced6AmCategorized.upcomingLive.map((session) => {
                    const untilStartMs = Math.max(
                      0,
                      session.scheduledStartMs - nowMs
                    );
                    const estMinutes = Math.max(
                      1,
                      Math.round(
                        (session.slides.length * session.baseSecondsPerSlide) / 60
                      )
                    );

                    return (
                      <div
                        key={session.id}
                        onClick={() => notifyLockedBeforeExactTime(session)}
                        className={`border rounded-xl overflow-hidden flex flex-col justify-between cursor-not-allowed ${cardBg}`}
                      >
                        <div className="relative aspect-video bg-[#141417] overflow-hidden text-white">
                          <div className="absolute inset-0 opacity-40 blur-[2px]">
                            <PdfThumbnail slide={session.slides[0]} />
                          </div>
                          <div className="relative z-10 h-full bg-gradient-to-t from-black/95 via-black/55 to-black/80 p-3.5 flex flex-col justify-between">
                            <div className="flex items-center justify-between gap-2">
                              <span className="bg-amber-500 text-zinc-950 text-[11px] font-extrabold tracking-wider px-2 py-0.5 rounded">
                                {session.isDoubtTelecast
                                  ? `DAY +${session.repetitionIntervalDays} DOUBTS`
                                  : `DAY +${session.repetitionIntervalDays} · ${session.baseSecondsPerSlide}s/SLIDE`}
                              </span>
                              <span className="flex items-center gap-1 text-[11px] font-mono text-amber-300">
                                <Lock className="w-3 h-3" />
                                <span>06:00 AM</span>
                              </span>
                            </div>

                            <div className="text-sm font-mono font-bold tabular-nums text-white">
                              Opens in {formatCountdown(untilStartMs)}
                            </div>
                          </div>
                        </div>

                        <div className="p-4 space-y-3">
                          <div>
                            <h3 className="text-sm font-bold truncate">
                              {session.title}
                            </h3>
                            <p className={`text-xs mt-0.5 ${mutedText}`}>
                              {session.subject} · {session.slides.length} pages · ~
                              {estMinutes} min ({session.baseSecondsPerSlide}s/p)
                            </p>
                          </div>

                          <div
                            className={`w-full py-2 px-3 text-xs font-mono font-semibold text-center rounded-lg border flex items-center justify-center gap-1.5 ${subtleSurface} text-amber-500`}
                          >
                            <Lock className="w-3.5 h-3.5 shrink-0" />
                            <span>
                              Sealed · {formatDateTimeShort(session.scheduledStartMs)}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* 3. 6:00 AM PREVIOUS LIVE */}
            <section className="space-y-4">
              <h2 className="text-base font-bold tracking-tight">
                Previous Live · 6:00 AM History ({spaced6AmCategorized.previousLive.length})
              </h2>

              {spaced6AmCategorized.previousLive.length === 0 ? (
                <div className={`border rounded-xl p-6 text-xs ${cardBg} ${mutedText}`}>
                  Completed 6:00 AM spaced-repetition broadcasts appear here.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                  {spaced6AmCategorized.previousLive.map(({ session, state }) => {
                    const isCooldownLocked =
                      state === ComputedClassState.LOCKED_COOLDOWN;
                    const lockEnd =
                      session.missedCooldownUntilMs ||
                      getEffectiveLiveEndMs(session) + MISSED_LIVE_COOLDOWN_MS;
                    const cooldownLeftMs = Math.max(0, lockEnd - nowMs);

                    return (
                      <div
                        key={session.id}
                        className={`border rounded-xl overflow-hidden flex flex-col justify-between ${cardBg}`}
                      >
                        <div className="p-4 space-y-2">
                          <div className="flex items-center justify-between text-xs font-mono">
                            <span className="text-amber-500 font-semibold">
                              Day +{session.repetitionIntervalDays} ·{' '}
                              {session.baseSecondsPerSlide}s/p
                            </span>
                            <span className={mutedText}>
                              {formatDateTimeShort(session.scheduledStartMs)}
                            </span>
                          </div>
                          <h3 className="text-sm font-bold truncate">
                            {session.title}
                          </h3>
                          <p className={`text-xs ${mutedText}`}>
                            Attended {session.attendedSlides.length}/
                            {session.slides.length} pages
                          </p>
                        </div>

                        <div className="px-4 pb-4">
                          {isCooldownLocked ? (
                            <div className="py-2 px-3 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-400 flex items-center justify-between">
                              <span>Missed 6 AM Lock</span>
                              <span className="font-mono font-bold tabular-nums">
                                {formatCountdown(cooldownLeftMs)}
                              </span>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() =>
                                setActivePlayer({
                                  sessionId: session.id,
                                  mode: PlaybackMode.RECORDED_REPLAY,
                                })
                              }
                              className={`w-full py-2 px-3 text-xs font-semibold rounded-lg border flex items-center justify-center gap-1.5 cursor-pointer ${subtleSurface}`}
                            >
                              <Play className="w-3.5 h-3.5 fill-current" />
                              <span>Replay ({session.baseSecondsPerSlide}s Pace)</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 3: DOUBTS — CHAPTER NAME CARDS ONLY                           */}
        {/* ================================================================= */}
        {activeTab === 'DOUBTS' && (
          <div className="space-y-6">
            <div>
              <h1 className="text-lg font-bold tracking-tight">Chapter Doubts</h1>
              <p className={`text-xs mt-1 ${mutedText}`}>
                Tap any chapter below to immediately open a fullscreen live stream of your flagged doubt slides for that chapter.
              </p>
            </div>

            {chaptersWithDoubts.length === 0 ? (
              <div className={`border rounded-xl p-10 text-center space-y-2 ${cardBg}`}>
                <Bookmark className="w-6 h-6 text-red-500 mx-auto" />
                <p className="text-sm font-semibold">No chapter doubts marked yet</p>
                <p className={`text-xs max-w-md mx-auto ${mutedText}`}>
                  While watching any live chapter, tap the screen and press{' '}
                  <strong className="font-semibold">+ Doubt</strong> on any tough page. Only the chapter name appears cleanly here.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {chaptersWithDoubts.map(({ session, chapterName, doubtSlides }) => (
                  <div
                    key={session.id}
                    onClick={() =>
                      setActivePlayer({
                        sessionId: session.id,
                        mode: PlaybackMode.DOUBT_LIVE,
                        doubtSlides,
                        orientationOverride: BroadcastOrientation.LANDSCAPE,
                      })
                    }
                    className={`group border rounded-xl overflow-hidden transition-colors cursor-pointer ${cardBg} hover:border-[#FF0000]`}
                  >
                    <div className="relative aspect-video bg-[#141417] overflow-hidden text-white">
                      <div className="absolute inset-0">
                        <PdfThumbnail slide={doubtSlides[0]} />
                      </div>
                      <div className="relative z-10 h-full bg-gradient-to-t from-black/90 via-black/25 to-black/65 p-4 flex flex-col justify-between">
                        <div className="flex items-center justify-between">
                          <span className="bg-[#FF0000] text-white text-[11px] font-extrabold tracking-wider px-2.5 py-0.5 rounded flex items-center gap-1.5">
                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-white" />
                            <span>DOUBT LIVE</span>
                          </span>
                          <span className="bg-black/80 border border-white/15 text-xs font-mono tabular-nums px-2 py-0.5 rounded text-zinc-100">
                            {doubtSlides.length}{' '}
                            {doubtSlides.length === 1 ? 'slide' : 'slides'}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 text-xs font-semibold text-white group-hover:text-red-300 transition-colors">
                          <Play className="w-3.5 h-3.5 fill-current" />
                          <span>Tap to Go Live With Doubts</span>
                        </div>
                      </div>
                    </div>

                    <div className="p-4 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="text-base font-bold truncate">
                          {chapterName}
                        </h2>
                        <p className={`text-xs mt-0.5 ${mutedText}`}>
                          {session.subject} · {doubtSlides.length} doubt{' '}
                          {doubtSlides.length === 1 ? 'page' : 'pages'}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActivePlayer({
                            sessionId: session.id,
                            mode: PlaybackMode.DOUBT_LIVE,
                            doubtSlides,
                            orientationOverride: BroadcastOrientation.VERTICAL,
                          });
                        }}
                        className={`p-2 rounded-lg border cursor-pointer shrink-0 ${subtleSurface}`}
                        title="Open Doubts in Vertical Frame"
                      >
                        <Smartphone className="w-4 h-4 text-red-500" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 4: UNIFIED IMMUTABLE ATTENDANCE LEDGER                        */}
        {/* ================================================================= */}
        {activeTab === 'ATTENDANCE' && (
          <div className="space-y-5">
            <div>
              <h1 className="text-lg font-bold tracking-tight">
                Live Classroom Attendance
              </h1>
              <p className={`text-xs mt-1 ${mutedText}`}>
                Permanent log of primary live chapters and 6:00 AM spaced-repetition broadcasts.
              </p>
            </div>

            <div className={`border rounded-xl overflow-x-auto ${cardBg}`}>
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr
                    className={`border-b text-xs font-semibold ${
                      isNightMode
                        ? 'border-white/10 bg-[#141417] text-zinc-300'
                        : 'border-slate-200 bg-slate-50 text-slate-600'
                    }`}
                  >
                    <th className="py-3 px-4">Chapter</th>
                    <th className="py-3 px-4">Type</th>
                    <th className="py-3 px-4">Live Gate</th>
                    <th className="py-3 px-4 text-right">Pace</th>
                    <th className="py-3 px-4 text-right">Pages Revised</th>
                    <th className="py-3 px-4">Status</th>
                  </tr>
                </thead>
                <tbody
                  className={`divide-y text-xs ${
                    isNightMode ? 'divide-white/10' : 'divide-slate-200'
                  }`}
                >
                  {sessions.map((s) => {
                    const st = computeSessionWallState(s, nowMs);
                    const isSpaced = s.category === SessionCategory.SPACED_REVISION;
                    return (
                      <tr key={s.id}>
                        <td className="py-3 px-4 font-semibold">
                          {s.title}
                        </td>
                        <td className={`py-3 px-4 font-mono ${mutedText}`}>
                          {isSpaced
                            ? `6AM +${s.repetitionIntervalDays}d`
                            : 'Primary Live'}
                        </td>
                        <td className={`py-3 px-4 font-mono tabular-nums ${mutedText}`}>
                          {formatDateTimeShort(s.scheduledStartMs)}
                        </td>
                        <td className="py-3 px-4 font-mono tabular-nums text-right">
                          {s.baseSecondsPerSlide}s/p
                        </td>
                        <td className="py-3 px-4 font-mono tabular-nums text-right">
                          {s.attendedSlides.length}/{s.slides.length}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          {st === ComputedClassState.LIVE_NOW ? (
                            <span className="font-bold text-[#FF0000]">
                              LIVE NOW
                            </span>
                          ) : st === ComputedClassState.UPCOMING ||
                            st === ComputedClassState.LOBBY ? (
                            <span className={`inline-flex items-center gap-1 ${mutedText}`}>
                              <Clock className="w-3.5 h-3.5" />
                              <span>Locked</span>
                            </span>
                          ) : s.attendedSlides.length === 0 ? (
                            <span className="inline-flex items-center gap-1 text-red-500 font-semibold">
                              <ShieldAlert className="w-3.5 h-3.5" />
                              <span>Missed (12h Lock)</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-emerald-500 font-semibold">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Attended</span>
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* Schedule & Chapter Upload Modal */}
      {isScheduleOpen && (
        <ScheduleModal
          isNightMode={isNightMode}
          onClose={() => setIsScheduleOpen(false)}
          onSessionLocked={handleSessionLocked}
        />
      )}

      {/* Fullscreen YouTube Live / Flipkart Vertical Live Broadcast Player */}
      {activeSessionObj && activePlayer && (
        <LiveBroadcastPlayer
          session={activeSessionObj}
          mode={activePlayer.mode}
          doubtSlidesOverride={activePlayer.doubtSlides}
          initialOrientationOverride={activePlayer.orientationOverride}
          onSessionUpdated={handleSessionUpdated}
          onSessionsListRefreshed={(all) => setSessions(all)}
          onExit={() => {
            stopRepeatingClassroomAlarm();
            setActivePlayer(null);
          }}
        />
      )}

      {/* Live Alarm Modal: Rings repeating alarm until user enters classroom or dismisses */}
      {activeAlarmSession && (
        <LiveAlarmModal
          session={activeAlarmSession}
          onEnterLive={(session) => {
            stopRepeatingClassroomAlarm();
            setActiveAlarmSession(null);
            setActivePlayer({
              sessionId: session.id,
              mode: PlaybackMode.LIVE,
            });
          }}
          onDismiss={() => {
            stopRepeatingClassroomAlarm();
            if (activeAlarmSession) {
              dismissedAlarmIdsRef.current.add(activeAlarmSession.id);
            }
            setActiveAlarmSession(null);
          }}
        />
      )}
    </div>
  );
}
