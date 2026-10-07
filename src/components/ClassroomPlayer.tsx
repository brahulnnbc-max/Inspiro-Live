import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  Edit3,
  BookOpen,
  AlertTriangle,
  Play,
  Pause,
  RotateCcw,
  CheckCircle2,
  Clock,
  ShieldCheck,
  RotateCw,
  Smartphone,
  Radio,
  Users,
  X,
  Eye,
  EyeOff,
  Sparkles,
  Flame,
  Timer,
  Coffee,
  Bookmark,
  BookmarkPlus,
  Lock,
  Unlock,
  Headphones,
  Sliders,
  Trash2,
  Zap,
  Brain,
  ShieldAlert,
  ExternalLink,
  Youtube,
} from 'lucide-react';
import { JEEClass } from '../types/class';
import { getLiveClockStatus, formatISTDateTime, formatISTTime, formatDurationHMS, formatCountdownString } from '../lib/istTime';
import { Scratchpad } from './Scratchpad';
import { PomodoroTimer } from './PomodoroTimer';
import { FormulaSheetModal } from './FormulaSheetModal';
import { playClassroomChime } from '../lib/pushClient';
import { InspiroLogo } from './InspiroLogo';
import { logStudyTime } from '../lib/studyTracker';
import { recordClassAttendance } from '../lib/clientData';
import { ambientSound, AmbientSoundType } from '../lib/ambientSound';
import { addBookmark, deleteBookmark, getBookmarksForClass, LectureBookmark, BookmarkCategory } from '../lib/bookmarkStore';

// Extend window object for YouTube API
declare global {
  interface Window {
    onYouTubeIframeAPIReady?: () => void;
    YT?: any;
  }
}

interface Props {
  jeeClass: JEEClass;
  onBack: () => void;
  openFormulaModal: () => void;
  initialSeekSeconds?: number;
  onOpenMomentsTable?: () => void;
}

