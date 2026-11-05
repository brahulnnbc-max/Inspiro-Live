import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bookmark,
  ChevronUp,
  Coffee,
  Lock,
  Maximize2,
  Minimize2,
  Monitor,
  PauseCircle,
  Play,
  RotateCw,
  Smartphone,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import {
  BroadcastOrientation,
  LiveSession,
  PlaybackMode,
  SessionCategory,
  SlideDescriptor,
} from '../types';
import { renderSlideToCanvas } from '../lib/pdfEngine';
import {
  appendSessionTelemetry,
  enrollChapterInMorningSpacedRepetition,
  MISSED_LIVE_COOLDOWN_MS,
  resolveLiveSlidePosition,
} from '../lib/storage';
import {
  playClassroomShutterLock,
  playCountdownTick,
  playEmergencyHoldSound,
  playLiveGateBell,
  playPresenceCheckPing,
  playSlideAdvanceSound,
} from '../lib/soundEngine';

type ScaleMode = 'FIT' | 'FILL' | 'ZOOM_140';

interface LiveBroadcastPlayerProps {
  session: LiveSession;
  mode: PlaybackMode;
  doubtSlidesOverride?: SlideDescriptor[];
  initialOrientationOverride?: BroadcastOrientation;
  onSessionUpdated: (updated: LiveSession) => void;
  onSessionsListRefreshed?: (all: LiveSession[]) => void;
  onExit: () => void;
}

