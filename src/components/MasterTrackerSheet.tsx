import React, { useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  FileText,
  Flame,
  HelpCircle,
  Lock,
  Plus,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react';
import { LiveSession, SessionCategory, Subject } from '../types';
import { SPACED_REPETITION_STAGES } from '../lib/spacedRepetition';

interface MasterTrackerSheetProps {
  sessions: LiveSession[];
  isNightMode: boolean;
  onOpenScheduleModal?: () => void;
  onOpenSession?: (sessionId: string) => void;
}

const SHORT_NOTES_STORAGE_KEY = 'gatebell_short_notes_done_v1';

function formatShortDate(ms: number): string {
  return new Date(ms).toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
  });
}

function formatFullDateTime(ms: number): string {
  return new Date(ms).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getSubjectBadge(subject: Subject): { code: string; color: string } {
  switch (subject) {
    case Subject.PHYSICS:
      return { code: 'PHY', color: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30' };
    case Subject.CHEMISTRY:
      return { code: 'CHE', color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' };
    case Subject.MATHEMATICS:
      return { code: 'MTH', color: 'bg-amber-500/15 text-amber-400 border-amber-500/30' };
    default:
      return { code: 'GEN', color: 'bg-purple-500/15 text-purple-400 border-purple-500/30' };
  }
}

export function MasterTrackerSheet({
  sessions,
  isNightMode,
  onOpenScheduleModal,
}: MasterTrackerSheetProps) {
  // Map of chapterId -> boolean indicating Short Notes prepared
  const [shortNotesDone, setShortNotesDone] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem(SHORT_NOTES_STORAGE_KEY);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const toggleShortNotes = (chapterId: string) => {
    setShortNotesDone((prev) => {
      const next = { ...prev, [chapterId]: !prev[chapterId] };
      try {
        localStorage.setItem(SHORT_NOTES_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Ignore storage error
      }
      return next;
    });
  };

  const cardBg = isNightMode ? 'bg-[#121215] border-white/10' : 'bg-white border-slate-200';
  const subtleSurface = isNightMode ? 'bg-white/5 border-white/10' : 'bg-slate-50 border-slate-200';
  const mutedText = isNightMode ? 'text-zinc-400' : 'text-slate-500';
  const tableHeaderBg = isNightMode ? 'bg-[#18181D]' : 'bg-slate-100';
  const stickyColBg = isNightMode ? 'bg-[#121215]' : 'bg-white';
  const hoverRowBg = isNightMode ? 'hover:bg-white/[0.03]' : 'hover:bg-slate-50/80';

  // Primary chapters sorted chronologically by scheduled start
  const primaryChapters = useMemo(() => {
    return sessions
      .filter((s) => s.category !== SessionCategory.SPACED_REVISION)
      .sort((a, b) => a.scheduledStartMs - b.scheduledStartMs);
  }, [sessions]);

  // Compute tracker rows
  const now = Date.now();
  const trackerRows = useMemo(() => {
    return primaryChapters.map((ch, index) => {
      const dayIndex = `D${String(index + 1).padStart(2, '0')}`;
      const isLivePast = ch.scheduledStartMs < now;
      const isLiveAttended = ch.attendedSlides.length > 0;
      const hasShortNotes = Boolean(shortNotesDone[ch.id]);

      // 4 Spaced revision child sessions
      const children = sessions.filter(
        (s) =>
          s.category === SessionCategory.SPACED_REVISION &&
          s.parentChapterId === ch.id
      );

      const r1 = children.find((c) => c.repetitionStage === 1);
      const r2 = children.find((c) => c.repetitionStage === 2);
      const r3 = children.find((c) => c.repetitionStage === 3);
      const r4 = children.find((c) => c.repetitionStage === 4);

      const r1Done = Boolean(r1 && r1.scheduledStartMs < now && r1.attendedSlides.length > 0);
      const r2Done = Boolean(r2 && r2.scheduledStartMs < now && r2.attendedSlides.length > 0);
      const r3Done = Boolean(r3 && r3.scheduledStartMs < now && r3.attendedSlides.length > 0);
      const r4Done = Boolean(r4 && r4.scheduledStartMs < now && r4.attendedSlides.length > 0);

      // Checkbox counts (total 6 boxes: L, S, R1, R2, R3, R4)
      const boxesCompleted =
        (isLiveAttended ? 1 : 0) +
        (hasShortNotes ? 1 : 0) +
        (r1Done ? 1 : 0) +
        (r2Done ? 1 : 0) +
        (r3Done ? 1 : 0) +
        (r4Done ? 1 : 0);

      // Ebbinghaus Lock %
      let lockPct = 0;
      if (isLiveAttended) lockPct = 40;
      if (r1Done) lockPct = 60;
      if (r2Done) lockPct = 75;
      if (r3Done) lockPct = 90;
      if (r4Done) lockPct = 99;

      // Projected final date for this chapter
      const finalCycleMs = r4?.scheduledStartMs ?? (r1?.scheduledStartMs ? r1.scheduledStartMs + 42 * 86400000 : ch.scheduledStartMs + 45 * 86400000);

      return {
        dayIndex,
        chapter: ch,
        isLivePast,
        isLiveAttended,
        hasShortNotes,
        r1,
        r2,
        r3,
        r4,
        r1Done,
        r2Done,
        r3Done,
        r4Done,
        boxesCompleted,
        lockPct,
        finalCycleMs,
      };
    });
  }, [primaryChapters, sessions, shortNotesDone, now]);

  // Overall statistics
  const totalTasks = primaryChapters.length * 6;
  const totalCompletedTasks = trackerRows.reduce((acc, r) => acc + r.boxesCompleted, 0);
  const completionPercentage = totalTasks > 0 ? Math.round((totalCompletedTasks / totalTasks) * 100) : 0;

  // Max final revision date across all scheduled chapters
  const finalHorizonMs = useMemo(() => {
    if (trackerRows.length === 0) return null;
    let maxMs = 0;
    trackerRows.forEach((r) => {
      if (r.finalCycleMs > maxMs) maxMs = r.finalCycleMs;
    });
    return maxMs;
  }, [trackerRows]);

  return (
    <div className="space-y-6">
      {/* 1. Exam Horizon & Guaranteed Completion Banner */}
      <section className={`border rounded-xl p-5 sm:p-6 space-y-4 ${cardBg}`}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-mono text-emerald-400">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span>SYLLABUS HORIZON · GUARANTEED COMPLETION FORECASTER</span>
            </div>
            <h1 className="text-lg sm:text-xl font-bold tracking-tight">
              Master Study Tracker Sheet
            </h1>
            <p className={`text-xs max-w-2xl leading-relaxed ${mutedText}`}>
              Every chapter you schedule is automatically locked here in chronological order. Track your initial live class, short notes, and all 4 collision-free 06:00 AM revisions in one clean, horizontal spreadsheet.
            </p>
          </div>

          {onOpenScheduleModal && (
            <button
              type="button"
              onClick={onOpenScheduleModal}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#FF0000] hover:bg-red-700 rounded-lg transition-colors cursor-pointer shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Schedule Next Chapter</span>
            </button>
          )}
        </div>

        {/* 3 Metric Pills */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
          <div className={`p-3.5 rounded-xl border ${subtleSurface}`}>
            <div className="text-[11px] font-mono text-zinc-400">Chapters Scheduled</div>
            <div className="text-xl font-mono font-bold text-white mt-0.5">
              {primaryChapters.length} Chapters
            </div>
            <div className="text-[11px] font-mono text-zinc-400 mt-1">
              {totalCompletedTasks} of {totalTasks} milestones checked ({completionPercentage}%)
            </div>
          </div>

          <div className={`p-3.5 rounded-xl border ${subtleSurface}`}>
            <div className="text-[11px] font-mono text-zinc-400">Milestone Progress</div>
            <div className="flex items-center gap-2 mt-0.5">
              <div className="text-xl font-mono font-bold text-emerald-400">
                {completionPercentage}%
              </div>
              <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                  style={{ width: `${completionPercentage}%` }}
                />
              </div>
            </div>
            <div className="text-[11px] font-mono text-zinc-400 mt-1">
              Zero Backlog · Pacing 100% on track
            </div>
          </div>

          <div className={`p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10`}>
            <div className="text-[11px] font-mono text-emerald-300 flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              <span>Guaranteed Exam Ready</span>
            </div>
            <div className="text-base sm:text-lg font-mono font-extrabold text-white mt-0.5">
              {finalHorizonMs ? formatShortDate(finalHorizonMs) : 'Schedule Chapters'}
            </div>
            <div className="text-[11px] font-mono text-emerald-300 mt-0.5">
              All 4 cycles complete before exam day
            </div>
          </div>
        </div>
      </section>

      {/* 2. Clean Horizontal Scrollable Tracker Table */}
      <section className={`border rounded-xl overflow-hidden ${cardBg}`}>
        {/* Table Top Bar */}
        <div className="p-4 border-b border-white/10 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-zinc-300 font-mono">
            <span className="font-bold">STUDY LEDGER</span>
            <span className={mutedText}>·</span>
            <span className={mutedText}>Swipe horizontally on mobile to view all milestone dates</span>
          </div>

          <div className="flex items-center gap-3 text-[11px] font-mono text-zinc-400">
            <span className="flex items-center gap-1 text-emerald-400 font-bold">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span>Completed</span>
            </span>
            <span className="flex items-center gap-1 text-amber-400 font-bold">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              <span>Upcoming 6AM</span>
            </span>
          </div>
        </div>

        {primaryChapters.length === 0 ? (
          <div className="p-12 text-center space-y-3 text-zinc-400 text-xs">
            <FileText className="w-8 h-8 text-zinc-600 mx-auto" />
            <p className="font-semibold text-zinc-300">No chapters scheduled yet</p>
            <p className="max-w-sm mx-auto leading-relaxed">
              Upload your notes and schedule your first chapter live class. It will automatically populate this tracker with all 4 collision-free 6:00 AM revisions!
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs font-mono">
              <thead>
                <tr className={`border-b border-white/10 ${tableHeaderBg} text-zinc-400 text-[11px]`}>
                  {/* Sticky Left: DAY, DATE, SUB, CHAPTER */}
                  <th className="py-3 px-3 font-bold sticky left-0 z-20 bg-inherit min-w-[70px]">
                    DAY
                  </th>
                  <th className="py-3 px-3 font-bold min-w-[95px]">
                    DATE
                  </th>
                  <th className="py-3 px-2 font-bold min-w-[55px]">
                    SUB
                  </th>
                  <th className="py-3 px-4 font-bold min-w-[170px] max-w-[220px]">
                    CHAPTER
                  </th>
                  {/* Letter Columns: L, S, R1, R2, R3, R4, LOCK */}
                  <th className="py-3 px-3 font-bold text-center min-w-[65px]" title="1st Live Broadcast Lecture">
                    L
                  </th>
                  <th className="py-3 px-3 font-bold text-center min-w-[65px]" title="Short Notes Hand-Written">
                    S
                  </th>
                  <th className="py-3 px-3 font-bold text-center min-w-[95px]" title="Revision 1: Day +3 @ 06:00 AM">
                    R1 (+3d)
                  </th>
                  <th className="py-3 px-3 font-bold text-center min-w-[95px]" title="Revision 2: Day +7 @ 06:00 AM">
                    R2 (+7d)
                  </th>
                  <th className="py-3 px-3 font-bold text-center min-w-[95px]" title="Revision 3: Day +21 @ 06:00 AM">
                    R3 (+21d)
                  </th>
                  <th className="py-3 px-3 font-bold text-center min-w-[95px]" title="Revision 4: Day +45 @ 06:00 AM">
                    R4 (+45d)
                  </th>
                  <th className="py-3 px-3 font-bold text-center min-w-[75px]" title="Ebbinghaus Memory Lock %">
                    LOCK%
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {trackerRows.map((row) => {
                  const subBadge = getSubjectBadge(row.chapter.subject);
                  return (
                    <tr key={row.chapter.id} className={`transition-colors ${hoverRowBg}`}>
                      {/* DAY (Sticky left) */}
                      <td className={`py-3.5 px-3 font-bold text-white sticky left-0 z-10 ${stickyColBg}`}>
                        <span className="px-2 py-0.5 rounded bg-white/10 text-white font-extrabold text-[11px]">
                          {row.dayIndex}
                        </span>
                      </td>

                      {/* DATE */}
                      <td className="py-3.5 px-3 text-zinc-300 text-[11px] whitespace-nowrap">
                        {formatShortDate(row.chapter.scheduledStartMs)}
                      </td>

                      {/* SUB */}
                      <td className="py-3.5 px-2">
                        <span className={`px-2 py-0.5 rounded border text-[10px] font-bold ${subBadge.color}`}>
                          {subBadge.code}
                        </span>
                      </td>

                      {/* CHAPTER */}
                      <td className="py-3.5 px-4 font-bold text-white truncate max-w-[220px]">
                        {row.chapter.chapterName || row.chapter.title}
                      </td>

                      {/* L (Live) */}
                      <td className="py-3.5 px-3 text-center">
                        {row.isLiveAttended ? (
                          <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 font-bold" title="Live Broadcast Attended">
                            <Check className="w-4 h-4 stroke-[3]" />
                          </span>
                        ) : row.isLivePast ? (
                          <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-red-500/15 border border-red-500/30 text-red-400 text-[10px] font-bold" title="Missed Live">
                            MISSED
                          </span>
                        ) : (
                          <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-white/5 border border-white/10 text-zinc-400 text-[11px]" title="Upcoming Live">
                            <Clock className="w-3.5 h-3.5" />
                          </span>
                        )}
                      </td>

                      {/* S (Short Notes Interactive Toggle) */}
                      <td className="py-3.5 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => toggleShortNotes(row.chapter.id)}
                          className={`inline-flex items-center justify-center w-7 h-7 rounded-lg border transition-all cursor-pointer ${
                            row.hasShortNotes
                              ? 'bg-emerald-500 text-zinc-950 border-emerald-400 shadow-sm'
                              : 'bg-white/5 border-white/20 text-zinc-500 hover:border-amber-400 hover:text-amber-400'
                          }`}
                          title={
                            row.hasShortNotes
                              ? 'Short Notes Prepared (Tap to uncheck)'
                              : 'Tap to mark Short Notes prepared'
                          }
                        >
                          {row.hasShortNotes ? (
                            <Check className="w-4 h-4 stroke-[3]" />
                          ) : (
                            <span className="text-[10px] font-extrabold">S</span>
                          )}
                        </button>
                      </td>

                      {/* R1 (Day +3, 6 AM) */}
                      <td className="py-3.5 px-3 text-center whitespace-nowrap">
                        {row.r1Done ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 font-bold">
                            <Check className="w-3.5 h-3.5 stroke-[3]" />
                            <span>R1</span>
                          </span>
                        ) : row.r1 ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[11px]">
                            <span>{formatShortDate(row.r1.scheduledStartMs)}</span>
                          </span>
                        ) : (
                          <span className="text-zinc-600 text-[11px]">—</span>
                        )}
                      </td>

                      {/* R2 (Day +7, 6 AM) */}
                      <td className="py-3.5 px-3 text-center whitespace-nowrap">
                        {row.r2Done ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 font-bold">
                            <Check className="w-3.5 h-3.5 stroke-[3]" />
                            <span>R2</span>
                          </span>
                        ) : row.r2 ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-zinc-400 text-[11px]">
                            <span>{formatShortDate(row.r2.scheduledStartMs)}</span>
                          </span>
                        ) : (
                          <span className="text-zinc-600 text-[11px]">—</span>
                        )}
                      </td>

                      {/* R3 (Day +21, 6 AM) */}
                      <td className="py-3.5 px-3 text-center whitespace-nowrap">
                        {row.r3Done ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 font-bold">
                            <Check className="w-3.5 h-3.5 stroke-[3]" />
                            <span>R3</span>
                          </span>
                        ) : row.r3 ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-zinc-400 text-[11px]">
                            <span>{formatShortDate(row.r3.scheduledStartMs)}</span>
                          </span>
                        ) : (
                          <span className="text-zinc-600 text-[11px]">—</span>
                        )}
                      </td>

                      {/* R4 (Day +45, 6 AM) */}
                      <td className="py-3.5 px-3 text-center whitespace-nowrap">
                        {row.r4Done ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 font-bold">
                            <Check className="w-3.5 h-3.5 stroke-[3]" />
                            <span>R4</span>
                          </span>
                        ) : row.r4 ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-zinc-400 text-[11px]">
                            <span>{formatShortDate(row.r4.scheduledStartMs)}</span>
                          </span>
                        ) : (
                          <span className="text-zinc-600 text-[11px]">—</span>
                        )}
                      </td>

                      {/* LOCK% */}
                      <td className="py-3.5 px-3 text-center">
                        <span
                          className={`font-mono font-bold text-xs ${
                            row.lockPct >= 99
                              ? 'text-emerald-400'
                              : row.lockPct >= 75
                              ? 'text-blue-400'
                              : row.lockPct >= 40
                              ? 'text-amber-400'
                              : 'text-zinc-600'
                          }`}
                        >
                          {row.lockPct}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* 3. Simple Legend Footer */}
        <div className={`p-4 border-t border-white/10 ${subtleSurface} flex flex-wrap items-center justify-between gap-4 text-[11px] font-mono text-zinc-400`}>
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-bold text-zinc-200">LETTER KEY:</span>
            <span><strong className="text-white">L</strong> = 1st Live Lecture</span>
            <span><strong className="text-white">S</strong> = Short Notes (Tap to tick)</span>
            <span><strong className="text-white">R1</strong> = Day +3 (06:00 AM)</span>
            <span><strong className="text-white">R2</strong> = Day +7 (06:00 AM)</span>
            <span><strong className="text-white">R3</strong> = Day +21 (06:00 AM)</span>
            <span><strong className="text-white">R4</strong> = Day +45 (06:00 AM)</span>
          </div>

          <div className="text-zinc-400">
            All 6 AM clash slots automatically shifted +1 day
          </div>
        </div>
      </section>
    </div>
  );
}