export const ClassroomPlayer: React.FC<Props> = ({
  jeeClass,
  onBack,
  openFormulaModal,
  initialSeekSeconds,
  onOpenMomentsTable,
}) => {
  const playerRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [clockState, setClockState] = useState(() =>
    getLiveClockStatus(jeeClass.start_at, jeeClass.duration_min)
  );
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isAutoplayBlocked, setIsAutoplayBlocked] = useState(false);
  const [isScratchpadOpen, setIsScratchpadOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'locked' | 'syncing'>('locked');
  const [replayMode, setReplayMode] = useState(() => typeof initialSeekSeconds === 'number' && initialSeekSeconds >= 0);
  const [simulatedOffset, setSimulatedOffset] = useState<number | null>(null);
  const [isRotateMode, setIsRotateMode] = useState(false);
  const [rotateAngle, setRotateAngle] = useState<0 | 90>(0);
  const [isRotateScratchpadOpen, setIsRotateScratchpadOpen] = useState(false);
  const [showHudControls, setShowHudControls] = useState(true);
  const [attendeeCount, setAttendeeCount] = useState(1480);
  const [currentISTString, setCurrentISTString] = useState('');
  const [isSimulatorOpen, setIsSimulatorOpen] = useState(false);
  const [isTimerOpen, setIsTimerOpen] = useState(false);
  const [rotateSidebarTab, setRotateSidebarTab] = useState<'scratchpad' | 'pomodoro'>('scratchpad');

  // Key Moments & Mistake Bookmarking States
  const [bookmarks, setBookmarks] = useState<LectureBookmark[]>(() => getBookmarksForClass(jeeClass.id));
  const [isBookmarkModalOpen, setIsBookmarkModalOpen] = useState(false);
  const [currentBookmarkSeconds, setCurrentBookmarkSeconds] = useState(0);
  const [bookmarkCategory, setBookmarkCategory] = useState<BookmarkCategory>('mistake');
  const [bookmarkNote, setBookmarkNote] = useState('');
  const [isBookmarksVaultOpen, setIsBookmarksVaultOpen] = useState(false);

  // Monk Mode & Ambient Sound States
  const [isMonkMode, setIsMonkMode] = useState(false);
  const [ambientType, setAmbientType] = useState<AmbientSoundType>('none');
  const [ambientVol, setAmbientVol] = useState(0.5);
  const [showAmbientControls, setShowAmbientControls] = useState(false);

  // Lock Warning Toast for Live Mode
  const [lockWarningToast, setLockWarningToast] = useState<string | null>(null);
  const [currentTimeSec, setCurrentTimeSec] = useState(0);

  // Incognito & Embed Restriction Fallback States
  const [isPlaybackRestricted, setIsPlaybackRestricted] = useState(false);
  const [playbackErrorCode, setPlaybackErrorCode] = useState<number | null>(null);
  const [useDirectIframe, setUseDirectIframe] = useState(false);

  // Refresh bookmarks when updated
  useEffect(() => {
    const handleBmUpdate = () => {
      setBookmarks(getBookmarksForClass(jeeClass.id));
    };
    window.addEventListener('inspiro_bookmarks_updated', handleBmUpdate);
    return () => window.removeEventListener('inspiro_bookmarks_updated', handleBmUpdate);
  }, [jeeClass.id]);

  // Clean up ambient sound on unmount
  useEffect(() => {
    return () => {
      ambientSound.stop();
    };
  }, []);

  // Initialize YouTube API script once
  useEffect(() => {
    if (!window.YT) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag?.parentNode?.insertBefore(tag, firstScriptTag);
    }
  }, []);

  // Update wall clock status every 1 second (or maintain simulated state)
  useEffect(() => {
    const interval = setInterval(() => {
      if (simulatedOffset !== null) {
        // If simulated, advance offset by 1 sec
        setSimulatedOffset((prev) => (prev !== null ? prev + 1 : null));
        const durationSec = jeeClass.duration_min * 60;
        const currentOffset = simulatedOffset + 1;

        if (currentOffset < 0) {
          setClockState({
            status: 'upcoming',
            elapsedSeconds: 0,
            durationSeconds: durationSec,
            remainingSeconds: Math.abs(currentOffset),
            progressPercent: 0,
          });
        } else if (currentOffset <= durationSec) {
          setClockState({
            status: 'live',
            elapsedSeconds: currentOffset,
            durationSeconds: durationSec,
            remainingSeconds: durationSec - currentOffset,
            progressPercent: (currentOffset / durationSec) * 100,
          });
        } else {
          setClockState({
            status: 'ended',
            elapsedSeconds: durationSec,
            durationSeconds: durationSec,
            remainingSeconds: 0,
            progressPercent: 100,
          });
        }
        return;
      }

      const current = getLiveClockStatus(jeeClass.start_at, jeeClass.duration_min);
      setClockState(current);

      if (current.status === 'live' && clockState.status === 'upcoming') {
        playClassroomChime();
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [jeeClass, clockState.status, simulatedOffset]);

  // Set up or update YouTube player instance
  useEffect(() => {
    let checkInterval: any = null;

    const initPlayer = () => {
      if (useDirectIframe) {
        return true;
      }

      if (!window.YT || !window.YT.Player) {
        return false;
      }

      // If existing player, destroy
      if (playerRef.current && typeof playerRef.current.destroy === 'function') {
        playerRef.current.destroy();
        playerRef.current = null;
      }

      const initialClock = getLiveClockStatus(jeeClass.start_at, jeeClass.duration_min);
      let startOffset = initialClock.status === 'live' ? initialClock.elapsedSeconds : 0;
      if (typeof initialSeekSeconds === 'number' && initialSeekSeconds >= 0) {
        startOffset = initialSeekSeconds;
      }

      const pageOrigin = typeof window !== 'undefined' ? window.location.origin : undefined;
      const pageHref = typeof window !== 'undefined' ? window.location.href : undefined;

      playerRef.current = new window.YT.Player('youtube-classroom-frame', {
        videoId: jeeClass.youtube_id,
        host: 'https://www.youtube-nocookie.com',
        playerVars: {
          autoplay: initialClock.status === 'live' || (typeof initialSeekSeconds === 'number') ? 1 : 0,
          controls: replayMode || initialClock.status === 'ended' || (typeof initialSeekSeconds === 'number') ? 1 : 0, // Unlock controls when jumping to specific moment
          disablekb: replayMode || (typeof initialSeekSeconds === 'number') ? 0 : 1,
          modestbranding: 1,
          rel: 0,
          start: Math.max(0, startOffset),
          playsinline: 1,
          fs: 0,
          iv_load_policy: 3,
          enablejsapi: 1,
          origin: pageOrigin,
          widget_referrer: pageHref,
        },
        events: {
          onReady: (event: any) => {
            if (typeof initialSeekSeconds === 'number' && initialSeekSeconds >= 0) {
              event.target.seekTo(initialSeekSeconds, true);
              try {
                event.target.playVideo();
                setIsPlaying(true);
              } catch (e) {
                // Autoplay blocked fallback
                setIsAutoplayBlocked(true);
              }
            } else if (initialClock.status === 'live') {
              event.target.seekTo(startOffset, true);
              try {
                event.target.playVideo();
              } catch (e) {
                setIsAutoplayBlocked(true);
              }
            }
          },
          onStateChange: (event: any) => {
            // YT.PlayerState: -1 unstarted, 0 ended, 1 playing, 2 paused, 3 buffering, 5 cued
            if (event.data === 1) {
              setIsPlaying(true);
              setIsAutoplayBlocked(false);
              setIsPlaybackRestricted(false);
            } else if (event.data === 2) {
              setIsPlaying(false);
              // In live mode, if user paused, we notify and let sync heartbeat handle catch-up
            }
          },
          onError: (err: any) => {
            console.warn('YouTube Player error code:', err.data);
            // Error codes:
            // 2: Invalid parameter
            // 5: HTML5 error
            // 100: Video not found or private
            // 101 or 150: The owner does not allow it to be played in embedded players (Video Unavailable)
            setIsPlaybackRestricted(true);
            setPlaybackErrorCode(typeof err.data === 'number' ? err.data : 150);
          },
        },
      });

      return true;
    };

    // Attempt init or wait for window.onYouTubeIframeAPIReady
    if (!initPlayer()) {
      window.onYouTubeIframeAPIReady = () => {
        initPlayer();
      };
      checkInterval = setInterval(() => {
        if (initPlayer()) {
          clearInterval(checkInterval);
        }
      }, 300);
    }

    return () => {
      if (checkInterval) clearInterval(checkInterval);
      if (playerRef.current && typeof playerRef.current.destroy === 'function') {
        playerRef.current.destroy();
        playerRef.current = null;
      }
    };
  }, [jeeClass.id, replayMode]);

  // Track current video seconds for HUD scrubber
  useEffect(() => {
    const timeTracker = setInterval(() => {
      const player = playerRef.current;
      if (player && typeof player.getCurrentTime === 'function') {
        const sec = player.getCurrentTime();
        if (typeof sec === 'number' && !isNaN(sec)) {
          setCurrentTimeSec(sec);
        }
      }
    }, 1000);
    return () => clearInterval(timeTracker);
  }, []);

  // Periodic Clock-Lock & Anti-Skip Enforcement Heartbeat:
  // Strictly prevents skipping or forwarding during LIVE mode!
  useEffect(() => {
    if (clockState.status !== 'live' || replayMode) return;

    const syncInterval = setInterval(() => {
      const player = playerRef.current;
      if (!player || typeof player.getCurrentTime !== 'function') return;

      try {
        const currentTime = player.getCurrentTime();
        const targetTime = clockState.elapsedSeconds;

        // Anti-Skip / Forward Lock: If player tried to jump forward ahead of current live time, instantly snap back!
        if (currentTime > targetTime + 1.2) {
          player.seekTo(targetTime, true);
          setLockWarningToast("🔒 Cannot skip forward: live broadcast is locked to teacher's real-time stream.");
          setTimeout(() => setLockWarningToast(null), 3500);
          return;
        }

        const drift = Math.abs(currentTime - targetTime);
        if (drift > 3) {
          setSyncStatus('syncing');
          player.seekTo(targetTime, true);
          player.playVideo();
          setTimeout(() => setSyncStatus('locked'), 800);
        } else {
          setSyncStatus('locked');
        }
      } catch (err) {
        // Ignored
      }
    }, 1000);

    return () => clearInterval(syncInterval);
  }, [clockState.status, clockState.elapsedSeconds, replayMode]);

  // Tab-Switch Accountability & Re-sync
  useEffect(() => {
    const originalTitle = document.title;
    const handleVisibilityChange = () => {
      if (document.hidden && clockState.status === 'live' && !replayMode) {
        document.title = `🔴 LIVE: ${jeeClass.subject} (${jeeClass.title})`;
      } else if (!document.hidden) {
        document.title = originalTitle;
        if (clockState.status === 'live' && !replayMode) {
          const player = playerRef.current;
          if (player && typeof player.seekTo === 'function') {
            const current = getLiveClockStatus(jeeClass.start_at, jeeClass.duration_min);
            player.seekTo(current.elapsedSeconds, true);
            player.playVideo();
            setLockWarningToast("⚡ Re-synchronized in lockstep with teacher's live broadcast");
            setTimeout(() => setLockWarningToast(null), 3000);
          }
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      document.title = originalTitle;
    };
  }, [clockState.status, jeeClass, replayMode]);

// Trigger Note Key Moment Modal (or instant 1-click timestamp in rotate mode)
  const handleTriggerBookmark = () => {
    const player = playerRef.current;
    let sec = clockState.elapsedSeconds;
    if (player && typeof player.getCurrentTime === 'function') {
      try {
        const pSec = player.getCurrentTime();
        if (typeof pSec === 'number' && !isNaN(pSec)) sec = pSec;
      } catch (e) {
        // Fallback to clockState
      }
    }
    const targetSec = Math.max(0, Math.floor(sec));

    // During Rotate Live: Immediately save timestamp into notebook table without any popup!
    if (isRotateMode) {
      const saved = addBookmark(
        jeeClass.id,
        targetSec,
        'mistake',
        `Timestamp marked during live lecture`
      );
      setBookmarks(getBookmarksForClass(jeeClass.id));
      setLockWarningToast(`⏱️ Timestamp saved at ${saved.timestampFormatted} into moments notebook!`);
      setTimeout(() => setLockWarningToast(null), 3000);
      return;
    }

    setCurrentBookmarkSeconds(targetSec);
    setBookmarkNote('');
    setBookmarkCategory('mistake');
    setIsBookmarkModalOpen(true);
  };

  const handleSaveBookmark = () => {
    const saved = addBookmark(
      jeeClass.id,
      currentBookmarkSeconds,
      bookmarkCategory,
      bookmarkNote
    );
    setBookmarks(getBookmarksForClass(jeeClass.id));
    setIsBookmarkModalOpen(false);
    setBookmarkNote('');
    setLockWarningToast(`🔖 Note Moment saved at ${saved.timestampFormatted}`);
    setTimeout(() => setLockWarningToast(null), 3500);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;
      if (e.key === 'b' || e.key === 'B') {
        e.preventDefault();
        handleTriggerBookmark();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [clockState]);

  // Active real study time & attendance tracking
  useEffect(() => {
    if (clockState.status !== 'live' && !replayMode) return;

    const studyInterval = setInterval(() => {
      logStudyTime(jeeClass.subject, 0.5, replayMode ? 'replay' : 'live_lecture', jeeClass.title);
      recordClassAttendance(jeeClass.id, 0.5, jeeClass.duration_min);
    }, 30000);

    return () => clearInterval(studyInterval);
  }, [clockState.status, replayMode, jeeClass]);

  // User gesture button to unlock autoplay with audio
  const handleAutoplayGesture = () => {
    const player = playerRef.current;
    if (player && typeof player.playVideo === 'function') {
      player.unMute();
      player.seekTo(clockState.elapsedSeconds, true);
      player.playVideo();
      setIsPlaying(true);
      setIsAutoplayBlocked(false);
    }
  };

  const toggleMute = () => {
    const player = playerRef.current;
    if (!player) return;
    if (isMuted) {
      player.unMute();
      setIsMuted(false);
    } else {
      player.mute();
      setIsMuted(true);
    }
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  // Dynamic IST wall clock display
  useEffect(() => {
    const updateIST = () => {
      const now = new Date();
      const istFormatted = new Intl.DateTimeFormat('en-IN', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }).format(now);
      setCurrentISTString(istFormatted + ' IST');
    };
    updateIST();
    const interval = setInterval(updateIST, 1000);
    return () => clearInterval(interval);
  }, []);

  // Natural live attendee counter fluctuation
  useEffect(() => {
    const interval = setInterval(() => {
      setAttendeeCount((prev) => {
        const delta = Math.floor(Math.random() * 9) - 4;
        return Math.max(920, Math.min(2850, prev + delta));
      });
    }, 3500);
    return () => clearInterval(interval);
  }, []);

  const toggleRotateMode = async () => {
    if (!isRotateMode) {
      setIsRotateMode(true);
      setShowHudControls(true);
      // Auto-detect portrait phone orientation and default to 90deg rotation
      const isPortrait = typeof window !== 'undefined' && window.innerHeight > window.innerWidth;
      if (isPortrait && window.innerWidth < 850) {
        setRotateAngle(90);
      } else {
        setRotateAngle(0);
      }

      try {
        if (screen.orientation && typeof (screen.orientation as any).lock === 'function') {
          await (screen.orientation as any).lock('landscape').catch(() => {});
        }
      } catch (e) {
        // Fallback handled by CSS transform
      }
    } else {
      setIsRotateMode(false);
      setRotateAngle(0);
      setIsRotateScratchpadOpen(false);
      try {
        if (screen.orientation && typeof (screen.orientation as any).unlock === 'function') {
          (screen.orientation as any).unlock();
        }
      } catch (e) {}
    }
  };

  const toggle90DegFlip = () => {
    setRotateAngle((prev) => (prev === 0 ? 90 : 0));
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Top action bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-xs font-medium text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Timetable</span>
        </button>

        <div className="flex flex-wrap items-center gap-2">
          {/* Monk Mode Toggle */}
          <button
            onClick={() => {
              const next = !isMonkMode;
              setIsMonkMode(next);
              if (next && ambientType === 'none') {
                setAmbientType('brown');
                ambientSound.play('brown');
              } else if (!next) {
                ambientSound.stop();
                setAmbientType('none');
              }
            }}
            className={`px-2.5 sm:px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all flex items-center gap-1.5 ${
              isMonkMode
                ? 'bg-purple-950/80 border-purple-500/60 text-purple-200 shadow-md shadow-purple-950/50'
                : 'bg-slate-900 border-slate-800 text-slate-300 hover:text-white'
            }`}
            title="Monk Mode: Distraction-free theater with ambient focus audio"
          >
            <Headphones className={`w-3.5 h-3.5 ${isMonkMode ? 'text-purple-400' : 'text-slate-400'}`} />
            <span>Monk Mode</span>
            {isMonkMode && <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />}
          </button>

          {/* Note Key Moment */}
          <button
            onClick={handleTriggerBookmark}
            className="px-2.5 sm:px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/40 transition-all flex items-center gap-1.5"
            title="Note Important Moment, Formula or Mistake (Shortcut: B)"
          >
            <BookmarkPlus className="w-3.5 h-3.5 text-amber-400" />
            <span>Note Moment</span>
            <kbd className="hidden sm:inline px-1 py-0.2 text-[9px] bg-amber-950/80 text-amber-300 rounded border border-amber-800/80 font-mono">B</kbd>
          </button>

          {/* Moments Table Quick Access */}
          <button
            onClick={() => {
              if (onOpenMomentsTable) {
                onOpenMomentsTable();
              } else {
                setIsBookmarksVaultOpen(true);
              }
            }}
            className="px-2.5 sm:px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/40 transition-all flex items-center gap-1.5"
            title="Open dedicated Moments & Notes Table"
          >
            <Bookmark className="w-3.5 h-3.5 text-amber-400" />
            <span>Moments Table</span>
            {bookmarks.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-200 text-[10px] border border-amber-500/30">
                {bookmarks.length}
              </span>
            )}
          </button>

          <button
            onClick={toggleRotateMode}
            className="px-2.5 sm:px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold shadow-md shadow-emerald-950/40 border border-emerald-500/40 transition-all flex items-center gap-1.5"
            title="Switch to full-screen mobile landscape with live stream bar"
          >
            <RotateCw className="w-3.5 h-3.5 group-hover:rotate-180 transition-transform duration-500 text-slate-950" />
            <span>Rotate Live</span>
            <span className="w-1.5 h-1.5 rounded-full bg-slate-950 animate-pulse" />
          </button>

          <button
            onClick={() => setIsScratchpadOpen(!isScratchpadOpen)}
            className={`px-2.5 sm:px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors flex items-center gap-1.5 ${
              isScratchpadOpen
                ? 'bg-sky-950/80 border-sky-800 text-sky-300'
                : 'bg-slate-900 border-slate-800 text-slate-300 hover:text-white'
            }`}
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{isScratchpadOpen ? 'Hide Scratchpad' : 'Scratchpad'}</span>
            <span className="sm:hidden">{isScratchpadOpen ? 'Pad' : 'Pad'}</span>
          </button>

          <button
            onClick={() => setIsTimerOpen(!isTimerOpen)}
            className={`px-2.5 sm:px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors flex items-center gap-1.5 ${
              isTimerOpen
                ? 'bg-emerald-950/80 border-emerald-800 text-emerald-300 font-semibold'
                : 'bg-slate-900 border-slate-800 text-slate-300 hover:text-white'
            }`}
            title="Pomodoro Focus Timer for study sessions"
          >
            <Timer className="w-3.5 h-3.5 text-emerald-400" />
            <span>{isTimerOpen ? 'Hide Timer' : 'Timer'}</span>
          </button>

          <button
            onClick={openFormulaModal}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-white transition-colors flex items-center gap-1.5"
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Formulas</span>
          </button>

          <button
            onClick={() => setIsSimulatorOpen(!isSimulatorOpen)}
            className={`px-2 py-1.5 text-[11px] font-mono rounded-lg border transition-colors ${
              isSimulatorOpen
                ? 'bg-amber-950/80 border-amber-700/80 text-amber-300 font-semibold'
                : 'bg-slate-900/40 border-slate-800/80 text-slate-500 hover:text-slate-300'
            }`}
            title="Toggle Clock-Lock Simulator for testing states"
          >
            ⚡ Test
          </button>
        </div>
      </div>

      {/* Monk Mode Ambient Sound Console */}
      {isMonkMode && (
        <aside aria-label="Monk mode ambient audio controls" className="p-3 bg-purple-950/40 border border-purple-500/40 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            <Headphones className="w-4 h-4 text-purple-400" />
            <span className="font-bold text-purple-200">Monk Mode Sound Shield:</span>
            <span className="text-purple-300/80 text-[11px] hidden sm:inline">
              Binaural frequencies & acoustic noise cancellation for deep problem-solving
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {([
              { id: 'none', label: 'Mute Sound', icon: '🚫' },
              { id: 'gamma40', label: '40Hz Gamma Focus', icon: '🧠' },
              { id: 'brown', label: 'Deep Brown Noise', icon: '🌊' },
              { id: 'rain', label: 'Rain on Glass', icon: '🌧️' },
              { id: 'library', label: 'Silent Library', icon: '☕' },
            ] as const).map((snd) => (
              <button
                key={snd.id}
                onClick={() => {
                  setAmbientType(snd.id);
                  ambientSound.play(snd.id);
                }}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                  ambientType === snd.id
                    ? 'bg-purple-500 text-slate-950 font-bold shadow'
                    : 'bg-slate-900/80 hover:bg-slate-800 text-slate-300 border border-slate-800'
                }`}
              >
                <span>{snd.icon}</span>
                <span>{snd.label}</span>
              </button>
            ))}

            {ambientType !== 'none' && (
              <div className="flex items-center gap-2 ml-2 pl-2 border-l border-purple-900/60">
                <Sliders className="w-3.5 h-3.5 text-purple-400" />
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={ambientVol}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    setAmbientVol(v);
                    ambientSound.setVolume(v);
                  }}
                  className="w-16 accent-purple-500 h-1 bg-slate-800 rounded-lg cursor-pointer"
                  title="Ambient Sound Volume"
                />
              </div>
            )}
          </div>
        </aside>
      )}

      {/* Clock-Lock State Testing Console (Collapsed by default for clean study view) */}
      {isSimulatorOpen && (
        <div className="p-3 bg-slate-900/90 border border-slate-800 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-200">Clock-Lock Live Simulator:</span>
            <span className="text-slate-400 text-[11px] hidden sm:inline">
              Test any classroom synchronization state instantly without waiting
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => {
                setSimulatedOffset(15 * 60);
                setReplayMode(false);
                if (playerRef.current && typeof playerRef.current.seekTo === 'function') {
                  playerRef.current.seekTo(15 * 60, true);
                  playerRef.current.playVideo();
                }
              }}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-emerald-300 rounded border border-slate-700"
            >
              Late Join (15m in)
            </button>

            <button
              onClick={() => {
                setSimulatedOffset(-25);
                setReplayMode(false);
                if (playerRef.current && typeof playerRef.current.pauseVideo === 'function') {
                  playerRef.current.pauseVideo();
                }
              }}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-sky-300 rounded border border-slate-700"
            >
              Waiting Room (25s countdown)
            </button>

            <button
              onClick={() => {
                setSimulatedOffset(jeeClass.duration_min * 60 + 10);
                setReplayMode(false);
              }}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-amber-300 rounded border border-slate-700"
            >
              Class Concluded
            </button>

            {simulatedOffset !== null && (
              <button
                onClick={() => {
                  setSimulatedOffset(null);
                  setReplayMode(false);
                  const current = getLiveClockStatus(jeeClass.start_at, jeeClass.duration_min);
                  setClockState(current);
                  if (playerRef.current && typeof playerRef.current.seekTo === 'function') {
                    playerRef.current.seekTo(current.elapsedSeconds, true);
                  }
                }}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded border border-slate-700"
              >
                Reset to Real IST
              </button>
            )}
          </div>
        </div>
      )}

      {/* Main Classroom Container */}
      <div
        ref={containerRef}
        style={
          isRotateMode && rotateAngle === 90
            ? {
                position: 'fixed',
                top: 0,
                left: 0,
                width: '100vh',
                height: '100vw',
                transform: 'rotate(90deg) translateY(-100%)',
                transformOrigin: 'top left',
                zIndex: 9999,
              }
            : isRotateMode
            ? {
                position: 'fixed',
                top: 0,
                left: 0,
                width: '100vw',
                height: '100vh',
                zIndex: 9999,
              }
            : undefined
        }
        className={`bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl flex transition-all duration-300 ${
          isRotateMode
            ? 'flex-row rounded-none border-0 shadow-none'
            : isFullscreen
            ? 'fixed inset-0 z-50 rounded-none flex-col'
            : 'flex-col'
        }`}
      >
        {/* ============================================================== */}
        {/* A. SIDE LIVE BAR (Rotate Mode & Authentic Live Broadcast)      */}
        {/* ============================================================== */}
        {isRotateMode && (
          <div className="w-14 sm:w-16 h-full bg-slate-950/95 border-r border-slate-800/90 flex flex-col justify-between py-3 items-center z-40 select-none shadow-[4px_0_24px_rgba(0,0,0,0.6)] shrink-0">
            {/* Top Indicator: Red dot + LIVE only */}
            <div className="flex flex-col items-center gap-2">
              <div className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500 shadow-[0_0_10px_#ef4444]"></span>
              </div>
              <div className="flex flex-col items-center [writing-mode:vertical-lr] rotate-180 py-1 font-sans select-none">
                <span className="font-black text-xs tracking-wider text-red-500 drop-shadow-[0_0_8px_rgba(239,68,68,0.6)]">
                  LIVE
                </span>
              </div>
            </div>

            {/* Center Attendee & IST */}
            <div className="flex flex-col items-center gap-3 py-2 border-y border-emerald-900/40 w-full">
              <div className="flex flex-col items-center gap-0.5">
                <Users className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-[10px] font-mono font-bold text-white tabular-nums">
                  {attendeeCount.toLocaleString()}
                </span>
                <span className="text-[7.5px] font-bold text-emerald-400 uppercase tracking-tighter">
                  ONLINE
                </span>
              </div>

              <div className="w-6 h-px bg-emerald-800/40 my-0.5" />

              <div className="flex flex-col items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-emerald-300" />
                <span className="text-[9px] font-mono text-emerald-200 font-semibold [writing-mode:vertical-lr] rotate-180 tracking-widest">
                  {currentISTString || 'IST SYNC'}
                </span>
              </div>
            </div>

            {/* Bottom Stream Quality & Subject */}
            <div className="flex flex-col items-center gap-2">
              <div className="px-1.5 py-0.5 rounded bg-emerald-950/80 border border-emerald-500/40 text-[9px] font-mono font-bold text-emerald-200">
                1080p
              </div>
              <span className="text-[9px] font-mono font-extrabold text-amber-400 [writing-mode:vertical-lr] rotate-180 tracking-wider">
                {jeeClass.subject.slice(0, 4).toUpperCase()}
              </span>
              {/* Mini Equalizer Pulse Animation */}
              <div className="flex items-end gap-0.5 h-3.5 w-4 justify-center">
                <span className="w-0.5 bg-emerald-400 rounded-full animate-[pulse_0.8s_ease-in-out_infinite] h-3"></span>
                <span className="w-0.5 bg-emerald-500 rounded-full animate-[pulse_1.2s_ease-in-out_infinite] h-2"></span>
                <span className="w-0.5 bg-emerald-300 rounded-full animate-[pulse_0.6s_ease-in-out_infinite] h-3.5"></span>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* B. TOP STREAM BANNER (Standard Mode Only)                      */}
        {/* ============================================================== */}
        {!isRotateMode && (
          <div className="px-3 sm:px-6 py-2.5 sm:py-3 border-b border-slate-800/80 bg-slate-900/90 flex flex-wrap items-center justify-between gap-2.5 text-xs">
            <div className="flex items-center gap-2.5 sm:gap-3 flex-wrap">
              {clockState.status === 'live' && (
                <span className="flex items-center gap-1.5 font-bold font-mono text-emerald-400">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_#ef4444]"></span>
                  <span>LIVE STREAM ACTIVE</span>
                </span>
              )}
              {clockState.status === 'upcoming' && (
                <span className="flex items-center gap-1.5 font-mono text-sky-400 font-semibold text-[11px] sm:text-xs">
                  <Clock className="w-3.5 h-3.5 shrink-0" />
                  <span>WAITING ROOM · IN {formatCountdownString(clockState.remainingSeconds)}</span>
                </span>
              )}
              {clockState.status === 'ended' && (
                <span className="flex items-center gap-1.5 font-mono text-slate-400">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>CLASS CONCLUDED</span>
                </span>
              )}

              <span className="text-slate-600 hidden sm:inline">|</span>

              {/* Sync status */}
              {clockState.status === 'live' && (
                <span className="text-[11px] font-mono text-slate-400 flex items-center gap-1 hidden md:flex">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span>
                    {syncStatus === 'syncing' ? 'Resyncing to IST wall-clock...' : 'Clock-Locked to IST'}
                  </span>
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 sm:gap-4 font-mono text-slate-400">
              {clockState.status === 'live' && (
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="text-slate-200">{formatDurationHMS(clockState.elapsedSeconds)}</span>
                  <span>/</span>
                  <span>{formatDurationHMS(clockState.durationSeconds)}</span>
                </div>
              )}

              {/* Pomodoro Focus Timer button in player header */}
              <button
                onClick={() => setIsTimerOpen(!isTimerOpen)}
                className={`p-1.5 rounded-md border transition-colors flex items-center gap-1.5 text-xs font-mono ${
                  isTimerOpen
                    ? 'bg-emerald-950/80 border-emerald-800 text-emerald-300'
                    : 'text-slate-400 hover:text-white border-slate-800 hover:bg-slate-900'
                }`}
                title="Toggle Pomodoro Focus Timer"
              >
                <Timer className="w-3.5 h-3.5 text-emerald-400" />
                <span className="hidden sm:inline">Timer</span>
              </button>

              {/* Rotate mode button in player header */}
              <button
                onClick={toggleRotateMode}
                className="text-emerald-400 hover:text-emerald-300 p-1.5 rounded-md hover:bg-emerald-950/40 border border-emerald-800/40 transition-colors flex items-center gap-1.5 text-xs font-mono"
                title="Rotate to Fullscreen Landscape"
              >
                <RotateCw className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Rotate</span>
              </button>

              <button
                onClick={toggleFullscreen}
                className="text-slate-400 hover:text-white p-1 rounded"
                title="Toggle Fullscreen"
              >
                {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* C. VIDEO CANVAS AREA (Holds YouTube Iframe & Live Overlays)    */}
        {/* ============================================================== */}
        <div
          className={`relative bg-black flex items-center justify-center overflow-hidden ${
            isRotateMode ? 'flex-1 h-full' : 'w-full aspect-video'
          }`}
        >
          {/* Vertical Green Live Accent Bar (Standard Mode) */}
          {!isRotateMode && clockState.status === 'live' && (
            <div className="absolute top-0 bottom-0 left-0 w-1.5 bg-gradient-to-b from-emerald-500 via-teal-500 to-emerald-600 shadow-[0_0_14px_rgba(52,211,153,0.9)] z-20" />
          )}

          {/* Floating live indicator badge (Standard Mode) */}
          {!isRotateMode && clockState.status === 'live' && (
            <div className="absolute top-3 left-4 z-20 flex items-center gap-2 px-2.5 py-1 rounded-full bg-slate-950/85 backdrop-blur-md border border-emerald-500/50 shadow-xl text-[11px] font-mono">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
              <span className="font-bold text-emerald-300 tracking-wide">LIVE</span>
              <span className="text-slate-600">|</span>
              <span className="text-slate-200 tabular-nums flex items-center gap-1">
                <Users className="w-3 h-3 text-emerald-400" />
                {attendeeCount.toLocaleString()}
              </span>
            </div>
          )}

          {/* ROTATE MODE: FLOATING HUD CONTROLS */}
          {isRotateMode && (
            <>
              {/* Top Floating Controls Toolbar Bar */}
              <div
                className={`absolute top-2.5 left-2.5 right-2.5 z-30 transition-all duration-300 ${
                  showHudControls ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2 pointer-events-none'
                }`}
              >
                <div className="bg-slate-950/95 backdrop-blur-md border border-slate-800/90 rounded-xl px-2.5 py-1.5 shadow-2xl flex items-center justify-between gap-2 overflow-x-auto scrollbar-none">
                  {/* Left Brand & Exit */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <InspiroLogo size="sm" showSubtitle={false} className="mr-0.5" />
                    <button
                      onClick={toggleRotateMode}
                      className="flex items-center gap-1 px-2.5 py-1 bg-slate-800/90 hover:bg-slate-700 text-white rounded-lg text-xs font-medium transition-colors whitespace-nowrap"
                      title="Exit Rotate Mode"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      <span>Exit</span>
                    </button>
                    <button
                      onClick={toggle90DegFlip}
                      className="flex items-center gap-1 px-2.5 py-1 bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-700/60 text-emerald-200 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap"
                      title="Toggle 90 degree flip for vertical mobile grip"
                    >
                      <RotateCw className="w-3.5 h-3.5 text-emerald-400" />
                      <span>{rotateAngle === 90 ? '0°' : '90°'}</span>
                    </button>
                  </div>

                  {/* Scrollable Tool Bar with Note Moment, Pad, Timer, Formulas */}
                  <div className="flex items-center gap-1.5 shrink-0 overflow-x-auto scrollbar-none pl-1">
                    {/* Note Key Moment (Available during live classes in rotate mode) */}
                    <button
                      onClick={handleTriggerBookmark}
                      className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 transition-colors flex items-center gap-1.5 whitespace-nowrap"
                      title="Note important lecture moment or mistake (Shortcut: B)"
                    >
                      <BookmarkPlus className="w-3.5 h-3.5 text-amber-400" />
                      <span>Note Moment</span>
                    </button>

                    {/* Moments Vault count button */}
                    {bookmarks.length > 0 && (
                      <button
                        onClick={() => setIsBookmarksVaultOpen(true)}
                        className="px-2 py-1 text-xs font-mono rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 transition-colors flex items-center gap-1 whitespace-nowrap"
                        title="View saved moments"
                      >
                        <Bookmark className="w-3 h-3 text-amber-400" />
                        <span>{bookmarks.length}</span>
                      </button>
                    )}

                    <button
                      onClick={() => setIsRotateScratchpadOpen(!isRotateScratchpadOpen)}
                      className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                        isRotateScratchpadOpen
                          ? 'bg-sky-500 text-slate-950 font-bold'
                          : 'text-slate-300 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800'
                      }`}
                      title="Toggle live scratchpad drawer"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Rough Pad</span>
                    </button>

                    <button
                      onClick={() => {
                        if (isRotateScratchpadOpen && rotateSidebarTab === 'pomodoro') {
                          setIsRotateScratchpadOpen(false);
                        } else {
                          setIsRotateScratchpadOpen(true);
                          setRotateSidebarTab('pomodoro');
                        }
                      }}
                      className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                        isRotateScratchpadOpen && rotateSidebarTab === 'pomodoro'
                          ? 'bg-emerald-600 text-white font-bold'
                          : 'text-slate-300 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800'
                      }`}
                      title="Toggle Pomodoro focus timer"
                    >
                      <Timer className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Timer</span>
                    </button>

                    <button
                      onClick={openFormulaModal}
                      className="px-2.5 py-1 text-xs font-medium text-slate-300 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap"
                      title="Open Formula Sheet"
                    >
                      <BookOpen className="w-3.5 h-3.5" />
                      <span>Formulas</span>
                    </button>

                    <button
                      onClick={toggleMute}
                      className="p-1 text-slate-300 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg transition-colors"
                      title={isMuted ? 'Unmute' : 'Mute'}
                    >
                      {isMuted ? <VolumeX className="w-3.5 h-3.5 text-emerald-400" /> : <Volume2 className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Bottom Right Floating Minimalist HUD Toggle */}
              <button
                onClick={() => setShowHudControls(!showHudControls)}
                className="absolute bottom-3 right-3 z-30 p-2 bg-slate-950/80 backdrop-blur-md border border-slate-800/80 rounded-full text-slate-400 hover:text-white shadow-xl transition-all"
                title={showHudControls ? 'Hide HUD (Theater View)' : 'Show Controls'}
              >
                {showHudControls ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5 text-emerald-400" />}
              </button>

              {/* Bottom glowing timeline in rotate mode */}
              {clockState.status === 'live' && (
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-slate-900 z-20">
                  <div
                    className="bg-emerald-400 h-full transition-all duration-1000 shadow-[0_0_8px_#34d399]"
                    style={{ width: `${clockState.progressPercent}%` }}
                  />
                </div>
              )}
            </>
          )}

          {/* 1. UPCOMING PRE-CLASS COUNTDOWN SCREEN */}
          {clockState.status === 'upcoming' && (
            <div className="absolute inset-0 z-20 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 flex flex-col items-center justify-center p-6 text-center space-y-6">
              <div className="space-y-2 max-w-lg">
                <span className="text-xs font-mono tracking-widest text-sky-400 uppercase">
                  Classroom Waiting Room
                </span>
                <h2 className="text-xl sm:text-2xl font-bold text-white">
                  {jeeClass.title}
                </h2>
                <div className="flex items-center justify-center gap-2 text-xs text-slate-400">
                  <span>{jeeClass.subject}</span>
                  <span aria-hidden="true">·</span>
                  <span>{jeeClass.faculty}</span>
                  <span aria-hidden="true">·</span>
                  <span>Starts at {formatISTTime(jeeClass.start_at)}</span>
                </div>
              </div>

              {/* Huge countdown numerals */}
              <div className="p-6 bg-slate-900/90 border border-slate-800 rounded-2xl shadow-xl">
                <div className="text-3xl sm:text-5xl font-mono font-bold tracking-tight text-amber-400 tabular-nums">
                  {formatCountdownString(clockState.remainingSeconds)}
                </div>
                <p className="text-xs text-slate-400 mt-2 font-mono">
                  Stream will start automatically in lockstep with IST clock
                </p>
              </div>

              {/* Waiting room study tools */}
              <div className="flex flex-wrap items-center justify-center gap-3">
                <button
                  onClick={() => setIsTimerOpen(true)}
                  className="px-4 py-2 text-xs font-semibold text-emerald-200 bg-emerald-950/80 hover:bg-emerald-900/80 border border-emerald-800/80 rounded-lg transition-colors flex items-center gap-2"
                >
                  <Timer className="w-4 h-4 text-emerald-400" />
                  <span>Launch Gap Focus Timer</span>
                </button>

                <button
                  onClick={() => playClassroomChime()}
                  className="px-4 py-2 text-xs font-medium text-slate-300 bg-slate-800/80 hover:bg-slate-700 rounded-lg transition-colors flex items-center gap-2"
                >
                  <Volume2 className="w-4 h-4 text-sky-400" />
                  <span>Test Audio Chime</span>
                </button>
              </div>
            </div>
          )}

          {/* 2. THE ACTUAL YOUTUBE IFRAME */}
          <div className="w-full h-full relative">
            {useDirectIframe ? (
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${jeeClass.youtube_id}?autoplay=1&playsinline=1&rel=0&modestbranding=1&enablejsapi=1&origin=${encodeURIComponent(typeof window !== 'undefined' ? window.location.origin : '')}`}
                title={jeeClass.title}
                className="w-full h-full border-0 pointer-events-auto"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            ) : (
              <div id="youtube-classroom-frame" className="w-full h-full pointer-events-auto" />
            )}
          </div>

          {/* EMBED RESTRICTION / UNAVAILABLE FALLBACK OVERLAY */}
          {(isPlaybackRestricted || jeeClass.is_embeddable === false) && (
            <div className="absolute inset-0 z-35 bg-slate-950/95 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/40 shadow-lg shadow-amber-950/50">
                <AlertTriangle className="w-7 h-7" />
              </div>
              <div className="space-y-1.5 max-w-md">
                <h3 className="text-base sm:text-lg font-bold text-white">
                  YouTube Playback Notice
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  {playbackErrorCode === 150 || playbackErrorCode === 101 || jeeClass.is_embeddable === false
                    ? 'The video author disabled 3rd-party web embeds, or your incognito browser blocked YouTube tracking cookies.'
                    : playbackErrorCode === 100
                    ? 'This YouTube video is private or has been removed.'
                    : 'YouTube player encountered a playback restriction on this browser or incognito session.'}
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
                <a
                  href={`https://www.youtube.com/watch?v=${jeeClass.youtube_id}${clockState.elapsedSeconds > 0 ? `&t=${clockState.elapsedSeconds}s` : ''}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-5 py-2.5 bg-red-600 hover:bg-red-500 text-white font-bold text-xs rounded-xl transition-all shadow-lg shadow-red-950/50 flex items-center gap-2 hover:scale-[1.02]"
                >
                  <Youtube className="w-4 h-4 fill-current" />
                  <span>Watch on YouTube App</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>

                <button
                  onClick={() => {
                    setIsPlaybackRestricted(false);
                    setUseDirectIframe(true);
                  }}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs rounded-xl border border-slate-700 transition-colors flex items-center gap-2"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-sky-400" />
                  <span>Try Direct No-Cookie Embed</span>
                </button>
              </div>

              <p className="text-[11px] font-mono text-emerald-400/90 pt-1">
                ✓ Study tracking and notes remain synchronized with your classroom session.
              </p>
            </div>
          )}

          {/* 3. SEEK-LOCK SHIELD OVERLAY (During Live Mode) */}
          {clockState.status === 'live' && !replayMode && (
            <div
              className="absolute bottom-0 left-0 right-0 h-12 bg-transparent z-10 cursor-not-allowed select-none"
              title="Seeking is locked during live broadcast"
              onClick={(e) => {
                e.stopPropagation();
              }}
            />
          )}

          {/* 4. AUTOPLAY BLOCKED USER GESTURE OVERLAY */}
          {isAutoplayBlocked && clockState.status === 'live' && (
            <div className="absolute inset-0 z-30 bg-black/85 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/40">
                <Play className="w-8 h-8 fill-current translate-x-0.5" />
              </div>
              <div className="space-y-1 max-w-md">
                <h3 className="text-lg font-bold text-white">Browser Audio/Video Permission</h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Your browser requires a student interaction to begin playing synchronized classroom audio and video.
                </p>
              </div>
              <button
                onClick={handleAutoplayGesture}
                className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-lg transition-colors shadow-lg"
              >
                Enter Audio & Video Stream
              </button>
            </div>
          )}

          {/* 5. CLASS CONCLUDED OVERLAY (with Replay Option) */}
          {clockState.status === 'ended' && !replayMode && (
            <div className="absolute inset-0 z-20 bg-slate-950/90 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center space-y-5">
              <CheckCircle2 className="w-12 h-12 text-emerald-400" />
              <div className="space-y-1 max-w-md">
                <h3 className="text-xl font-bold text-white">Class Concluded</h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  The live broadcast window for "{jeeClass.title}" has ended. You can now unlock unrestricted replay mode to review derivations, pause, and seek freely.
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-3">
                <button
                  onClick={() => {
                    setReplayMode(true);
                    if (playerRef.current && typeof playerRef.current.seekTo === 'function') {
                      playerRef.current.seekTo(0, true);
                      playerRef.current.playVideo();
                    }
                  }}
                  className="px-5 py-2.5 bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs rounded-lg transition-colors flex items-center gap-2"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Start Unrestricted Replay</span>
                </button>

                <button
                  onClick={() => setIsTimerOpen(true)}
                  className="px-4 py-2.5 bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-800 text-emerald-200 text-xs font-semibold rounded-lg transition-colors flex items-center gap-2"
                >
                  <Timer className="w-4 h-4 text-emerald-400" />
                  <span>25m Revision Sprint</span>
                </button>

                <button
                  onClick={onBack}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded-lg transition-colors"
                >
                  Return to Timetable
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ============================================================== */}
        {/* D. ROTATE MODE: SLIDING SIDEBAR DRAWER (Pad & Pomodoro Timer)   */}
        {/* ============================================================== */}
        {isRotateMode && isRotateScratchpadOpen && (
          <div className="w-72 sm:w-84 md:w-96 h-full bg-slate-950/95 border-l border-slate-800 z-40 p-3 flex flex-col shadow-2xl backdrop-blur-md shrink-0">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800">
              <div className="flex items-center gap-1 bg-slate-900 p-0.5 rounded-lg border border-slate-800">
                <button
                  onClick={() => setRotateSidebarTab('scratchpad')}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors flex items-center gap-1 ${
                    rotateSidebarTab === 'scratchpad'
                      ? 'bg-sky-500 text-slate-950 font-bold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Edit3 className="w-3 h-3" />
                  <span>Rough Pad</span>
                </button>
                <button
                  onClick={() => setRotateSidebarTab('pomodoro')}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors flex items-center gap-1 ${
                    rotateSidebarTab === 'pomodoro'
                      ? 'bg-emerald-600 text-slate-950 font-bold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Timer className="w-3 h-3" />
                  <span>Focus Timer</span>
                </button>
              </div>

              <button
                onClick={() => setIsRotateScratchpadOpen(false)}
                className="p-1 text-slate-400 hover:text-white rounded"
                title="Close drawer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {rotateSidebarTab === 'scratchpad' ? (
                <Scratchpad />
              ) : (
                <PomodoroTimer
                  compact
                  upcomingGapSeconds={clockState.status === 'upcoming' ? clockState.remainingSeconds : null}
                  onClose={() => setIsRotateScratchpadOpen(false)}
                />
              )}
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* E. STANDARD MODE: PROGRESS BAR & INFO SECTION                   */}
        {/* ============================================================== */}
        {!isRotateMode && (
          <>
            {/* Live Progress Bar beneath video */}
            {clockState.status === 'live' && (
              <div className="w-full bg-slate-900 h-1.5">
                <div
                  className="bg-emerald-400 h-full transition-all duration-1000"
                  style={{ width: `${clockState.progressPercent}%` }}
                />
              </div>
            )}

            {/* Classroom Info & Notice Section */}
            <div className="p-6 bg-slate-900/60 border-t border-slate-800/80 space-y-4">
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <span className="font-semibold text-sky-400">{jeeClass.subject}</span>
                    <span aria-hidden="true">·</span>
                    <span>{jeeClass.faculty}</span>
                    <span aria-hidden="true">·</span>
                    <span>Scheduled for {formatISTDateTime(jeeClass.start_at)}</span>
                  </div>
                  <h2 className="text-xl font-bold text-white">{jeeClass.title}</h2>
                  {jeeClass.topic && (
                    <p className="text-xs text-slate-300">
                      Target Topic: <span className="font-medium text-slate-100">{jeeClass.topic}</span>
                    </p>
                  )}
                  {jeeClass.description && (
                    <p className="text-xs text-slate-400 leading-relaxed max-w-3xl">
                      {jeeClass.description}
                    </p>
                  )}
                </div>

                {/* Replay mode banner if active */}
                {replayMode && (
                  <div className="px-3 py-2 rounded-lg bg-sky-950/60 border border-sky-800/60 text-xs text-sky-300 font-mono flex items-center gap-2 shrink-0">
                    <RotateCcw className="w-4 h-4" />
                    <span>Replay Mode: Scrubbing Unlocked</span>
                  </div>
                )}
              </div>
            </div>

            {/* Dedicated Lecture Moments & Notes Table */}
            <div className="p-5 sm:p-6 bg-slate-950/90 border-t border-slate-800 space-y-3.5">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/40 flex items-center justify-center">
                    <Bookmark className="w-3.5 h-3.5" />
                  </div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <span>Key Moments & Notes Table</span>
                    <span className="px-2 py-0.5 rounded-full bg-slate-900 text-amber-300 font-mono text-xs border border-slate-800">
                      {bookmarks.length} {bookmarks.length === 1 ? 'Moment' : 'Moments'}
                    </span>
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleTriggerBookmark}
                    className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl transition-all flex items-center gap-1.5 shadow"
                    title="Bookmark current timestamp"
                  >
                    <BookmarkPlus className="w-3.5 h-3.5" />
                    <span>Clip Current Second</span>
                  </button>
                  {onOpenMomentsTable && (
                    <button
                      onClick={onOpenMomentsTable}
                      className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 rounded-xl text-xs font-medium transition-colors flex items-center gap-1.5"
                      title="Open full Moments Table for all lectures"
                    >
                      <ExternalLink className="w-3.5 h-3.5 text-sky-400" />
                      <span>All Classes Table</span>
                    </button>
                  )}
                </div>
              </div>

              {bookmarks.length === 0 ? (
                <div className="p-5 rounded-xl bg-slate-900/50 border border-slate-800/80 text-center text-xs text-slate-400 space-y-1">
                  <p className="font-semibold text-slate-300">No moments saved for this class yet.</p>
                  <p className="text-[11px] text-slate-500">
                    Click <strong>"Note Moment"</strong> (or press key <strong>B</strong>) during the stream to bookmark crucial formulas, derivations, or mistake traps directly into your table.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/70">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-950/90 text-[11px] font-mono text-slate-400 uppercase tracking-wider border-b border-slate-800">
                        <th className="py-2.5 px-3.5 w-24">Time</th>
                        <th className="py-2.5 px-3.5 w-36">Type</th>
                        <th className="py-2.5 px-3.5">Your Note & Observation</th>
                        <th className="py-2.5 px-3.5 w-32 text-center">Instant Jump</th>
                        <th className="py-2.5 px-2 w-10 text-center"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {bookmarks.map((bm) => {
                        const categoryBadge = {
                          mistake: { label: 'Mistake Trap', icon: '⚠️', bg: 'bg-red-500/20 text-red-300 border-red-500/30' },
                          formula: { label: 'Formula', icon: '📐', bg: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30' },
                          derivation: { label: 'Derivation', icon: '💡', bg: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
                          doubt: { label: 'Doubt', icon: '❓', bg: 'bg-purple-500/20 text-purple-300 border-purple-500/30' },
                        }[bm.category] || { label: 'Note', icon: '🔖', bg: 'bg-slate-800 text-slate-300 border-slate-700' };

                        return (
                          <tr key={bm.id} className="hover:bg-slate-800/40 transition-colors">
                            <td className="py-2.5 px-3.5 font-mono whitespace-nowrap">
                              <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 font-bold border border-amber-500/30 text-[11px]">
                                ⏱️ {bm.timestampFormatted}
                              </span>
                            </td>
                            <td className="py-2.5 px-3.5 whitespace-nowrap">
                              <span className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${categoryBadge.bg}`}>
                                {categoryBadge.icon} {categoryBadge.label}
                              </span>
                            </td>
                            <td className="py-2.5 px-3.5 text-slate-200">
                              <p className="line-clamp-2">{bm.note}</p>
                            </td>
                            <td className="py-2.5 px-3.5 text-center whitespace-nowrap">
                              <button
                                onClick={() => {
                                  const p = playerRef.current;
                                  if (p && typeof p.seekTo === 'function') {
                                    setReplayMode(true);
                                    p.seekTo(bm.seconds, true);
                                    p.playVideo();
                                    setIsPlaying(true);
                                  }
                                }}
                                className="px-3 py-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-lg transition-all inline-flex items-center gap-1.5 shadow-sm hover:shadow-md"
                                title={`Jump straight to ${bm.timestampFormatted}`}
                              >
                                <Play className="w-2.5 h-2.5 fill-current" />
                                <span>Go to Moment</span>
                              </button>
                            </td>
                            <td className="py-2.5 px-2 text-center">
                              <button
                                onClick={() => {
                                  deleteBookmark(bm.id);
                                  setBookmarks(getBookmarksForClass(jeeClass.id));
                                }}
                                className="p-1 text-slate-500 hover:text-red-400 rounded hover:bg-slate-900 transition-colors"
                                title="Delete note"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Pomodoro Focus Timer Drawer (Standard Mode) */}
      {isTimerOpen && (
        <div className="mt-4 p-5 bg-slate-900/90 border border-slate-800 rounded-2xl shadow-xl animate-in fade-in duration-200">
          <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                <Timer className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-white uppercase tracking-wider font-sans">
                  inspiro Pomodoro Study & Gap Focus Optimizer
                </h3>
                <p className="text-[11px] text-slate-400">
                  Ideal for pre-class warmups, formula revision, and deep problem-solving during non-live intervals.
                </p>
              </div>
            </div>
            <button
              onClick={() => setIsTimerOpen(false)}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-850 transition-colors"
              title="Close Timer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="max-w-md mx-auto">
            <PomodoroTimer
              upcomingGapSeconds={clockState.status === 'upcoming' ? clockState.remainingSeconds : null}
              onClose={() => setIsTimerOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Rough Workpad Drawer */}
      {isScratchpadOpen && (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
              Rough Workpad & Equation Calculation Canvas
            </h3>
            <span className="text-[11px] text-slate-500 font-mono">
              Drawings auto-saved in local buffer
            </span>
          </div>
          <Scratchpad />
        </div>
      )}

      {/* ============================================================== */}
      {/* NOTE MOMENT CAPTURE MODAL (Available in Live, Rotate & Replay) */}
      {/* ============================================================== */}
      {isBookmarkModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-lg bg-slate-900 border border-amber-500/40 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="px-5 py-4 bg-slate-950/90 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/40 flex items-center justify-center">
                  <BookmarkPlus className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <span>Note Key Moment</span>
                    <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-mono text-xs border border-amber-500/30">
                      ⏱️ {Math.floor(currentBookmarkSeconds / 60)}:{String(Math.floor(currentBookmarkSeconds % 60)).padStart(2, '0')}
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-400 truncate max-w-xs">
                    {jeeClass.subject}: {jeeClass.title}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsBookmarkModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
                title="Cancel"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4">
              {/* Category Selection */}
              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Moment Classification
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { id: 'mistake', label: 'Tricky Mistake', icon: '⚠️', color: 'border-red-500/40 text-red-300 bg-red-950/30' },
                    { id: 'formula', label: 'Formula / Law', icon: '📐', color: 'border-cyan-500/40 text-cyan-300 bg-cyan-950/30' },
                    { id: 'derivation', label: 'Derivation Step', icon: '💡', color: 'border-amber-500/40 text-amber-300 bg-amber-950/30' },
                    { id: 'doubt', label: 'Doubt / Review', icon: '❓', color: 'border-purple-500/40 text-purple-300 bg-purple-950/30' },
                  ].map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setBookmarkCategory(cat.id as BookmarkCategory)}
                      className={`p-2.5 rounded-xl border text-xs font-semibold flex flex-col items-center justify-center gap-1 transition-all ${
                        bookmarkCategory === cat.id
                          ? `${cat.color} ring-2 ring-amber-400/50 shadow-md`
                          : 'bg-slate-950/50 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                      }`}
                    >
                      <span className="text-base">{cat.icon}</span>
                      <span className="text-[11px] text-center leading-tight">{cat.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Note Textarea */}
              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  Your Learning Note & Observation
                </label>
                <textarea
                  value={bookmarkNote}
                  onChange={(e) => setBookmarkNote(e.target.value)}
                  placeholder="e.g. Teacher explained shortcut for instantaneous center of zero velocity; do not forget sign convention."
                  rows={3}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/60 focus:ring-2 focus:ring-amber-500/50"
                  autoFocus
                />
              </div>

              {/* Quick Preset Tags */}
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                <span className="text-[10px] text-slate-500 font-mono">Quick insert:</span>
                {[
                  'Sign Convention Trap',
                  'High JEE Weightage',
                  'Revise Before Mock Test',
                  'Teacher Important Hint',
                ].map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => {
                      setBookmarkNote(prev => (prev ? `${prev} · ${tag}` : tag));
                    }}
                    className="px-2 py-0.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-mono border border-slate-700 transition-colors"
                  >
                    + {tag}
                  </button>
                ))}
              </div>
            </div>

            {/* Modal Actions */}
            <div className="px-5 py-3.5 bg-slate-950/90 border-t border-slate-800 flex items-center justify-between gap-3">
              <span className="text-[11px] font-mono text-slate-500 hidden sm:inline">
                Auto-saved permanently on server & device
              </span>
              <div className="flex items-center gap-2.5 ml-auto">
                <button
                  type="button"
                  onClick={() => setIsBookmarkModalOpen(false)}
                  className="px-3.5 py-1.5 text-xs text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveBookmark}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow-lg shadow-amber-950/40 transition-all flex items-center gap-2 hover:scale-[1.02]"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Save Note Moment</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* SAVED MOMENTS & NOTES VAULT MODAL                              */}
      {/* ============================================================== */}
      {isBookmarksVaultOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden max-h-[85vh] flex flex-col animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="px-5 py-4 bg-slate-950/90 border-b border-slate-800 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/40 flex items-center justify-center">
                  <Bookmark className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <span>Saved Moments Vault</span>
                    <span className="px-2 py-0.5 rounded-full bg-slate-800 text-amber-300 font-mono text-xs border border-slate-700">
                      {bookmarks.length} {bookmarks.length === 1 ? 'Moment' : 'Moments'}
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-400 truncate max-w-xs sm:max-w-md">
                    {jeeClass.title}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsBookmarksVaultOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* List */}
            <div className="p-4 overflow-y-auto space-y-3 flex-1 scrollbar-thin">
              {bookmarks.length === 0 ? (
                <div className="text-center py-10 space-y-2 text-slate-400">
                  <BookmarkPlus className="w-8 h-8 text-slate-600 mx-auto" />
                  <p className="text-xs">No moments noted yet for this lecture.</p>
                  <p className="text-[11px] text-slate-500">
                    Click "Note Moment" (or press B) anytime during live stream or rotate mode to save important timestamps!
                  </p>
                </div>
              ) : (
                bookmarks.map((bm) => {
                  const categoryBadge = {
                    mistake: { label: 'Mistake Trap', bg: 'bg-red-500/20 text-red-300 border-red-500/30' },
                    formula: { label: 'Formula', bg: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30' },
                    derivation: { label: 'Derivation', bg: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
                    doubt: { label: 'Doubt', bg: 'bg-purple-500/20 text-purple-300 border-purple-500/30' },
                  }[bm.category] || { label: 'Note', bg: 'bg-slate-800 text-slate-300 border-slate-700' };

                  return (
                    <div
                      key={bm.id}
                      className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800/80 hover:border-slate-700 transition-colors flex items-start justify-between gap-3"
                    >
                      <div className="space-y-1.5 flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 font-mono font-bold text-xs border border-amber-500/40">
                            ⏱️ {bm.timestampFormatted}
                          </span>
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase font-mono border ${categoryBadge.bg}`}>
                            {categoryBadge.label}
                          </span>
                        </div>
                        <p className="text-xs text-slate-200 leading-relaxed break-words font-sans">
                          {bm.note}
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0 self-center">
                        <button
                          onClick={() => {
                            const p = playerRef.current;
                            if (p && typeof p.seekTo === 'function') {
                              setReplayMode(true);
                              p.seekTo(bm.seconds, true);
                              p.playVideo();
                              setIsPlaying(true);
                            }
                            setIsBookmarksVaultOpen(false);
                          }}
                          className="px-2.5 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs font-mono transition-colors flex items-center gap-1 shadow-sm"
                          title="Jump straight to this moment"
                        >
                          <Play className="w-2.5 h-2.5 fill-current" />
                          <span>Jump</span>
                        </button>
                        <button
                          onClick={() => {
                            deleteBookmark(bm.id);
                            setBookmarks(getBookmarksForClass(jeeClass.id));
                          }}
                          className="p-1.5 text-slate-500 hover:text-red-400 rounded-lg hover:bg-slate-800 transition-colors"
                          title="Delete note moment"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400 shrink-0">
              <span className="font-mono text-[11px] text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Safely backed up on disk & device</span>
              </span>
              <button
                onClick={() => {
                  setIsBookmarksVaultOpen(false);
                  handleTriggerBookmark();
                }}
                className="px-3 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg transition-colors flex items-center gap-1.5"
              >
                <BookmarkPlus className="w-3.5 h-3.5" />
                <span>Add Another Moment</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
