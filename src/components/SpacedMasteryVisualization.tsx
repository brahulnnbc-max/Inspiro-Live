import React, { useState } from 'react';
import {
  Brain,
  CheckCircle2,
  ChevronRight,
  Clock,
  Flame,
  Info,
  Lock,
  Sparkles,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { LiveSession, SessionCategory } from '../types';
import { SPACED_REPETITION_STAGES } from '../lib/spacedRepetition';

interface SpacedMasteryVisualizationProps {
  sessions: LiveSession[];
  isNightMode: boolean;
  onOpenSession?: (sessionId: string) => void;
}

export function SpacedMasteryVisualization({
  sessions,
  isNightMode,
}: SpacedMasteryVisualizationProps) {
  const [activeTab, setActiveTab] = useState<'RETENTION' | 'SPEED_BENCHMARK'>('RETENTION');

  const cardBg = isNightMode ? 'bg-[#121215] border-white/10' : 'bg-white border-slate-200';
  const subtleSurface = isNightMode ? 'bg-white/5 border-white/10' : 'bg-slate-50 border-slate-200';
  const mutedText = isNightMode ? 'text-zinc-400' : 'text-slate-500';

  // Find all primary chapters and their 6 AM spaced revision children
  const primaryChapters = sessions.filter(
    (s) => s.category !== SessionCategory.SPACED_REVISION
  );

  const chaptersMastery = primaryChapters.map((ch) => {
    const children = sessions.filter(
      (s) =>
        s.category === SessionCategory.SPACED_REVISION &&
        s.parentChapterId === ch.id
    );

    // Completed stages: past schedule time where user attended
    const now = Date.now();
    const stages = [1, 2, 3, 4].map((stageNum) => {
      const stageSession = children.find((c) => c.repetitionStage === stageNum);
      const isPast = stageSession ? stageSession.scheduledStartMs < now : false;
      const isAttended = stageSession ? stageSession.attendedSlides.length > 0 : false;
      const isUpcoming = stageSession ? stageSession.scheduledStartMs >= now : false;
      return {
        stageNum,
        session: stageSession,
        isPast,
        isAttended,
        isUpcoming,
      };
    });

    const attendedCount = stages.filter((s) => s.isPast && s.isAttended).length;
    let retentionScore = 40; // initial after attending live
    if (attendedCount === 1) retentionScore = 60;
    else if (attendedCount === 2) retentionScore = 75;
    else if (attendedCount === 3) retentionScore = 90;
    else if (attendedCount >= 4) retentionScore = 99;

    const nextUpcoming = stages.find((s) => s.isUpcoming && s.session);

    return {
      chapter: ch,
      children,
      stages,
      attendedCount,
      retentionScore,
      nextUpcoming,
    };
  });

  return (
    <div className={`border rounded-xl p-5 sm:p-6 space-y-6 ${cardBg}`}>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-4 border-white/10">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-mono text-[#FF0000]">
            <Brain className="w-4 h-4 shrink-0" />
            <span>NEURAL RETENTION & MASTERY BENCHMARK</span>
          </div>
          <h2 className="text-base sm:text-lg font-bold tracking-tight">
            Ebbinghaus Spaced Repetition Mastery
          </h2>
          <p className={`text-xs max-w-2xl leading-relaxed ${mutedText}`}>
            Scientific forgetting-curve consolidation: with each 06:00 AM pass (+3d, +7d, +21d, +45d), neural retrieval speed accelerates while memory retention climbs toward a permanent 99% exam lock.
          </p>
        </div>

        {/* Tab switch */}
        <div className={`flex items-center p-1 rounded-lg border text-xs font-semibold ${subtleSurface}`}>
          <button
            type="button"
            onClick={() => setActiveTab('RETENTION')}
            className={`px-3 py-1.5 rounded-md transition-colors cursor-pointer ${
              activeTab === 'RETENTION'
                ? 'bg-[#FF0000] text-white shadow-sm'
                : mutedText + ' hover:text-white'
            }`}
          >
            Retention Curve
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('SPEED_BENCHMARK')}
            className={`px-3 py-1.5 rounded-md transition-colors cursor-pointer ${
              activeTab === 'SPEED_BENCHMARK'
                ? 'bg-[#FF0000] text-white shadow-sm'
                : mutedText + ' hover:text-white'
            }`}
          >
            Speed Acceleration
          </button>
        </div>
      </div>

      {/* VIEW 1: EBBINGHAUS RETENTION CURVE & STAGE GAUGES */}
      {activeTab === 'RETENTION' && (
        <div className="space-y-6">
          {/* 4 Ebbinghaus Stages Indicator */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              {
                stage: 1,
                interval: '+3 Days',
                pct: '60%',
                label: 'Cycle 1 · Neural Catch',
                desc: 'First forgetting-curve intercept before memory decays below 50%.',
                color: 'text-amber-400',
                border: 'border-amber-500/30',
                bg: 'bg-amber-500/10',
              },
              {
                stage: 2,
                interval: '+7 Days',
                pct: '75%',
                label: 'Cycle 2 · Synaptic Bridge',
                desc: 'Weekly reconsolidation. Formulas migrate toward long-term storage.',
                color: 'text-blue-400',
                border: 'border-blue-500/30',
                bg: 'bg-blue-500/10',
              },
              {
                stage: 3,
                interval: '+21 Days',
                pct: '90%',
                label: 'Cycle 3 · Memory Lock',
                desc: 'Deep structural retention. Recognition is near-instantaneous.',
                color: 'text-purple-400',
                border: 'border-purple-500/30',
                bg: 'bg-purple-500/10',
              },
              {
                stage: 4,
                interval: '+45 Days',
                pct: '99%',
                label: 'Cycle 4 · Permanent Exam Lock',
                desc: 'Permanent synaptic consolidation. Pre-exam flash speed mastery.',
                color: 'text-emerald-400',
                border: 'border-emerald-500/30',
                bg: 'bg-emerald-500/10',
              },
            ].map((st) => (
              <div
                key={st.stage}
                className={`p-3.5 rounded-xl border flex flex-col justify-between ${subtleSurface} ${st.border}`}
              >
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] font-mono">
                    <span className="font-bold text-white">{st.interval}</span>
                    <span className={`font-extrabold ${st.color}`}>{st.pct} Lock</span>
                  </div>
                  <div className="text-xs font-bold text-zinc-100">{st.label}</div>
                  <div className={`text-[11px] leading-relaxed ${mutedText}`}>{st.desc}</div>
                </div>

                <div className="mt-3 pt-2 border-t border-white/5 flex items-center justify-between text-[10px] font-mono">
                  <span className={mutedText}>06:00 AM Slot</span>
                  <span className="text-zinc-300">Stage {st.stage}/4</span>
                </div>
              </div>
            ))}
          </div>

          {/* SVG Forgetting Curve Diagram */}
          <div className={`p-4 rounded-xl border ${subtleSurface} space-y-3`}>
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="font-semibold text-zinc-300 flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4 text-emerald-400" />
                <span>Memory Retention: Without Repetition vs. inspiro 6:00 AM Protocol</span>
              </span>
              <span className="text-[11px] text-zinc-400">Ebbinghaus Curve</span>
            </div>

            <div className="relative h-28 w-full">
              <svg
                viewBox="0 0 600 120"
                className="w-full h-full overflow-visible"
                preserveAspectRatio="none"
              >
                {/* Grid lines */}
                <line x1="0" y1="10" x2="600" y2="10" stroke="rgba(255,255,255,0.06)" strokeDasharray="4 4" />
                <line x1="0" y1="45" x2="600" y2="45" stroke="rgba(255,255,255,0.06)" strokeDasharray="4 4" />
                <line x1="0" y1="80" x2="600" y2="80" stroke="rgba(255,255,255,0.06)" strokeDasharray="4 4" />
                <line x1="0" y1="110" x2="600" y2="110" stroke="rgba(255,255,255,0.15)" />

                {/* Without repetition decay curve (Red dash) */}
                <path
                  d="M 10 15 Q 120 100, 580 112"
                  fill="none"
                  stroke="#EF4444"
                  strokeWidth="2.5"
                  strokeDasharray="5 5"
                />

                {/* With inspiro 4-Cycle 6 AM Revisions (Green step line) */}
                {/* Day 0 -> Day 3 decay to 50, jump to 60 */}
                <path
                  d="M 10 15 Q 70 65, 120 65 L 120 45 Q 180 55, 240 55 L 240 30 Q 340 35, 420 35 L 420 18 L 590 14"
                  fill="none"
                  stroke="#10B981"
                  strokeWidth="3"
                />

                {/* Milestone nodes */}
                <circle cx="10" cy="15" r="4.5" fill="#FFFFFF" />
                <circle cx="120" cy="45" r="4.5" fill="#F59E0B" />
                <circle cx="240" cy="30" r="4.5" fill="#3B82F6" />
                <circle cx="420" cy="18" r="4.5" fill="#A855F7" />
                <circle cx="590" cy="14" r="5" fill="#10B981" />
              </svg>

              {/* Labels on SVG */}
              <div className="flex justify-between text-[10px] font-mono text-zinc-400 mt-1 px-1">
                <span>Day 0 (Live)</span>
                <span className="text-amber-400 font-bold">Day +3 (60%)</span>
                <span className="text-blue-400 font-bold">Day +7 (75%)</span>
                <span className="text-purple-400 font-bold">Day +21 (90%)</span>
                <span className="text-emerald-400 font-bold">Day +45 (99% Lock)</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between text-[11px] font-mono pt-2 border-t border-white/5">
              <span className="text-red-400 flex items-center gap-1">
                <span className="inline-block w-2 h-0.5 bg-red-500" />
                <span>Standard Human Decay (~15% retention after 30 days)</span>
              </span>
              <span className="text-emerald-400 flex items-center gap-1 font-semibold">
                <span className="inline-block w-2.5 h-1 rounded-sm bg-emerald-500" />
                <span>inspiro LIVE Protocol (99% permanent synaptic consolidation)</span>
              </span>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 2: READ-SPEED ACCELERATION BENCHMARK */}
      {activeTab === 'SPEED_BENCHMARK' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {[
              {
                title: 'Initial Read',
                sec: '50s',
                sub: 'First Live Broadcast',
                speed: '1.0x Baseline',
                badge: 'Full Comprehension',
                color: 'text-zinc-300',
              },
              {
                title: 'Day +3 Revision',
                sec: '30s',
                sub: '60% Time Compression',
                speed: '1.7x Recall',
                badge: 'First Intercept',
                color: 'text-amber-400',
              },
              {
                title: 'Day +7 Revision',
                sec: '22s',
                sub: '44% Time Compression',
                speed: '2.3x Recall',
                badge: 'Synaptic Bridge',
                color: 'text-blue-400',
              },
              {
                title: 'Day +21 Revision',
                sec: '15s',
                sub: '30% Time Compression',
                speed: '3.3x Recall',
                badge: 'Long-Term Storage',
                color: 'text-purple-400',
              },
              {
                title: 'Day +45 Revision',
                sec: '10s',
                sub: '20% Time Compression',
                speed: '5.0x Flash Retrieval',
                badge: 'Exam Speed Demon',
                color: 'text-emerald-400',
              },
            ].map((b, idx) => (
              <div
                key={idx}
                className={`p-3.5 rounded-xl border flex flex-col justify-between ${subtleSurface}`}
              >
                <div>
                  <div className="text-[11px] font-mono text-zinc-400">{b.title}</div>
                  <div className="text-xl font-mono font-extrabold text-white mt-1">
                    {b.sec} <span className="text-xs font-normal text-zinc-400">/ slide</span>
                  </div>
                  <div className={`text-xs font-bold mt-1 ${b.color}`}>{b.speed}</div>
                </div>

                <div className="mt-3 pt-2 border-t border-white/5 text-[10px] font-mono text-zinc-400">
                  {b.badge}
                </div>
              </div>
            ))}
          </div>

          <div className={`p-4 rounded-xl border text-xs leading-relaxed ${subtleSurface} text-zinc-300 space-y-1`}>
            <div className="font-bold text-white flex items-center gap-1.5">
              <Zap className="w-4 h-4 text-amber-400" />
              <span>Why slide duration reduces scientifically:</span>
            </div>
            <p className={mutedText}>
              In your first read, your brain encodes the structure and logic (50s/slide). By Day +7, synaptic pathways are already formed, requiring only 22s for neural recognition. By Day +45, 10s per slide triggers instantaneous pre-exam flash retrieval—saving hours of study time while cementing 99% retention.
            </p>
          </div>
        </div>
      )}

      {/* CHAPTER MASTERY MATRIX */}
      {chaptersMastery.length > 0 && (
        <div className="space-y-3 pt-2 border-t border-white/10">
          <div className="flex items-center justify-between text-xs font-mono text-zinc-300">
            <span className="font-bold flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>Active Chapters in 6:00 AM Mastery Pipeline ({chaptersMastery.length})</span>
            </span>
            <span className="text-[11px] text-zinc-400">06:00 AM Sharp</span>
          </div>

          <div className="space-y-2">
            {chaptersMastery.map(({ chapter, stages, retentionScore, nextUpcoming }) => (
              <div
                key={chapter.id}
                className={`p-3.5 rounded-xl border flex flex-col md:flex-row md:items-center justify-between gap-4 ${subtleSurface}`}
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-white truncate">
                      {chapter.chapterName || chapter.title}
                    </span>
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-white/10 text-zinc-300">
                      {chapter.subject}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-xs font-mono">
                    <span className="text-emerald-400 font-semibold flex items-center gap-1">
                      <Flame className="w-3.5 h-3.5 fill-current" />
                      <span>{retentionScore}% Neural Retention</span>
                    </span>
                    {nextUpcoming ? (
                      <span className="text-amber-400 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        <span>Next: Cycle {nextUpcoming.stageNum} (+{nextUpcoming.session?.repetitionIntervalDays}d)</span>
                      </span>
                    ) : (
                      <span className="text-zinc-400 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                        <span>All 4 Ebbinghaus Cycles Locked</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* 4 Stage Stepper */}
                <div className="flex items-center gap-2 shrink-0">
                  {[1, 2, 3, 4].map((num) => {
                    const st = stages.find((s) => s.stageNum === num);
                    const isCompleted = Boolean(st?.isPast && st?.isAttended);
                    const isQueued = Boolean(st?.isUpcoming);
                    return (
                      <div
                        key={num}
                        className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-mono ${
                          isCompleted
                            ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400 font-bold'
                            : isQueued
                            ? 'bg-amber-500/15 border-amber-500/40 text-amber-400 font-semibold'
                            : 'bg-white/5 border-white/10 text-zinc-500'
                        }`}
                        title={`Cycle ${num}: ${SPACED_REPETITION_STAGES[num - 1]?.label}`}
                      >
                        {isCompleted ? (
                          <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                        ) : isQueued ? (
                          <Clock className="w-3 h-3 text-amber-400 shrink-0" />
                        ) : (
                          <Lock className="w-3 h-3 text-zinc-500 shrink-0" />
                        )}
                        <span>R{num}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