function formatMMSS(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatHHMMSS(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export const LiveBroadcastPlayer: React.FC<LiveBroadcastPlayerProps> = ({
  session,
  mode,
  doubtSlidesOverride,
  initialOrientationOverride,
  onSessionUpdated,
  onSessionsListRefreshed,
  onExit,
}) => {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const stageBoxRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [replayAnchorMs] = useState<number>(() => Date.now());
  const [localEmergencyMap, setLocalEmergencyMap] = useState<Record<number, number>>({});

  const [orientation, setOrientation] = useState<BroadcastOrientation>(
    initialOrientationOverride ?? session.defaultOrientation
  );
  // Universal 90° step rotation (0, 90, 180, 270) available in BOTH Landscape & Vertical modes
  const [rotationDeg, setRotationDeg] = useState<number>(0);
  const [scaleMode, setScaleMode] = useState<ScaleMode>('FIT');
  const [muted, setMuted] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  // YouTube Live tap-to-show HUD controls (auto-minimizes so slide fills 100% screen)
  const [controlsVisible, setControlsVisible] = useState<boolean>(true);
  const hideTimerRef = useRef<number | null>(null);
  const pointerDownPosRef = useRef<{ x: number; y: number } | null>(null);

  const [confirmExitBanner, setConfirmExitBanner] = useState<boolean>(false);
  const [seekBlockedToast, setSeekBlockedToast] = useState<string>('');
  const [tabWarningBanner, setTabWarningBanner] = useState<boolean>(false);
  const [renderError, setRenderError] = useState<string>('');
  const [stageDims, setStageDims] = useState<{ w: number; h: number }>({
    w: 1280,
    h: 720,
  });

  // 15-Minute Emergency Break Bank for the Entire Live Session
  const [isEmergencyBreakActive, setIsEmergencyBreakActive] = useState<boolean>(false);
  const emergencyBreakStartedAtRef = useRef<number | null>(null);
  const [emergencyBreakElapsedSec, setEmergencyBreakElapsedSec] = useState<number>(0);
  const [hourlyBreakSkippedUntilMs, setHourlyBreakSkippedUntilMs] = useState<number>(0);

  // Presence check ("Roll Call") every 8th slide
  const [activeRollCallSlide, setActiveRollCallSlide] = useState<number | null>(null);
  const handledRollCallSlidesRef = useRef<Set<number>>(new Set());

  const prevSlideRef = useRef<number>(-1);
  const prevTickSecRef = useRef<number>(-1);
  const liveBellPlayedRef = useRef<boolean>(false);
  const shutterSoundPlayedRef = useRef<boolean>(false);

  const sessionRef = useRef<LiveSession>(session);
  sessionRef.current = session;

  // Build effective playback session (supports Doubt Live subset & live emergency break)
  const effectiveSession = useMemo<LiveSession>(() => {
    let s = session;
    if (mode === PlaybackMode.DOUBT_LIVE && doubtSlidesOverride && doubtSlidesOverride.length > 0) {
      s = {
        ...s,
        slides: doubtSlidesOverride,
      };
    }
    if (isEmergencyBreakActive && emergencyBreakElapsedSec > 0) {
      s = {
        ...s,
        emergencyBreakSecondsUsed:
          (s.emergencyBreakSecondsUsed || 0) + emergencyBreakElapsedSec,
      };
    }
    return s;
  }, [session, mode, doubtSlidesOverride, isEmergencyBreakActive, emergencyBreakElapsedSec]);

  const anchorMs =
    mode === PlaybackMode.LIVE ? effectiveSession.scheduledStartMs : replayAnchorMs;
  const activeEmergencyMap =
    mode === PlaybackMode.LIVE ? effectiveSession.emergencyUsedBySlide : localEmergencyMap;

  const isWaitingLobby =
    mode === PlaybackMode.LIVE && nowMs < effectiveSession.scheduledStartMs;

  const rawPos = resolveLiveSlidePosition(
    effectiveSession,
    anchorMs,
    activeEmergencyMap,
    nowMs
  );

  const isEffectiveHourlyBreak = Boolean(
    rawPos.isHourlyBreak && nowMs >= hourlyBreakSkippedUntilMs
  );

  const pos = isEffectiveHourlyBreak
    ? rawPos
    : { ...rawPos, isHourlyBreak: false };

  // Schedule auto-minimize of full YouTube Live controls after 3.8s of reading
  const scheduleAutoMinimize = useCallback(() => {
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
    }
    hideTimerRef.current = window.setTimeout(() => {
      setControlsVisible(false);
    }, 3800);
  }, []);

  useEffect(() => {
    if (controlsVisible && !confirmExitBanner) {
      scheduleAutoMinimize();
    }
    return () => {
      if (hideTimerRef.current !== null) {
        window.clearTimeout(hideTimerRef.current);
      }
    };
  }, [controlsVisible, confirmExitBanner, scheduleAutoMinimize]);

  const keepControlsAwake = useCallback(() => {
    setControlsVisible(true);
    scheduleAutoMinimize();
  }, [scheduleAutoMinimize]);

  // Enter browser fullscreen automatically upon opening Live Screen
  const enterFullscreenSafe = useCallback(async () => {
    const el = rootRef.current;
    if (!el) return;
    try {
      if (!document.fullscreenElement && el.requestFullscreen) {
        await el.requestFullscreen();
      }
    } catch {
      // Sandboxed iframe or mobile gesture fallback: fixed inset-0 still fills 100% viewport
    }
  }, []);

  const toggleFullscreen = useCallback(async () => {
    keepControlsAwake();
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else if (rootRef.current?.requestFullscreen) {
        await rootRef.current.requestFullscreen();
      }
    } catch {
      // Ignore restriction
    }
  }, [keepControlsAwake]);

  useEffect(() => {
    enterFullscreenSafe();
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, [enterFullscreenSafe]);

  // Track stage container resize so fullscreen / rotation renders razor-sharply
  useEffect(() => {
    const el = stageBoxRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const w = Math.round(entry.contentRect.width);
      const h = Math.round(entry.contentRect.height);
      if (w > 40 && h > 40) {
        setStageDims((prev) =>
          Math.abs(prev.w - w) > 8 || Math.abs(prev.h - h) > 8 ? { w, h } : prev
        );
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [orientation, isWaitingLobby, pos.ended]);

  // Smooth wall-clock ticker (250ms)
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 250);
    return () => window.clearInterval(timer);
  }, []);

  // Anti-Tab-Switch classroom monitor during Live Broadcast
  useEffect(() => {
    if (mode !== PlaybackMode.LIVE) return;
    const handleVisibility = () => {
      if (document.hidden && !pos.ended && Date.now() >= sessionRef.current.scheduledStartMs) {
        const current = sessionRef.current;
        const nextCount = current.tabSwitchCount + 1;
        setTabWarningBanner(true);
        appendSessionTelemetry(current.id, { tabSwitchCount: nextCount }).then(
          (updated) => {
            if (updated) onSessionUpdated(updated);
          }
        );
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [mode, pos.ended, onSessionUpdated]);

  // Record late entry missed slides + attended slides + audio cues
  useEffect(() => {
    if (isWaitingLobby) return;

    if (!liveBellPlayedRef.current && !pos.ended) {
      liveBellPlayedRef.current = true;
      playLiveGateBell(muted);

      if (mode === PlaybackMode.LIVE) {
        const cur = sessionRef.current;
        const lateIndices: number[] = [];
        if (!cur.firstJoinedLiveAtMs && pos.slideIndex > 0) {
          for (let i = 0; i < pos.slideIndex; i++) {
            if (!cur.attendedSlides.includes(i)) {
              lateIndices.push(i);
            }
          }
        }
        const mergedLate = Array.from(
          new Set([...cur.lateMissedSlides, ...lateIndices])
        );
        const mergedAttended = Array.from(
          new Set([...cur.attendedSlides, pos.slideIndex])
        );
        appendSessionTelemetry(cur.id, {
          firstJoinedLiveAtMs: cur.firstJoinedLiveAtMs ?? Date.now(),
          lateMissedSlides: mergedLate,
          attendedSlides: mergedAttended,
        }).then((u) => {
          if (u) onSessionUpdated(u);
        });
      }
      prevSlideRef.current = pos.slideIndex;
      return;
    }

    if (pos.ended) {
      if (!shutterSoundPlayedRef.current) {
        shutterSoundPlayedRef.current = true;
        playClassroomShutterLock(muted);
        if (mode === PlaybackMode.LIVE) {
          const cur = sessionRef.current;
          const missedAll = cur.attendedSlides.length === 0;
          appendSessionTelemetry(cur.id, {
            finalizedAfterLive: true,
            missedCooldownUntilMs: missedAll
              ? Date.now() + MISSED_LIVE_COOLDOWN_MS
              : undefined,
          }).then(async (u) => {
            if (u) onSessionUpdated(u);
            if (
              !missedAll &&
              cur.category !== SessionCategory.SPACED_REVISION &&
              !cur.spacedScheduleGenerated
            ) {
              const all = await enrollChapterInMorningSpacedRepetition(
                cur.id,
                Date.now()
              );
              onSessionsListRefreshed?.(all);
            }
          });
        } else if (mode === PlaybackMode.RECORDED_REPLAY) {
          const cur = sessionRef.current;
          appendSessionTelemetry(cur.id, {
            recordedReplaysCount: cur.recordedReplaysCount + 1,
          }).then((u) => {
            if (u) onSessionUpdated(u);
          });
        }
      }
      return;
    }

    // Slide flipped automatically!
    if (prevSlideRef.current !== -1 && prevSlideRef.current !== pos.slideIndex) {
      if (activeRollCallSlide !== null && activeRollCallSlide !== pos.slideIndex) {
        setActiveRollCallSlide(null);
        if (mode === PlaybackMode.LIVE) {
          const cur = sessionRef.current;
          appendSessionTelemetry(cur.id, {
            presenceChecksMissed: cur.presenceChecksMissed + 1,
          }).then((u) => {
            if (u) onSessionUpdated(u);
          });
        }
      }

      prevSlideRef.current = pos.slideIndex;
      prevTickSecRef.current = -1;
      playSlideAdvanceSound(muted);

      if (mode === PlaybackMode.LIVE) {
        const cur = sessionRef.current;
        if (!cur.attendedSlides.includes(pos.slideIndex)) {
          const merged = [...cur.attendedSlides, pos.slideIndex];
          appendSessionTelemetry(cur.id, { attendedSlides: merged }).then((u) => {
            if (u) onSessionUpdated(u);
          });
        }
      }
    }

    // Final 10-second per-page countdown tick
    const remSec = Math.ceil(pos.slideRemainingMs / 1000);
    if (remSec <= 10 && remSec >= 1 && remSec !== prevTickSecRef.current) {
      prevTickSecRef.current = remSec;
      playCountdownTick(muted, remSec <= 3);
    }

    // Trigger Presence Roll Call every 8th slide on longer (>=22s) live slides
    const isRollCallSlide = (pos.slideIndex + 1) % 8 === 0;
    const rollTriggerMs = Math.min(
      14000,
      Math.floor(effectiveSession.baseSecondsPerSlide * 450)
    );
    if (
      mode === PlaybackMode.LIVE &&
      effectiveSession.baseSecondsPerSlide >= 22 &&
      isRollCallSlide &&
      pos.slideElapsedMs >= rollTriggerMs &&
      pos.slideRemainingMs >= 6000 &&
      !handledRollCallSlidesRef.current.has(pos.slideIndex)
    ) {
      handledRollCallSlidesRef.current.add(pos.slideIndex);
      setActiveRollCallSlide(pos.slideIndex);
      playPresenceCheckPing(muted);
    }
  }, [
    isWaitingLobby,
    pos.ended,
    pos.slideIndex,
    pos.slideElapsedMs,
    pos.slideRemainingMs,
    effectiveSession.baseSecondsPerSlide,
    muted,
    mode,
    activeRollCallSlide,
    onSessionUpdated,
    onSessionsListRefreshed,
  ]);

  const numericZoom = scaleMode === 'ZOOM_140' ? 1.4 : 1.15;

  // Render active slide onto full-bleed high-DPI canvas
  useEffect(() => {
    if (isWaitingLobby || pos.ended) return;
    const canvas = canvasRef.current;
    const stageEl = stageBoxRef.current;
    const activeSlide = effectiveSession.slides[pos.slideIndex];
    if (!canvas || !stageEl || !activeSlide) return;

    let cancelled = false;
    setRenderError('');

    const rect = stageEl.getBoundingClientRect();
    const effW = rect.width > 40 ? rect.width : stageDims.w;
    const effH = rect.height > 40 ? rect.height : stageDims.h;

    renderSlideToCanvas(
      canvas,
      activeSlide,
      effectiveSession.slides.length,
      orientation,
      numericZoom,
      effW,
      effH,
      rotationDeg
    ).catch((err) => {
      if (!cancelled) {
        setRenderError(
          err instanceof Error ? err.message : 'Unable to render note slide.'
        );
      }
    });

    return () => {
      cancelled = true;
    };
  }, [
    isWaitingLobby,
    pos.ended,
    pos.slideIndex,
    orientation,
    rotationDeg,
    numericZoom,
    effectiveSession.slides,
    isFullscreen,
    stageDims.w,
    stageDims.h,
  ]);

  // +45s Emergency Break handler (strictly once per page!)
  const triggerEmergencyBreak = useCallback(async () => {
    keepControlsAwake();
    if (isWaitingLobby || pos.ended) return;
    const idx = pos.slideIndex;
    if (activeEmergencyMap[idx]) return;

    playEmergencyHoldSound(muted);

    if (mode === PlaybackMode.LIVE) {
      const nextMap = {
        ...sessionRef.current.emergencyUsedBySlide,
        [idx]: Date.now(),
      };
      const updated = await appendSessionTelemetry(sessionRef.current.id, {
        emergencyUsedBySlide: nextMap,
      });
      if (updated) onSessionUpdated(updated);
    } else {
      setLocalEmergencyMap((prev) => ({ ...prev, [idx]: Date.now() }));
    }
  }, [
    keepControlsAwake,
    isWaitingLobby,
    pos.ended,
    pos.slideIndex,
    activeEmergencyMap,
    muted,
    mode,
    onSessionUpdated,
  ]);

  // 15-Minute Emergency Break Bank for Entire Lecture
  const totalEmergencyUsed =
    (effectiveSession.emergencyBreakSecondsUsed || 0) +
    (isEmergencyBreakActive ? emergencyBreakElapsedSec : 0);
  const remainingEmergencyBankSec = Math.max(0, 900 - totalEmergencyUsed);

  const handleResumeFromEmergencyBreak = useCallback(async () => {
    if (!emergencyBreakStartedAtRef.current) {
      setIsEmergencyBreakActive(false);
      return;
    }
    const elapsedSec = Math.floor((Date.now() - emergencyBreakStartedAtRef.current) / 1000);
    const prevUsed = sessionRef.current.emergencyBreakSecondsUsed || 0;
    const newTotal = Math.min(900, prevUsed + elapsedSec);

    setIsEmergencyBreakActive(false);
    emergencyBreakStartedAtRef.current = null;
    setEmergencyBreakElapsedSec(0);

    const updated = await appendSessionTelemetry(sessionRef.current.id, {
      emergencyBreakSecondsUsed: newTotal,
    });
    if (updated) onSessionUpdated(updated);
  }, [onSessionUpdated]);

  const startEmergencyBreak = useCallback(() => {
    keepControlsAwake();
    if (isWaitingLobby || pos.ended || isEmergencyBreakActive) return;
    const alreadyUsed = sessionRef.current.emergencyBreakSecondsUsed || 0;
    if (alreadyUsed >= 900) return;

    emergencyBreakStartedAtRef.current = Date.now();
    setEmergencyBreakElapsedSec(0);
    setIsEmergencyBreakActive(true);
  }, [keepControlsAwake, isWaitingLobby, pos.ended, isEmergencyBreakActive]);

  // Auto-track 15-minute emergency break timer
  useEffect(() => {
    if (!isEmergencyBreakActive) return;
    const interval = window.setInterval(() => {
      if (emergencyBreakStartedAtRef.current) {
        const sec = Math.floor((Date.now() - emergencyBreakStartedAtRef.current) / 1000);
        setEmergencyBreakElapsedSec(sec);
        const prevUsed = sessionRef.current.emergencyBreakSecondsUsed || 0;
        if (prevUsed + sec >= 900) {
          handleResumeFromEmergencyBreak();
        }
      }
    }, 500);
    return () => window.clearInterval(interval);
  }, [isEmergencyBreakActive, handleResumeFromEmergencyBreak]);

  const skipHourlyBreakEarly = useCallback(() => {
    if (pos.hourlyBreakRemainingMs) {
      setHourlyBreakSkippedUntilMs(Date.now() + pos.hourlyBreakRemainingMs + 1000);
    }
  }, [pos.hourlyBreakRemainingMs]);

  // Resolve real parent slide index (for Doubt Live mode as well as normal Live mode)
  const currentSlide = effectiveSession.slides[pos.slideIndex];
  const parentSlideIndex =
    currentSlide?.originalSlideIndex !== undefined
      ? currentSlide.originalSlideIndex
      : pos.slideIndex;

  // Toggle Doubt Slide on the parent chapter
  const toggleDoubtSlide = useCallback(async () => {
    keepControlsAwake();
    if (isWaitingLobby || pos.ended) return;
    const cur = sessionRef.current;
    const targetIdx = parentSlideIndex;
    const exists = cur.starredSlideIndices.includes(targetIdx);
    const nextStarred = exists
      ? cur.starredSlideIndices.filter((i) => i !== targetIdx)
      : [...cur.starredSlideIndices, targetIdx];

    const updated = await appendSessionTelemetry(cur.id, {
      starredSlideIndices: nextStarred,
    });
    if (updated) onSessionUpdated(updated);
  }, [keepControlsAwake, isWaitingLobby, pos.ended, parentSlideIndex, onSessionUpdated]);

  const confirmPresenceCheck = useCallback(async () => {
    if (activeRollCallSlide === null) return;
    setActiveRollCallSlide(null);
    if (mode === PlaybackMode.LIVE) {
      const cur = sessionRef.current;
      const updated = await appendSessionTelemetry(cur.id, {
        presenceChecksPassed: cur.presenceChecksPassed + 1,
      });
      if (updated) onSessionUpdated(updated);
    }
  }, [activeRollCallSlide, mode, onSessionUpdated]);

  const rotateBy90 = useCallback(() => {
    keepControlsAwake();
    setRotationDeg((prev) => (prev + 90) % 360);
  }, [keepControlsAwake]);

  const cycleScaleMode = useCallback(() => {
    keepControlsAwake();
    setScaleMode((prev) =>
      prev === 'FIT' ? 'FILL' : prev === 'FILL' ? 'ZOOM_140' : 'FIT'
    );
  }, [keepControlsAwake]);

  const notifySeekBlocked = useCallback((msg: string) => {
    setSeekBlockedToast(msg);
    window.setTimeout(() => setSeekBlockedToast(''), 2000);
  }, []);

  // Tap anywhere on the fullscreen slide stage to toggle YouTube Live badges/controls
  const handleStagePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    pointerDownPosRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleStagePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const down = pointerDownPosRef.current;
    pointerDownPosRef.current = null;
    if (!down) return;
    const dx = Math.abs(e.clientX - down.x);
    const dy = Math.abs(e.clientY - down.y);
    if (dx <= 10 && dy <= 10) {
      setControlsVisible((v) => !v);
    }
  };

  // Keyboard shortcuts inside Live Room
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && activeRollCallSlide !== null) {
        e.preventDefault();
        confirmPresenceCheck();
        return;
      }
      if (e.key === 'e' || e.key === 'E') {
        triggerEmergencyBreak();
      } else if (e.key === 'd' || e.key === 'D' || e.key === 's' || e.key === 'S') {
        toggleDoubtSlide();
      } else if (e.key === 'v' || e.key === 'V') {
        keepControlsAwake();
        setOrientation((o) =>
          o === BroadcastOrientation.VERTICAL
            ? BroadcastOrientation.LANDSCAPE
            : BroadcastOrientation.VERTICAL
        );
      } else if (e.key === 'r' || e.key === 'R') {
        rotateBy90();
      } else if (e.key === 'f' || e.key === 'F') {
        toggleFullscreen();
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        notifySeekBlocked('Live Stream Locked — Scrubbing & skipping disabled');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    activeRollCallSlide,
    confirmPresenceCheck,
    triggerEmergencyBreak,
    toggleDoubtSlide,
    keepControlsAwake,
    rotateBy90,
    toggleFullscreen,
    notifySeekBlocked,
  ]);

  const emergencyAlreadyUsedOnSlide = Boolean(activeEmergencyMap[pos.slideIndex]);
  const isCurrentSlideDoubt = session.starredSlideIndices.includes(parentSlideIndex);

  const slidePctElapsed =
    pos.slideTotalMs > 0
      ? Math.max(0, Math.min(100, (pos.slideElapsedMs / pos.slideTotalMs) * 100))
      : 0;

  const elapsedStreamMs = Math.max(0, nowMs - anchorMs);
  const hardCloseRemainingMs = Math.max(0, effectiveSession.hardCloseMs - nowMs);
  const isFinalTenSec = pos.slideRemainingMs <= 10000;
  const padCount = effectiveSession.slides.length >= 100 ? 3 : 2;

  const canvasClass =
    scaleMode === 'FIT'
      ? 'max-w-full max-h-full w-auto h-auto block select-none'
      : scaleMode === 'FILL'
      ? 'w-full h-auto max-w-none block my-auto select-none'
      : 'w-[140%] h-auto max-w-none block select-none';

  const stageAlignClass =
    scaleMode === 'FIT'
      ? 'items-center justify-center overflow-hidden'
      : scaleMode === 'FILL'
      ? 'items-center justify-center overflow-auto'
      : 'items-start justify-start overflow-auto';

  const scaleLabel =
    scaleMode === 'FIT' ? 'Fit' : scaleMode === 'FILL' ? 'Fill' : '140%';

  const badgeStreamText =
    mode === PlaybackMode.DOUBT_LIVE || effectiveSession.isDoubtTelecast
      ? 'DOUBT LIVE'
      : effectiveSession.category === SessionCategory.SPACED_REVISION
      ? `6AM R${effectiveSession.repetitionStage ?? 1} LIVE`
      : mode === PlaybackMode.LIVE
      ? 'LIVE'
      : 'LIVE REPLAY';

  // 1. WAITING LOBBY VIEW (Premiere Countdown before Exact Start Time)
  if (isWaitingLobby) {
    const waitMs = Math.max(0, effectiveSession.scheduledStartMs - nowMs);
    return (
      <div
        ref={rootRef}
        className="fixed inset-0 z-50 bg-[#09090B] text-white flex flex-col items-center justify-center p-6 select-none"
      >
        <div className="max-w-lg w-full border border-white/15 bg-[#121216] rounded-xl p-8 text-center space-y-6">
          <div className="inline-flex items-center gap-2 bg-[#FF0000] text-white text-xs font-extrabold tracking-wider px-3 py-1 rounded">
            <span className="inline-block w-2 h-2 rounded-full bg-white" />
            <span>UPCOMING LIVE STREAM</span>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-mono text-zinc-400">
              {effectiveSession.subject} · {effectiveSession.slides.length} Pages ·{' '}
              {effectiveSession.baseSecondsPerSlide}s/page +{' '}
              {effectiveSession.emergencySecondsPerSlide}s Hold
            </p>
            <h1 className="text-2xl font-bold text-white text-balance">
              {effectiveSession.chapterName || effectiveSession.title}
            </h1>
          </div>

          <div className="py-6 border-y border-white/10">
            <p className="text-xs text-zinc-400 mb-2">
              Live Stream Starts Automatically In
            </p>
            <div className="text-5xl font-mono font-bold tabular-nums text-white tracking-tight">
              {formatHHMMSS(waitMs)}
            </div>
            <p className="text-xs font-mono text-zinc-400 mt-3">
              Opens Exact:{' '}
              {new Date(effectiveSession.scheduledStartMs).toLocaleTimeString()}
            </p>
          </div>

          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onExit}
              className="px-4 py-2.5 text-xs font-medium text-zinc-300 hover:text-white border border-white/15 rounded-lg cursor-pointer"
            >
              Exit Lobby
            </button>
            <button
              type="button"
              onClick={() =>
                setOrientation((o) =>
                  o === BroadcastOrientation.VERTICAL
                    ? BroadcastOrientation.LANDSCAPE
                    : BroadcastOrientation.VERTICAL
                )
              }
              className="px-4 py-2.5 text-xs font-semibold bg-white text-zinc-950 rounded-lg cursor-pointer"
            >
              Mode:{' '}
              {orientation === BroadcastOrientation.VERTICAL
                ? 'Vertical Live'
                : 'YouTube 16:9 Live'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 2. IMMEDIATE HARD SHUTTER LOCK VIEW (When Stream Finishes)
  if (pos.ended) {
    return (
      <div
        ref={rootRef}
        className="fixed inset-0 z-50 bg-[#09090B] text-white flex flex-col items-center justify-center p-6 select-none"
      >
        <div className="max-w-lg w-full border border-white/15 bg-[#121216] rounded-xl p-8 space-y-6">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 bg-zinc-800 text-zinc-200 text-xs font-bold tracking-wider px-3 py-1 rounded">
              <Lock className="w-3.5 h-3.5 text-red-500" />
              <span>
                {mode === PlaybackMode.DOUBT_LIVE
                  ? 'DOUBT LIVE COMPLETED'
                  : 'LIVE STREAM ENDED ON TIME'}
              </span>
            </span>
            <span className="text-xs font-mono text-zinc-400">
              {effectiveSession.subject}
            </span>
          </div>

          <div>
            <h2 className="text-2xl font-bold text-white">
              {effectiveSession.chapterName || effectiveSession.title}
            </h2>
            <p className="text-sm text-zinc-400 mt-1">
              {mode === PlaybackMode.DOUBT_LIVE
                ? 'All flagged doubt pages for this chapter have finished their live countdown.'
                : session.category !== SessionCategory.SPACED_REVISION &&
                  session.attendedSlides.length > 0
                ? 'Chapter revised live! Automatically scheduled into 6:00 AM Re-Revision (Day +3 · 30s, Day +7 · 22s, Day +21 · 15s, Day +45 · 10s).'
                : 'Classroom shutter closed automatically. Attendance and flagged doubts are saved.'}
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3 py-4 border-y border-white/10 text-center">
            <div>
              <div className="text-2xl font-mono font-bold tabular-nums text-emerald-400">
                {mode === PlaybackMode.DOUBT_LIVE
                  ? effectiveSession.slides.length
                  : session.attendedSlides.length}
              </div>
              <div className="text-xs text-zinc-400 mt-0.5">Pages Revised</div>
            </div>
            <div>
              <div className="text-2xl font-mono font-bold tabular-nums text-amber-400">
                {Object.keys(activeEmergencyMap).length}
              </div>
              <div className="text-xs text-zinc-400 mt-0.5">+45s Holds</div>
            </div>
            <div>
              <div className="text-2xl font-mono font-bold tabular-nums text-white">
                {session.starredSlideIndices.length}
              </div>
              <div className="text-xs text-zinc-400 mt-0.5">Chapter Doubts</div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              if (document.fullscreenElement) {
                document.exitFullscreen().catch(() => {});
              }
              onExit();
            }}
            className="w-full py-3 text-sm font-semibold bg-white text-zinc-950 hover:bg-zinc-200 rounded-lg transition-colors cursor-pointer"
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  // 3. 15-MINUTE EMERGENCY BREAK SCREEN (Entire Lecture Bank)
  if (isEmergencyBreakActive) {
    const remM = Math.floor(remainingEmergencyBankSec / 60);
    const remS = remainingEmergencyBankSec % 60;

    return (
      <div
        ref={rootRef}
        className="fixed inset-0 z-50 bg-[#09090B] text-white flex flex-col items-center justify-center p-6 select-none"
      >
        <div className="max-w-md w-full border border-amber-500/30 bg-[#141418] rounded-2xl p-6 sm:p-8 text-center space-y-6 shadow-2xl">
          <div className="inline-flex items-center gap-2 bg-amber-500/15 border border-amber-500/30 text-amber-400 text-xs font-mono font-bold px-3 py-1.5 rounded-full">
            <span className="inline-block w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <span>15-MINUTE EMERGENCY BREAK ACTIVE</span>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-mono text-zinc-400">
              {effectiveSession.chapterName || effectiveSession.title} · Slide {pos.slideIndex + 1}
            </p>
            <h2 className="text-xl sm:text-2xl font-bold text-white">
              Live Classroom On Hold
            </h2>
            <p className="text-xs text-zinc-400 leading-relaxed max-w-sm mx-auto">
              You have a total 15-minute emergency break allowance for this entire lecture. Your slides will resume exactly where you paused.
            </p>
          </div>

          <div className="py-4 border-y border-white/10 space-y-1">
            <div className="text-4xl sm:text-5xl font-mono font-extrabold text-amber-400 tabular-nums">
              {String(remM).padStart(2, '0')}:{String(remS).padStart(2, '0')}
            </div>
            <p className="text-[11px] font-mono text-zinc-400">
              Remaining in your 15-minute emergency bank
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={handleResumeFromEmergencyBreak}
              className="w-full py-3.5 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-sm rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-2"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>Resume Live Classroom</span>
            </button>
            <button
              type="button"
              onClick={() => setConfirmExitBanner(true)}
              className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors py-1 cursor-pointer"
            >
              Leave Live Stream
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 4. HOURLY 5-MINUTE INTERMISSION SCREEN ("1 hour after 5 min break")
  if (isEffectiveHourlyBreak) {
    const breakRemSec = Math.max(0, Math.ceil((pos.hourlyBreakRemainingMs || 0) / 1000));
    const remM = Math.floor(breakRemSec / 60);
    const remS = breakRemSec % 60;

    return (
      <div
        ref={rootRef}
        className="fixed inset-0 z-50 bg-[#09090B] text-white flex flex-col items-center justify-center p-6 select-none"
      >
        <div className="max-w-md w-full border border-blue-500/30 bg-[#12131A] rounded-2xl p-6 sm:p-8 text-center space-y-6 shadow-2xl">
          <div className="inline-flex items-center gap-2 bg-blue-500/15 border border-blue-500/30 text-blue-400 text-xs font-mono font-bold px-3 py-1.5 rounded-full">
            <Coffee className="w-3.5 h-3.5" />
            <span>HOURLY INTERMISSION · 5-MINUTE BREAK</span>
          </div>

          <div className="space-y-2">
            <h2 className="text-xl sm:text-2xl font-bold text-white">
              Hydrate & Rest Your Eyes
            </h2>
            <p className="text-xs text-zinc-400 leading-relaxed max-w-sm mx-auto">
              1 hour of continuous study completed. Look 20 feet away to relax eye muscles, drink water, and stand up. Next slide opens automatically when break finishes.
            </p>
          </div>

          <div className="py-4 border-y border-white/10 space-y-1">
            <div className="text-4xl sm:text-5xl font-mono font-extrabold text-blue-400 tabular-nums">
              {String(remM).padStart(2, '0')}:{String(remS).padStart(2, '0')}
            </div>
            <p className="text-[11px] font-mono text-zinc-400">
              5-minute intermission countdown
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={skipHourlyBreakEarly}
              className="w-full py-3 bg-white/10 hover:bg-white/15 border border-white/20 text-white font-semibold text-xs rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-2"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Skip Break & Continue Lecture</span>
            </button>
            <p className="text-[10px] font-mono text-zinc-400">
              Auto-resumes in {remM}:{String(remS).padStart(2, '0')}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // 3A. VERTICAL REAL-FRAME MODE (Flipkart Live / YouTube Vertical Live — Fullscreen Slide + Tap-to-Show HUD)
  if (orientation === BroadcastOrientation.VERTICAL) {
    return (
      <div
        ref={rootRef}
        className="fixed inset-0 z-50 bg-black text-white flex items-center justify-center overflow-hidden select-none"
      >
        <div className="relative w-full sm:max-w-[540px] h-full bg-[#141418] sm:border-x sm:border-white/10 overflow-hidden">
          {/* 100% FULLSCREEN SLIDE STAGE (Tap anywhere to show/hide full badges) */}
          <div
            ref={stageBoxRef}
            onPointerDown={handleStagePointerDown}
            onPointerUp={handleStagePointerUp}
            className={`absolute inset-0 w-full h-full flex bg-[#141418] ${stageAlignClass}`}
          >
            {renderError ? (
              <div className="text-xs text-red-400 p-4 text-center m-auto">
                {renderError}
              </div>
            ) : (
              <canvas ref={canvasRef} className={canvasClass} />
            )}
          </div>

          {/* MINIMIZED YOUTUBE / FLIPKART LIVE CORNER BADGE (Visible when controls are hidden so screen is 100% full!) */}
          {!controlsVisible && (
            <>
              <div className="absolute top-2.5 left-2.5 z-20 flex items-center gap-1.5 pointer-events-none">
                <div className="bg-[#FF0000] text-white text-[11px] font-extrabold tracking-wider px-2 py-0.5 rounded flex items-center gap-1 shadow-md">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-white" />
                  <span>{badgeStreamText}</span>
                </div>

                <div
                  className={`px-2 py-0.5 rounded text-[11px] font-mono tabular-nums font-bold shadow-md flex items-center gap-1.5 border ${
                    pos.inEmergencyWindow
                      ? 'bg-amber-500/95 text-zinc-950 border-amber-300'
                      : isFinalTenSec
                      ? 'bg-[#FF0000]/95 text-white border-red-300'
                      : 'bg-black/65 text-white border-white/15'
                  }`}
                >
                  <span>{formatHHMMSS(elapsedStreamMs)}</span>
                  <span className="opacity-60">·</span>
                  <span>
                    {pos.inEmergencyWindow ? 'HOLD ' : ''}
                    {formatMMSS(pos.slideRemainingMs)}
                  </span>
                  <span className="opacity-60">·</span>
                  <span>
                    {String(pos.slideIndex + 1).padStart(padCount, '0')}/
                    {String(effectiveSession.slides.length).padStart(padCount, '0')}
                  </span>
                </div>
              </div>

              {/* Thin YouTube Live bottom red progress hairline */}
              <div className="absolute bottom-0 inset-x-0 z-20 pointer-events-none">
                <svg className="w-full h-[3px] block">
                  <rect width="100%" height="100%" className="fill-white/15" />
                  <rect
                    width={`${slidePctElapsed}%`}
                    height="100%"
                    className={
                      pos.inEmergencyWindow ? 'fill-amber-400' : 'fill-[#FF0000]'
                    }
                  />
                </svg>
              </div>
            </>
          )}

          {/* FULL OVERLAY CONTROLS (Shown only when user taps screen!) */}
          {controlsVisible && (
            <>
              {/* Top Overlay Bar */}
              <div className="absolute top-0 inset-x-0 z-20 bg-gradient-to-b from-black/90 via-black/60 to-transparent pt-3 pb-8 px-3.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="bg-[#FF0000] text-white text-xs font-extrabold tracking-wider px-2.5 py-1 rounded flex items-center gap-1.5 shrink-0 shadow-md">
                      <span className="inline-block w-2 h-2 rounded-full bg-white" />
                      <span>{badgeStreamText}</span>
                    </div>

                    <div className="min-w-0">
                      <div className="text-xs font-bold text-white truncate">
                        {effectiveSession.chapterName || effectiveSession.title}
                      </div>
                      <div className="text-[11px] font-mono text-zinc-300 truncate">
                        {effectiveSession.subject} · {currentSlide?.label}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <div
                      className={`px-2.5 py-1 rounded font-mono tabular-nums text-sm font-bold border ${
                        pos.inEmergencyWindow
                          ? 'bg-amber-500 text-zinc-950 border-amber-300'
                          : isFinalTenSec
                          ? 'bg-[#FF0000] text-white border-red-300'
                          : 'bg-black/80 text-white border-white/20'
                      }`}
                    >
                      {formatMMSS(pos.slideRemainingMs)}
                    </div>

                    <button
                      type="button"
                      onClick={() => setControlsVisible(false)}
                      className="p-1.5 rounded bg-black/75 hover:bg-black text-zinc-200 border border-white/15 cursor-pointer"
                      title="Minimize HUD to Fullscreen"
                    >
                      <ChevronUp className="w-4 h-4" />
                    </button>

                    <button
                      type="button"
                      onClick={() => setConfirmExitBanner(true)}
                      className="p-1.5 rounded bg-black/75 hover:bg-black text-zinc-200 border border-white/15 cursor-pointer"
                      aria-label="Leave live stream"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Right-Edge Flipkart / YT Vertical Live Action Stack */}
              <div className="absolute right-3 bottom-20 z-20 flex flex-col items-center gap-2.5">
                <button
                  type="button"
                  disabled={remainingEmergencyBankSec <= 0}
                  onClick={startEmergencyBreak}
                  className={`flex flex-col items-center justify-center w-12 h-12 rounded-full border shadow-lg cursor-pointer ${
                    remainingEmergencyBankSec <= 0
                      ? 'bg-zinc-900/85 border-zinc-700 text-zinc-500 cursor-not-allowed'
                      : 'bg-amber-600 hover:bg-amber-500 border-amber-300 text-white'
                  }`}
                  title="15-Minute Emergency Break for Entire Lecture"
                >
                  <Coffee className="w-5 h-5" />
                  <span className="text-[8px] font-mono font-bold leading-none mt-0.5">
                    {remainingEmergencyBankSec <= 0
                      ? '0m'
                      : `${Math.ceil(remainingEmergencyBankSec / 60)}m`}
                  </span>
                </button>

                <button
                  type="button"
                  disabled={emergencyAlreadyUsedOnSlide}
                  onClick={triggerEmergencyBreak}
                  className={`flex flex-col items-center justify-center w-12 h-12 rounded-full border shadow-lg cursor-pointer ${
                    emergencyAlreadyUsedOnSlide
                      ? 'bg-zinc-900/85 border-zinc-700 text-zinc-500 cursor-not-allowed'
                      : 'bg-amber-500 hover:bg-amber-400 border-amber-200 text-zinc-950'
                  }`}
                  title="Emergency +45s Hold"
                >
                  <PauseCircle className="w-5 h-5" />
                  <span className="text-[9px] font-mono font-extrabold leading-none mt-0.5">
                    {emergencyAlreadyUsedOnSlide
                      ? 'USED'
                      : `+${effectiveSession.emergencySecondsPerSlide}s`}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={toggleDoubtSlide}
                  className={`flex flex-col items-center justify-center w-11 h-11 rounded-full border shadow-lg cursor-pointer ${
                    isCurrentSlideDoubt
                      ? 'bg-red-600 border-red-300 text-white'
                      : 'bg-black/80 hover:bg-black border-white/20 text-white'
                  }`}
                  title="Mark Slide in Chapter Doubts"
                >
                  <Bookmark className="w-4 h-4" />
                  <span className="text-[9px] font-semibold mt-0.5">Doubt</span>
                </button>

                <button
                  type="button"
                  onClick={rotateBy90}
                  className={`flex flex-col items-center justify-center w-11 h-11 rounded-full border shadow-lg cursor-pointer ${
                    rotationDeg !== 0
                      ? 'bg-blue-600 border-blue-300 text-white'
                      : 'bg-black/80 hover:bg-black border-white/20 text-white'
                  }`}
                  title="Rotate 90°"
                >
                  <RotateCw className="w-4 h-4" />
                  <span className="text-[9px] font-mono mt-0.5">
                    {rotationDeg === 0 ? '90°' : `${rotationDeg}°`}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={cycleScaleMode}
                  className="flex flex-col items-center justify-center w-11 h-11 rounded-full bg-black/80 hover:bg-black border border-white/20 text-white shadow-lg cursor-pointer"
                  title="Fit / Fill / Zoom"
                >
                  <span className="text-[10px] font-mono font-bold">
                    {scaleLabel}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    keepControlsAwake();
                    setOrientation(BroadcastOrientation.LANDSCAPE);
                  }}
                  className="flex flex-col items-center justify-center w-11 h-11 rounded-full bg-black/80 hover:bg-black border border-white/20 text-white shadow-lg cursor-pointer"
                  title="Switch to YouTube 16:9 Live"
                >
                  <Monitor className="w-4 h-4" />
                  <span className="text-[9px] font-semibold mt-0.5">16:9</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    keepControlsAwake();
                    setMuted((m) => !m);
                  }}
                  className="flex items-center justify-center w-10 h-10 rounded-full bg-black/80 hover:bg-black border border-white/20 text-white shadow-lg cursor-pointer"
                >
                  {muted ? (
                    <VolumeX className="w-4 h-4 text-zinc-400" />
                  ) : (
                    <Volume2 className="w-4 h-4" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={toggleFullscreen}
                  className="flex items-center justify-center w-10 h-10 rounded-full bg-black/80 hover:bg-black border border-white/20 text-white shadow-lg cursor-pointer"
                >
                  {isFullscreen ? (
                    <Minimize2 className="w-4 h-4" />
                  ) : (
                    <Maximize2 className="w-4 h-4" />
                  )}
                </button>
              </div>

              {/* Bottom YT / Flipkart Live Scrim */}
              <div className="absolute bottom-0 inset-x-0 z-20 bg-gradient-to-t from-black/95 via-black/65 to-transparent pt-7 pb-2.5 px-3.5">
                <div className="flex items-center justify-between text-xs font-mono tabular-nums text-zinc-200 mb-2 pr-12">
                  <span>
                    ● LIVE {formatHHMMSS(elapsedStreamMs)} · Slide{' '}
                    {String(pos.slideIndex + 1).padStart(padCount, '0')}/
                    {String(effectiveSession.slides.length).padStart(
                      padCount,
                      '0'
                    )}
                  </span>
                  {mode === PlaybackMode.LIVE && (
                    <span>Closes {formatHHMMSS(hardCloseRemainingMs)}</span>
                  )}
                </div>

                <div
                  onClick={() =>
                    notifySeekBlocked('Live broadcast locked — scrubbing disabled')
                  }
                  className="cursor-not-allowed"
                >
                  <svg className="w-full h-1.5 rounded overflow-hidden block">
                    <rect width="100%" height="100%" className="fill-white/25" />
                    <rect
                      width={`${slidePctElapsed}%`}
                      height="100%"
                      className={
                        pos.inEmergencyWindow ? 'fill-amber-400' : 'fill-[#FF0000]'
                      }
                    />
                  </svg>
                </div>
              </div>
            </>
          )}

          {/* Alerts & Toasts */}
          {activeRollCallSlide !== null && (
            <div className="absolute top-14 inset-x-3 z-30 bg-blue-600 text-white px-3.5 py-2.5 rounded-lg flex items-center justify-between gap-3 shadow-xl">
              <span className="text-xs font-semibold">
                Live Attendance Check — Tap Present!
              </span>
              <button
                type="button"
                onClick={confirmPresenceCheck}
                className="px-3 py-1 bg-white text-blue-950 text-xs font-bold rounded cursor-pointer"
              >
                Present
              </button>
            </div>
          )}

          {seekBlockedToast && (
            <div className="absolute top-14 left-1/2 -translate-x-1/2 z-30 bg-black/90 border border-white/20 text-white px-3.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap">
              {seekBlockedToast}
            </div>
          )}

          {confirmExitBanner && (
            <div className="absolute inset-0 z-40 bg-black/85 flex items-center justify-center p-6">
              <div className="bg-[#16161B] border border-white/15 rounded-xl p-5 max-w-sm w-full space-y-4">
                <div className="flex items-center gap-2 text-amber-400 text-sm font-bold">
                  <AlertTriangle className="w-5 h-5 shrink-0" />
                  <span>Leave Live Stream?</span>
                </div>
                <p className="text-xs text-zinc-300 leading-relaxed">
                  Slides keep advancing automatically on real live clock time while you are away.
                </p>
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmExitBanner(false)}
                    className="px-3.5 py-2 text-xs font-semibold bg-white text-zinc-950 rounded-lg cursor-pointer"
                  >
                    Stay Live
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (document.fullscreenElement) {
                        document.exitFullscreen().catch(() => {});
                      }
                      onExit();
                    }}
                    className="px-3.5 py-2 text-xs font-medium text-red-300 border border-red-500/40 rounded-lg cursor-pointer"
                  >
                    Exit
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // 3B. EXACT YOUTUBE LIVE FULLSCREEN MODE (100% Fullscreen Slide + Tap-to-Show Badges + Minimized Live Corner Pill)
  return (
    <div
      ref={rootRef}
      className="fixed inset-0 z-50 bg-black text-white overflow-hidden select-none"
    >
      {/* 100% EDGE-TO-EDGE FULLSCREEN SLIDE STAGE (Zero stacked bars shrinking the slide!) */}
      <div
        ref={stageBoxRef}
        onPointerDown={handleStagePointerDown}
        onPointerUp={handleStagePointerUp}
        className={`absolute inset-0 w-full h-full flex bg-[#141417] ${stageAlignClass}`}
      >
        {renderError ? (
          <div className="text-sm text-red-400 m-auto">{renderError}</div>
        ) : (
          <canvas ref={canvasRef} className={canvasClass} />
        )}
      </div>

      {/* MINIMIZED YOUTUBE LIVE HUD (Shown whenever controls auto-hide — Fullscreen slide + authentic YT Live badge & live timers!) */}
      {!controlsVisible && (
        <>
          <div className="absolute top-3 left-3.5 z-20 flex items-center gap-2 pointer-events-none">
            <div className="bg-[#FF0000] text-white text-xs font-extrabold tracking-wider px-2.5 py-0.5 rounded flex items-center gap-1.5 shadow-md">
              <span className="inline-block w-2 h-2 rounded-full bg-white" />
              <span>{badgeStreamText}</span>
            </div>

            <div
              className={`px-2.5 py-0.5 rounded text-xs font-mono tabular-nums font-bold shadow-md flex items-center gap-2 border ${
                pos.inEmergencyWindow
                  ? 'bg-amber-500/95 text-zinc-950 border-amber-300'
                  : isFinalTenSec
                  ? 'bg-[#FF0000]/95 text-white border-red-300'
                  : 'bg-black/65 text-white/95 border-white/15'
              }`}
            >
              <span>{formatHHMMSS(elapsedStreamMs)}</span>
              <span className="opacity-50">|</span>
              <span>
                {pos.inEmergencyWindow ? 'HOLD ' : ''}
                {formatMMSS(pos.slideRemainingMs)}
              </span>
              <span className="opacity-50">|</span>
              <span>
                {String(pos.slideIndex + 1).padStart(padCount, '0')}/
                {String(effectiveSession.slides.length).padStart(padCount, '0')}
              </span>
            </div>
          </div>

          {/* Flush 3px YouTube Live Red Bottom Progress Line */}
          <div className="absolute bottom-0 inset-x-0 z-20 pointer-events-none">
            <svg className="w-full h-[3px] block">
              <rect width="100%" height="100%" className="fill-white/15" />
              <rect
                width={`${slidePctElapsed}%`}
                height="100%"
                className={
                  pos.inEmergencyWindow ? 'fill-amber-400' : 'fill-[#FF0000]'
                }
              />
            </svg>
          </div>
        </>
      )}

      {/* FULL YOUTUBE LIVE OVERLAY BADGES & PLAYER CONTROLS (Appears on screen tap!) */}
      {controlsVisible && (
        <>
          {/* TOP BADGE BAR OVERLAY (Exact layout user liked, overlaid without shrinking fullscreen slide + Minimize button) */}
          <div className="absolute top-0 inset-x-0 z-30 bg-gradient-to-b from-black/90 via-black/60 to-transparent pt-3 pb-8 px-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="hidden sm:flex items-center gap-1 px-2 py-0.5 rounded bg-black/75 border border-white/15 text-[10px] font-bold tracking-tight shrink-0 select-none">
                  <span className="text-white">inspiro</span>
                  <span className="text-[#FF0000] font-extrabold text-[9px]">LIVE</span>
                </div>

                <div className="bg-[#FF0000] text-white text-xs font-extrabold tracking-wider px-2.5 py-1 rounded flex items-center gap-1.5 shrink-0 shadow-md">
                  <span className="inline-block w-2 h-2 rounded-full bg-white" />
                  <span>{badgeStreamText}</span>
                </div>

                <div className="min-w-0">
                  <h1 className="text-sm font-bold text-white truncate">
                    {effectiveSession.chapterName || effectiveSession.title}
                  </h1>
                  <p className="text-xs text-zinc-300 truncate">
                    {effectiveSession.subject} · {currentSlide?.label}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {mode === PlaybackMode.LIVE && (
                  <div className="hidden sm:flex items-center gap-1.5 text-xs font-mono tabular-nums text-zinc-200 bg-black/70 border border-white/15 px-3 py-1.5 rounded">
                    <Lock className="w-3.5 h-3.5 text-red-500" />
                    <span>Shutter Closes in {formatHHMMSS(hardCloseRemainingMs)}</span>
                  </div>
                )}

                {/* Rotate 90° right in YouTube Landscape Mode too! */}
                <button
                  type="button"
                  onClick={rotateBy90}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded border cursor-pointer whitespace-nowrap ${
                    rotationDeg !== 0
                      ? 'bg-blue-600 border-blue-400 text-white'
                      : 'bg-black/70 hover:bg-black/90 border-white/15 text-white'
                  }`}
                  title="Rotate Slide 90° (R)"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                  <span>{rotationDeg === 0 ? 'Rotate 90°' : `${rotationDeg}°`}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    keepControlsAwake();
                    setOrientation(BroadcastOrientation.VERTICAL);
                  }}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold bg-black/70 hover:bg-black/90 border border-white/15 text-white rounded cursor-pointer whitespace-nowrap"
                  title="Switch to Vertical Frame (V)"
                >
                  <Smartphone className="w-3.5 h-3.5 text-red-400" />
                  <span className="hidden sm:inline">Vertical Frame</span>
                </button>

                <button
                  type="button"
                  onClick={() => setControlsVisible(false)}
                  className="p-1.5 text-zinc-200 hover:text-white bg-black/70 border border-white/15 rounded cursor-pointer"
                  title="Minimize badges to Fullscreen"
                >
                  <ChevronUp className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => setConfirmExitBanner(true)}
                  className="p-1.5 text-zinc-200 hover:text-white bg-black/70 border border-white/15 rounded cursor-pointer"
                  aria-label="Leave live room"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* BOTTOM YOUTUBE LIVE SCRIM OVERLAY */}
          <div className="absolute bottom-0 inset-x-0 z-30 bg-gradient-to-t from-black/95 via-black/75 to-transparent pt-9 pb-3 px-4 space-y-2.5">
            {/* Non-Scrubbable YouTube Live Red Stream Bar */}
            <div
              onClick={() =>
                notifySeekBlocked('Live Classroom Locked — Seeking & scrubbing disabled')
              }
              className="cursor-not-allowed"
              title="Live broadcast — seeking disabled"
            >
              <svg className="w-full h-1.5 rounded overflow-hidden block">
                <rect width="100%" height="100%" className="fill-white/25" />
                <rect
                  width={`${slidePctElapsed}%`}
                  height="100%"
                  className={
                    pos.inEmergencyWindow ? 'fill-amber-400' : 'fill-[#FF0000]'
                  }
                />
              </svg>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2.5">
              {/* Left: Exact YouTube Live Red Dot + Stream Time + Page Timer + Slide Index */}
              <div className="flex items-center gap-2.5">
                <div className="flex items-center gap-1.5">
                  <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#FF0000]" />
                  <span className="text-xs font-extrabold tracking-wider text-white">
                    LIVE
                  </span>
                  <span className="text-xs font-mono tabular-nums text-zinc-300">
                    {formatHHMMSS(elapsedStreamMs)}
                  </span>
                </div>

                <div className="h-4 w-px bg-white/20" />

                <div
                  className={`px-2.5 py-1 rounded font-mono tabular-nums text-xs sm:text-sm font-bold ${
                    pos.inEmergencyWindow
                      ? 'bg-amber-500 text-zinc-950'
                      : isFinalTenSec
                      ? 'bg-[#FF0000] text-white'
                      : 'bg-white/15 text-white'
                  }`}
                >
                  Page Timer: {formatMMSS(pos.slideRemainingMs)}
                </div>

                <span className="text-xs font-mono tabular-nums text-zinc-200">
                  Slide {String(pos.slideIndex + 1).padStart(padCount, '0')} /{' '}
                  {String(effectiveSession.slides.length).padStart(padCount, '0')}
                </span>
              </div>

              {/* Right: Emergency 15m Break, Emergency +45s, Doubt, Rotate 90°, Fit/Fill, Sound, Fullscreen */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={remainingEmergencyBankSec <= 0}
                  onClick={startEmergencyBreak}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
                    remainingEmergencyBankSec <= 0
                      ? 'bg-white/5 text-zinc-500 border border-white/10 cursor-not-allowed'
                      : 'bg-amber-600/30 hover:bg-amber-600/40 border border-amber-500/50 text-amber-300'
                  }`}
                  title="15-minute emergency break allowance for the entire lecture"
                >
                  <Coffee className="w-3.5 h-3.5" />
                  <span>
                    {remainingEmergencyBankSec <= 0
                      ? '15m Bank Expired'
                      : `15m Break (${Math.floor(remainingEmergencyBankSec / 60)}:${String(remainingEmergencyBankSec % 60).padStart(2, '0')})`}
                  </span>
                </button>

                <button
                  type="button"
                  disabled={emergencyAlreadyUsedOnSlide}
                  onClick={triggerEmergencyBreak}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
                    emergencyAlreadyUsedOnSlide
                      ? 'bg-white/10 text-zinc-400 border border-white/10 cursor-not-allowed'
                      : 'bg-amber-500 hover:bg-amber-400 text-zinc-950'
                  }`}
                >
                  <PauseCircle className="w-4 h-4" />
                  <span>
                    {emergencyAlreadyUsedOnSlide
                      ? `+${effectiveSession.emergencySecondsPerSlide}s Used`
                      : `Emergency +${effectiveSession.emergencySecondsPerSlide}s`}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={toggleDoubtSlide}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer whitespace-nowrap ${
                    isCurrentSlideDoubt
                      ? 'bg-red-600 border-red-400 text-white'
                      : 'bg-black/70 hover:bg-black border-white/20 text-zinc-100'
                  }`}
                >
                  <Bookmark className="w-3.5 h-3.5" />
                  <span>{isCurrentSlideDoubt ? 'Doubt Saved' : '+ Doubt'}</span>
                </button>

                <button
                  type="button"
                  onClick={cycleScaleMode}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-mono font-semibold bg-black/70 hover:bg-black border border-white/20 text-zinc-100 cursor-pointer"
                  title="Toggle Fit / Fill Screen / 140% Zoom"
                >
                  {scaleLabel}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    keepControlsAwake();
                    setMuted((m) => !m);
                  }}
                  className="p-1.5 rounded-lg bg-black/70 hover:bg-black border border-white/20 text-zinc-100 cursor-pointer"
                  title="Mute / Unmute Classroom Audio"
                >
                  {muted ? (
                    <VolumeX className="w-4 h-4 text-zinc-400" />
                  ) : (
                    <Volume2 className="w-4 h-4" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={toggleFullscreen}
                  className="p-1.5 rounded-lg bg-black/70 hover:bg-black border border-white/20 text-zinc-100 cursor-pointer"
                  title="Fullscreen (F)"
                >
                  {isFullscreen ? (
                    <Minimize2 className="w-4 h-4" />
                  ) : (
                    <Maximize2 className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Roll Call / Tab Alerts / Seek Blocked */}
      {activeRollCallSlide !== null && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-40 bg-blue-600 text-white px-4 py-2.5 rounded-lg flex items-center gap-4 shadow-2xl">
          <span className="text-xs font-semibold">
            LIVE ATTENDANCE CHECK — Confirm active revision!
          </span>
          <button
            type="button"
            onClick={confirmPresenceCheck}
            className="px-3 py-1 bg-white text-blue-950 text-xs font-bold rounded cursor-pointer whitespace-nowrap"
          >
            Present
          </button>
        </div>
      )}

      {tabWarningBanner && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-40 bg-red-950 border border-red-500 text-red-100 px-4 py-2 rounded-lg flex items-center gap-3 text-xs shadow-2xl">
          <span>Tab switch logged on Attendance ({session.tabSwitchCount})</span>
          <button
            type="button"
            onClick={() => setTabWarningBanner(false)}
            className="underline font-semibold cursor-pointer"
          >
            OK
          </button>
        </div>
      )}

      {seekBlockedToast && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-40 bg-black/90 border border-white/20 text-white px-4 py-2 rounded-lg text-xs font-medium shadow-xl whitespace-nowrap">
          {seekBlockedToast}
        </div>
      )}

      {/* Leave Room Confirmation Modal */}
      {confirmExitBanner && (
        <div className="absolute inset-0 z-50 bg-black/80 flex items-center justify-center p-6">
          <div className="bg-[#16161B] border border-white/15 rounded-xl p-6 max-w-md w-full space-y-4">
            <div className="flex items-center gap-2 text-amber-400 text-sm font-bold">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <span>Leave Live Broadcast?</span>
            </div>
            <p className="text-xs text-zinc-300 leading-relaxed">
              Just like YouTube Live, the slide stream keeps advancing every{' '}
              {effectiveSession.baseSecondsPerSlide}s on real wall-clock time while you are outside.
            </p>
            <div className="flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setConfirmExitBanner(false)}
                className="px-4 py-2 text-xs font-semibold bg-white text-zinc-950 rounded-lg cursor-pointer"
              >
                Stay in Live Stream
              </button>
              <button
                type="button"
                onClick={() => {
                  if (document.fullscreenElement) {
                    document.exitFullscreen().catch(() => {});
                  }
                  onExit();
                }}
                className="px-4 py-2 text-xs font-medium text-red-300 border border-red-500/40 rounded-lg cursor-pointer"
              >
                Exit Stream
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
