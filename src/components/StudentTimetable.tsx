import React, { useState, useEffect } from 'react';
import { Play, Clock, Calendar, CheckCircle2, AlertCircle, Sparkles, Filter, ArrowRight, ShieldAlert } from 'lucide-react';
import { JEEClass, ClassStatus } from '../types/class';
import { formatISTDateTime, formatISTTime, formatISTDayLabel, getLiveClockStatus, formatCountdownString } from '../lib/istTime';
import { WeeklyProgressCard } from './WeeklyProgressCard';
import { getAllAttendance } from '../lib/clientData';

interface Props {
  classes: JEEClass[];
  onSelectClass: (c: JEEClass) => void;
  openAdmin: () => void;
  openFormulaModal: () => void;
  onEnableNotifications: () => void;
  hasNotifications: boolean;
}

export const StudentTimetable: React.FC<Props> = ({
  classes,
  onSelectClass,
  openAdmin,
  openFormulaModal,
  onEnableNotifications,
  hasNotifications,
}) => {
  const [filterStatus, setFilterStatus] = useState<'all' | 'today' | 'upcoming' | 'past'>('all');
  const [filterSubject, setFilterSubject] = useState<'all' | 'Physics' | 'Chemistry' | 'Mathematics'>('all');
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  const [attendance, setAttendance] = useState(getAllAttendance);

  useEffect(() => {
    const handleUpdate = () => setAttendance(getAllAttendance());
    window.addEventListener('inspiro_attendance_updated', handleUpdate);
    return () => window.removeEventListener('inspiro_attendance_updated', handleUpdate);
  }, []);

  // Listen to custom today filter event from header
  useEffect(() => {
    const handleFilterToday = () => setFilterStatus('today');
    window.addEventListener('filter-today', handleFilterToday);
    return () => window.removeEventListener('filter-today', handleFilterToday);
  }, []);

  // 1-second interval to update clocks and countdowns
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Format current IST live time
  const currentISTString = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }).format(currentTime);

  const currentISTDateString = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  }).format(currentTime);

  // Find currently live class if any
  const liveClass = classes.find((c) => {
    const status = getLiveClockStatus(c.start_at, c.duration_min);
    return status.status === 'live';
  });

  // Find nearest upcoming class
  const upcomingClass = classes
    .filter((c) => {
      const clock = getLiveClockStatus(c.start_at, c.duration_min);
      return clock.status === 'upcoming';
    })
    .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime())[0];

  const upcomingClock = upcomingClass
    ? getLiveClockStatus(upcomingClass.start_at, upcomingClass.duration_min)
    : null;

  // Filter classes
  const filteredClasses = classes.filter((c) => {
    const clock = getLiveClockStatus(c.start_at, c.duration_min);

    // Status filter
    if (filterStatus === 'today') {
      const isToday = formatISTDayLabel(c.start_at) === 'Today';
      if (!isToday) return false;
    } else if (filterStatus === 'upcoming') {
      if (clock.status === 'ended') return false;
    } else if (filterStatus === 'past') {
      if (clock.status !== 'ended') return false;
    }

    // Subject filter
    if (filterSubject !== 'all' && c.subject !== filterSubject) {
      return false;
    }

    return true;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      {/* Upper Side Class Starting Countdown Pop-Up Banner */}
      {upcomingClass && upcomingClock && (
        <aside
          aria-label="Upcoming class starting countdown banner"
          className="relative rounded-2xl bg-gradient-to-r from-amber-950/80 via-slate-900 to-slate-950 border border-amber-500/40 p-3.5 sm:p-4 shadow-2xl backdrop-blur-md flex flex-col md:flex-row md:items-center justify-between gap-4 animate-in fade-in slide-in-from-top-3"
        >
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center shrink-0 shadow-[0_0_12px_rgba(245,158,11,0.25)]">
              <Clock className="w-5 h-5 animate-pulse" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 font-mono">
                  CLASS STARTING SOON
                </span>
                <span className="text-xs sm:text-sm font-bold text-white truncate">
                  {upcomingClass.subject}: {upcomingClass.title}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1 flex flex-wrap items-center gap-2">
                <span>Faculty: <strong className="text-slate-200">{upcomingClass.faculty}</strong></span>
                <span className="text-slate-600">·</span>
                <span>Scheduled for <strong className="text-amber-300 font-mono">{formatISTTime(upcomingClass.start_at)} IST</strong></span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0 self-end md:self-center">
            {/* Live Ticking Countdown Box */}
            <div className="bg-slate-950/90 border border-amber-500/40 px-3.5 py-1.5 rounded-xl text-center shadow-inner font-mono">
              <span className="block text-[9px] text-amber-300/80 uppercase tracking-widest font-sans font-bold">
                Starts In
              </span>
              <span className="text-sm sm:text-base font-black text-amber-400 tabular-nums">
                {formatCountdownString(upcomingClock.remainingSeconds)}
              </span>
            </div>

            <button
              onClick={() => onSelectClass(upcomingClass)}
              className="px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs rounded-xl transition-all shadow-lg shadow-amber-950/40 flex items-center gap-2 hover:scale-[1.02] active:scale-[0.98] whitespace-nowrap"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>Enter Waiting Room</span>
            </button>
          </div>
        </aside>
      )}

      {/* Top Hero / Daily Routine Header */}
      <section className="relative rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900/90 to-slate-950 border border-slate-800 p-4 sm:p-8 overflow-hidden">
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-3 max-w-2xl">
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 text-xs text-sky-400 font-mono tracking-wide">
              <span>INDIAN STANDARD TIME (IST)</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">{currentISTDateString}</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums font-semibold">{currentISTString}</span>
            </div>

            <h1 className="text-xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-white" style={{ textWrap: 'balance' }}>
              JEE Main & Advanced Live Lecture Timetable
            </h1>

            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              Curated faculty broadcasts scheduled as live classes with clock-locked playback. 
              Late joiners synchronize to the exact stream timestamp to enforce authentic exam prep discipline.
            </p>

            <div className="flex flex-wrap items-center gap-2.5 pt-1 sm:pt-2">
              <button
                onClick={openFormulaModal}
                className="px-3.5 py-1.5 text-xs font-medium text-slate-200 bg-slate-800 border border-slate-700 rounded-lg hover:bg-slate-700/80 transition-colors whitespace-nowrap"
              >
                Formula Vault
              </button>
              {!hasNotifications ? (
                <button
                  onClick={onEnableNotifications}
                  className="px-3.5 py-1.5 text-xs font-medium text-sky-300 bg-sky-950/60 border border-sky-800/80 rounded-lg hover:bg-sky-900/60 transition-colors whitespace-nowrap"
                >
                  Enable 15m Start Alerts
                </button>
              ) : (
                <span className="text-xs text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Web Push active</span>
                </span>
              )}
            </div>
          </div>

          {/* Live class spotlight card if currently in session */}
          {liveClass ? (
            <div className="w-full lg:w-96 p-4 sm:p-5 rounded-xl bg-slate-950/90 border border-emerald-500/30 shadow-xl space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">
                  Class In Session
                </span>
                <span className="text-xs font-mono text-slate-400">
                  {formatISTTime(liveClass.start_at)}
                </span>
              </div>

              <div>
                <h3 className="text-base font-semibold text-white line-clamp-2">
                  {liveClass.title}
                </h3>
                <div className="flex items-center gap-2 text-xs text-slate-400 mt-1">
                  <span>{liveClass.subject}</span>
                  <span aria-hidden="true">·</span>
                  <span>{liveClass.faculty}</span>
                </div>
              </div>

              {/* Progress bar */}
              {(() => {
                const liveClock = getLiveClockStatus(liveClass.start_at, liveClass.duration_min);
                return (
                  <div className="space-y-1.5">
                    <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                      <div
                        className="bg-emerald-400 h-full transition-all duration-1000"
                        style={{ width: `${liveClock.progressPercent}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[11px] font-mono text-slate-400">
                      <span>{Math.floor(liveClock.elapsedSeconds / 60)}m elapsed</span>
                      <span>{Math.floor(liveClock.remainingSeconds / 60)}m remaining</span>
                    </div>
                  </div>
                );
              })()}

              <button
                onClick={() => onSelectClass(liveClass)}
                className="w-full py-2.5 px-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>Join Live Classroom</span>
              </button>
            </div>
          ) : upcomingClass && upcomingClock ? (
            <div className="w-full lg:w-96 p-4 sm:p-5 rounded-xl bg-slate-950/90 border border-amber-500/30 shadow-xl space-y-3">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-xs font-semibold text-amber-400 uppercase tracking-wider">
                  <Clock className="w-3.5 h-3.5 animate-pulse" />
                  <span>Next Class Starting Soon</span>
                </span>
                <span className="text-xs font-mono text-slate-400">
                  {formatISTTime(upcomingClass.start_at)}
                </span>
              </div>

              <div>
                <h3 className="text-base font-semibold text-white line-clamp-2">
                  {upcomingClass.title}
                </h3>
                <div className="flex items-center gap-2 text-xs text-slate-400 mt-1">
                  <span className="text-amber-300 font-medium">{upcomingClass.subject}</span>
                  <span aria-hidden="true">·</span>
                  <span>{upcomingClass.faculty}</span>
                </div>
              </div>

              {/* Countdown numeral box */}
              <div className="p-3 bg-slate-900/90 border border-slate-800 rounded-lg flex items-center justify-between">
                <span className="text-xs text-slate-400 font-mono">Stream starts in:</span>
                <span className="text-base sm:text-lg font-mono font-bold text-amber-400 tabular-nums">
                  {formatCountdownString(upcomingClock.remainingSeconds)}
                </span>
              </div>

              <button
                onClick={() => onSelectClass(upcomingClass)}
                className="w-full py-2.5 px-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg transition-colors flex items-center justify-center gap-2 shadow"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>Enter Pre-Class Waiting Room</span>
              </button>
            </div>
          ) : (
            <div className="w-full lg:w-80 p-5 rounded-xl bg-slate-950/50 border border-slate-800 text-xs text-slate-400 space-y-2">
              <span className="text-slate-300 font-medium block">Distraction-Free Protocol</span>
              <p className="leading-relaxed">
                Lectures synchronize strictly to Indian Standard Time. Fast-forwarding and seeking are restricted to recreate an authentic in-person classroom environment.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Weekly Progress Analytics Card using Recharts */}
      <section>
        <WeeklyProgressCard classes={classes} />
      </section>

      {/* Segmented Controls & Subject Filter */}
      <section className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-800/80 pb-4">
        {/* Status segmented controls */}
        <div className="flex items-center gap-1 p-1 bg-slate-900 border border-slate-800 rounded-lg max-w-full overflow-x-auto scrollbar-none self-start">
          <button
            onClick={() => setFilterStatus('all')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
              filterStatus === 'all'
                ? 'bg-slate-800 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            All Classes
          </button>
          <button
            onClick={() => setFilterStatus('today')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
              filterStatus === 'today'
                ? 'bg-slate-800 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Today's Classes
          </button>
          <button
            onClick={() => setFilterStatus('upcoming')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
              filterStatus === 'upcoming'
                ? 'bg-slate-800 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Upcoming
          </button>
          <button
            onClick={() => setFilterStatus('past')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
              filterStatus === 'past'
                ? 'bg-slate-800 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Past Replays
          </button>
        </div>

        {/* Subject filter tabs */}
        <div className="flex items-center gap-1 p-1 bg-slate-900 border border-slate-800 rounded-lg max-w-full overflow-x-auto scrollbar-none self-start">
          {(['all', 'Physics', 'Chemistry', 'Mathematics'] as const).map((sub) => (
            <button
              key={sub}
              onClick={() => setFilterSubject(sub)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
                filterSubject === sub
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {sub === 'all' ? 'All Subjects' : sub}
            </button>
          ))}
        </div>
      </section>

      {/* Class Cards Grid */}
      <section className="space-y-4">
        {filteredClasses.length === 0 ? (
          <div className="text-center py-14 bg-slate-900/40 border border-slate-800/80 rounded-2xl p-8 space-y-4 max-w-md mx-auto">
            <div className="w-12 h-12 rounded-xl bg-slate-800/70 border border-slate-700/60 mx-auto flex items-center justify-center text-slate-400">
              <Calendar className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-semibold text-white">
                {classes.length === 0 ? 'No Scheduled Classes' : 'No Classes Matching Filter'}
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                {classes.length === 0
                  ? 'Your timetable is currently empty. Head over to the Faculty Admin panel to schedule lectures or manage your timetable.'
                  : 'Try clearing your subject or status filter to see other scheduled classes.'}
              </p>
            </div>
            {classes.length === 0 ? (
              <button
                onClick={openAdmin}
                className="px-4 py-2 bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs rounded-lg transition-colors"
              >
                Open Admin Panel
              </button>
            ) : (
              <button
                onClick={() => {
                  setFilterStatus('all');
                  setFilterSubject('all');
                }}
                className="text-xs text-sky-400 hover:underline font-medium"
              >
                Reset all filters
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
            {filteredClasses.map((item) => {
              const clock = getLiveClockStatus(item.start_at, item.duration_min);
              const dayLabel = formatISTDayLabel(item.start_at);
              const timeString = formatISTTime(item.start_at);

              return (
                <div
                  key={item.id}
                  className={`relative rounded-xl border bg-slate-900/80 p-4 sm:p-5 flex flex-col justify-between transition-all duration-200 hover:border-slate-700 ${
                    clock.status === 'live'
                      ? 'border-emerald-500/50 shadow-lg shadow-emerald-950/20'
                      : 'border-slate-800'
                  }`}
                >
                  <div className="space-y-3">
                    {/* Top unboxed metadata line */}
                    <div className="flex items-center justify-between text-xs text-slate-400 flex-wrap gap-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`font-semibold ${
                          item.subject === 'Physics'
                            ? 'text-cyan-400'
                            : item.subject === 'Chemistry'
                            ? 'text-emerald-400'
                            : 'text-amber-400'
                        }`}>
                          {item.subject}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{item.faculty}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">{item.duration_min} min</span>
                      </div>

                      {/* Status indicator: Professional Red Dot only for live classes */}
                      <div>
                        {clock.status === 'live' && (
                          <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5 font-mono">
                            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_#ef4444]"></span>
                            <span>LIVE NOW</span>
                          </span>
                        )}
                        {clock.status === 'upcoming' && (
                          <span className="text-xs font-mono text-sky-400">
                            in {formatCountdownString(clock.remainingSeconds)}
                          </span>
                        )}
                        {clock.status === 'ended' && (
                          <div className="flex items-center gap-1.5">
                            {attendance[item.id]?.completed ? (
                              <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1 font-mono">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Completed</span>
                              </span>
                            ) : attendance[item.id]?.percent ? (
                              <span className="text-xs text-sky-400 font-medium font-mono">
                                {attendance[item.id].percent}% Watched
                              </span>
                            ) : (
                              <span className="text-xs text-slate-400 font-mono">
                                Concluded
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Class Title */}
                    <div>
                      <h3 className="text-base font-semibold text-slate-100 hover:text-white transition-colors cursor-pointer" onClick={() => onSelectClass(item)}>
                        {item.title}
                      </h3>
                      {item.topic && (
                        <p className="text-xs text-slate-400 mt-1">
                          Topic: {item.topic}
                        </p>
                      )}
                    </div>

                    {item.description && (
                      <p className="text-xs text-slate-400 leading-relaxed line-clamp-2">
                        {item.description}
                      </p>
                    )}

                    {/* Live Progress Bar if active */}
                    {clock.status === 'live' && (
                      <div className="space-y-1 pt-1">
                        <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                          <div
                            className="bg-emerald-400 h-full transition-all duration-1000"
                            style={{ width: `${clock.progressPercent}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-[10px] font-mono text-slate-400">
                          <span>{Math.floor(clock.elapsedSeconds / 60)}m elapsed</span>
                          <span>{Math.floor(clock.remainingSeconds / 60)}m left</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Card Footer */}
                  <div className="mt-5 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 text-slate-400 font-mono">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      <span>{dayLabel}</span>
                      <span aria-hidden="true">·</span>
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      <span>{timeString}</span>
                    </div>

                    <button
                      onClick={() => onSelectClass(item)}
                      className={`px-4 py-2 font-medium text-xs rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                        clock.status === 'live'
                          ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold'
                          : clock.status === 'upcoming'
                          ? 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                          : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                      }`}
                    >
                      <span>
                        {clock.status === 'live'
                          ? 'Join Live Class'
                          : clock.status === 'upcoming'
                          ? 'Enter Waiting Room'
                          : 'Watch Replay'}
                      </span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
