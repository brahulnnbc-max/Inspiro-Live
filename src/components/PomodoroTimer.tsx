import React, { useState, useEffect, useRef } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  SkipForward,
  Flame,
  Coffee,
  Bell,
  BellOff,
  CheckCircle2,
  Clock,
  Sparkles,
  BookOpen,
} from 'lucide-react';
import { JEEClassSubject } from '../types/class';
import { logStudyTime } from '../lib/studyTracker';

interface Props {
  compact?: boolean;
  upcomingGapSeconds?: number | null;
  onClose?: () => void;
}

type TimerMode = 'pomodoro' | 'deep' | 'short_break' | 'long_break' | 'gap_sync';

const MODE_DURATIONS: Record<TimerMode, number> = {
  pomodoro: 25 * 60,
  deep: 50 * 60,
  short_break: 5 * 60,
  long_break: 15 * 60,
  gap_sync: 15 * 60,
};

export const PomodoroTimer: React.FC<Props> = ({
  compact = false,
  upcomingGapSeconds,
  onClose,
}) => {
  const [mode, setMode] = useState<TimerMode>('pomodoro');
  const [timeLeft, setTimeLeft] = useState<number>(MODE_DURATIONS.pomodoro);
  const [isActive, setIsActive] = useState<boolean>(false);
  const [sessionsCompleted, setSessionsCompleted] = useState<number>(0);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [subject, setSubject] = useState<JEEClassSubject>('Physics');

  const initialDurationRef = useRef<number>(MODE_DURATIONS.pomodoro);

  // Play pleasant synthetic study bell chime using Web Audio API
  const playBellChime = () => {
    if (!soundEnabled) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();

      const playTone = (freq: number, start: number, duration: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
        gain.gain.setValueAtTime(0, ctx.currentTime + start);
        gain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + start + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + start);
        osc.stop(ctx.currentTime + start + duration);
      };

      // Two harmonic chime notes
      playTone(587.33, 0, 1.2);    // D5
      playTone(880.00, 0.25, 1.6); // A5
    } catch (e) {
      // AudioContext blocked or unsupported
    }
  };

  // Switch modes
  const handleModeChange = (newMode: TimerMode, customDuration?: number) => {
    setIsActive(false);
    setMode(newMode);
    const duration = customDuration ?? MODE_DURATIONS[newMode];
    initialDurationRef.current = duration;
    setTimeLeft(duration);
  };

  // Sync with upcoming live class gap
  const handleSyncToClassGap = () => {
    if (!upcomingGapSeconds || upcomingGapSeconds <= 60) return;
    // Buffer 60 seconds before class starts
    const targetSec = Math.max(120, upcomingGapSeconds - 60);
    handleModeChange('gap_sync', targetSec);
    setIsActive(true);
  };

  // Tick countdown timer
  useEffect(() => {
    let interval: any = null;
    if (isActive && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (isActive && timeLeft === 0) {
      playBellChime();
      setIsActive(false);

      if (mode === 'pomodoro' || mode === 'deep' || mode === 'gap_sync') {
        const nextCount = sessionsCompleted + 1;
        setSessionsCompleted(nextCount);
        // Log real study time for the selected subject
        const completedMinutes = Math.round(initialDurationRef.current / 60);
        logStudyTime(subject, completedMinutes, 'pomodoro');

        // Switch to break
        if (nextCount % 4 === 0) {
          handleModeChange('long_break');
        } else {
          handleModeChange('short_break');
        }
      } else {
        // Break finished, switch to focus
        handleModeChange('pomodoro');
      }
    }
    return () => clearInterval(interval);
  }, [isActive, timeLeft, mode, sessionsCompleted, soundEnabled]);

  const togglePlay = () => setIsActive(!isActive);

  const resetTimer = () => {
    setIsActive(false);
    setTimeLeft(initialDurationRef.current);
  };

  const skipPhase = () => {
    setIsActive(false);
    if (mode === 'pomodoro' || mode === 'deep' || mode === 'gap_sync') {
      handleModeChange('short_break');
    } else {
      handleModeChange('pomodoro');
    }
  };

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const timeFormatted = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  const progressPercent = initialDurationRef.current > 0
    ? Math.min(100, Math.max(0, ((initialDurationRef.current - timeLeft) / initialDurationRef.current) * 100))
    : 0;

  const isBreak = mode === 'short_break' || mode === 'long_break';

  return (
    <div className="flex flex-col h-full bg-slate-950/95 text-slate-100 select-none">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg flex items-center justify-center bg-emerald-500/20 text-emerald-400">
            {isBreak ? <Coffee className="w-3.5 h-3.5" /> : <Flame className="w-3.5 h-3.5" />}
          </div>
          <div>
            <h3 className="text-xs font-bold text-white tracking-tight flex items-center gap-1.5 font-sans">
              <span>{isBreak ? 'Break Timer' : 'Pomodoro Focus'}</span>
              <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                isBreak ? 'bg-teal-950 text-teal-300' : 'bg-emerald-950 text-emerald-300'
              }`}>
                {isBreak ? 'REST' : 'FOCUS'}
              </span>
            </h3>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="p-1.5 text-slate-400 hover:text-white rounded hover:bg-slate-900 transition-colors"
            title={soundEnabled ? 'Chime sound enabled' : 'Mute completion chime'}
          >
            {soundEnabled ? <Bell className="w-3.5 h-3.5 text-amber-400" /> : <BellOff className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Mode Selector Tabs */}
      <div className="grid grid-cols-3 gap-1 py-3 border-b border-slate-800/80 text-[11px] font-medium">
        <button
          onClick={() => handleModeChange('pomodoro')}
          className={`py-1.5 px-2 rounded-md transition-all text-center ${
            mode === 'pomodoro'
              ? 'bg-emerald-600 text-white font-bold shadow-md shadow-emerald-950'
              : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-850'
          }`}
        >
          25m Focus
        </button>

        <button
          onClick={() => handleModeChange('deep')}
          className={`py-1.5 px-2 rounded-md transition-all text-center ${
            mode === 'deep'
              ? 'bg-emerald-600 text-white font-bold shadow-md shadow-emerald-950'
              : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-850'
          }`}
        >
          50m Deep
        </button>

        <button
          onClick={() => handleModeChange('short_break')}
          className={`py-1.5 px-2 rounded-md transition-all text-center ${
            mode === 'short_break'
              ? 'bg-teal-600 text-white font-bold shadow-md shadow-teal-950'
              : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-850'
          }`}
        >
          5m Break
        </button>
      </div>

      {/* Live Gap Quick Sync Assist (When upcoming live lecture is waiting) */}
      {upcomingGapSeconds && upcomingGapSeconds > 120 && (
        <div className="my-2.5 p-2 rounded-lg bg-emerald-950/30 border border-emerald-800/40 flex items-center justify-between text-xs gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <Clock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="text-[11px] text-emerald-200 truncate">
              Class in {Math.round(upcomingGapSeconds / 60)}m
            </span>
          </div>
          <button
            onClick={handleSyncToClassGap}
            className="px-2 py-0.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-[10px] rounded transition-colors whitespace-nowrap shrink-0 shadow"
          >
            Sync Gap
          </button>
        </div>
      )}

      {/* Main Circular Countdown Display */}
      <div className="flex-1 flex flex-col items-center justify-center py-4 relative">
        <div className="relative w-40 h-40 flex items-center justify-center">
          {/* Background SVG Circle */}
          <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
            <circle
              cx="50"
              cy="50"
              r="44"
              strokeWidth="6"
              fill="transparent"
              className="stroke-slate-800/80"
            />
            {/* Animated progress stroke */}
            <circle
              cx="50"
              cy="50"
              r="44"
              strokeWidth="6"
              strokeDasharray={276.46}
              strokeDashoffset={276.46 - (276.46 * progressPercent) / 100}
              strokeLinecap="round"
              fill="transparent"
              className={`transition-all duration-1000 ${
                isBreak ? 'stroke-teal-400' : 'stroke-emerald-400'
              }`}
            />
          </svg>

          {/* Center Digital Clock */}
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <div className="text-3xl font-bold font-mono tracking-tight text-white tabular-nums drop-shadow-md">
              {timeFormatted}
            </div>
            <div className={`text-[10px] font-semibold uppercase tracking-widest mt-0.5 ${
              isBreak ? 'text-teal-400' : 'text-emerald-400'
            }`}>
              {isActive ? 'In Progress' : 'Paused'}
            </div>
          </div>
        </div>

        {/* Milestone Session Dots */}
        <div className="flex items-center gap-1.5 mt-4">
          {[0, 1, 2, 3].map((idx) => {
            const isDone = (sessionsCompleted % 4) > idx || (sessionsCompleted > 0 && sessionsCompleted % 4 === 0);
            return (
              <span
                key={idx}
                className={`w-2.5 h-2.5 rounded-full transition-all ${
                  isDone
                    ? 'bg-emerald-400 shadow-[0_0_6px_#34d399]'
                    : 'bg-slate-800 border border-slate-700'
                }`}
                title={`Sprint ${idx + 1}`}
              />
            );
          })}
          <span className="text-[10px] font-mono text-slate-400 ml-1.5">
            {sessionsCompleted} completed
          </span>
        </div>

        {/* Subject Attribution for Real Study Tracking */}
        <div className="flex items-center gap-1.5 mt-3 px-2 py-1 bg-slate-950/80 border border-slate-800 rounded-lg">
          <BookOpen className="w-3 h-3 text-slate-400" />
          <span className="text-[10px] text-slate-400 mr-1">Log to:</span>
          {(['Physics', 'Chemistry', 'Mathematics'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSubject(s)}
              className={`px-2 py-0.5 text-[10px] font-semibold rounded transition-colors ${
                subject === s
                  ? s === 'Physics'
                    ? 'bg-sky-500 text-slate-950'
                    : s === 'Chemistry'
                    ? 'bg-emerald-500 text-slate-950'
                    : 'bg-amber-500 text-slate-950'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Main Control Action Bar */}
      <div className="pt-3 border-t border-slate-800 space-y-2">
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={resetTimer}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-900 border border-slate-800/80 transition-colors"
            title="Reset Timer"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          <button
            onClick={togglePlay}
            className={`px-6 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all shadow-lg ${
              isActive
                ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold shadow-emerald-950/60'
            }`}
          >
            {isActive ? (
              <>
                <Pause className="w-4 h-4 fill-current" />
                <span>Pause</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-current translate-x-0.5" />
                <span>Start Focus</span>
              </>
            )}
          </button>

          <button
            onClick={skipPhase}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-900 border border-slate-800/80 transition-colors"
            title="Skip to next phase"
          >
            <SkipForward className="w-4 h-4" />
          </button>
        </div>

        <p className="text-[10px] text-center text-slate-400 font-mono">
          Non-live gap study optimizer · Auto-chime on complete
        </p>
      </div>
    </div>
  );
};
