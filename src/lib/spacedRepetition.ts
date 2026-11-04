import { LiveSession, SessionCategory, SlideDescriptor } from '../types';

export const FIXED_MORNING_REVISION_HOUR = 6; // 06:00 AM sharp daily slot
export const FIXED_MORNING_REVISION_MINUTE = 0;

export interface SpacedStageSpec {
  stage: number;
  intervalDays: number;
  label: string;
  scienceSummary: string;
  timeRatio: number;
  minSecondsPerSlide: number;
  emergencySeconds: number;
}

/**
 * Ebbinghaus Forgetting Curve Intervals + Retrieval Acceleration:
 * Each subsequent pass occurs just before memory decay and uses scientifically
 * compressed slide duration because neural recognition & formula retrieval speed up.
 */
export const SPACED_REPETITION_STAGES: SpacedStageSpec[] = [
  {
    stage: 1,
    intervalDays: 3,
    label: 'Day +3 · Cycle 1',
    scienceSummary: 'First forgetting-curve intercept (60% of initial time)',
    timeRatio: 0.6,
    minSecondsPerSlide: 18,
    emergencySeconds: 25,
  },
  {
    stage: 2,
    intervalDays: 7,
    label: 'Day +7 · Cycle 2',
    scienceSummary: 'Weekly synaptic consolidation (44% of initial time)',
    timeRatio: 0.44,
    minSecondsPerSlide: 14,
    emergencySeconds: 20,
  },
  {
    stage: 3,
    intervalDays: 21,
    label: 'Day +21 · Cycle 3',
    scienceSummary: 'Long-term memory lock (30% of initial time)',
    timeRatio: 0.3,
    minSecondsPerSlide: 10,
    emergencySeconds: 15,
  },
  {
    stage: 4,
    intervalDays: 45,
    label: 'Day +45 · Cycle 4',
    scienceSummary: 'Pre-exam rapid flash retrieval (20% of initial time)',
    timeRatio: 0.2,
    minSecondsPerSlide: 8,
    emergencySeconds: 12,
  },
];

function computeMorning6AmTimestamp(anchorMs: number, daysAhead: number): number {
  const d = new Date(anchorMs);
  d.setDate(d.getDate() + daysAhead);
  d.setHours(FIXED_MORNING_REVISION_HOUR, FIXED_MORNING_REVISION_MINUTE, 0, 0);
  return d.getTime();
}

function resolveNonOverlappingMorningSlot(
  desiredStartMs: number,
  estimatedBaseRunMs: number,
  occupiedWindows: Array<{ startMs: number; endMs: number }>
): number {
  let candidateStart = desiredStartMs;
  const sorted = [...occupiedWindows].sort((a, b) => a.startMs - b.startMs);

  let shifted = true;
  let guard = 0;
  while (shifted && guard < 100) {
    shifted = false;
    guard += 1;
    for (const win of sorted) {
      const candidateEnd = candidateStart + estimatedBaseRunMs;
      const overlaps = candidateStart < win.endMs && candidateEnd > win.startMs;
      if (overlaps) {
        // Queue cleanly 5 minutes after the earlier 6:00 AM morning class finishes
        candidateStart = win.endMs + 5 * 60 * 1000;
        shifted = true;
      }
    }
  }
  return candidateStart;
}

/**
 * Generates the automatic 06:00 AM Spaced Repetition live sessions (+3d, +7d, +21d, +45d)
 * with scientifically reduced per-slide times, plus an automatic Day +3 & Day +7 Morning Doubt
 * Re-Telecast when the chapter has flagged doubts.
 */
export function buildSpacedRepetitionSessionsForChapter(
  sourceSession: LiveSession,
  existingSessions: LiveSession[],
  completedAtMs: number
): LiveSession[] {
  const occupiedWindows: Array<{ startMs: number; endMs: number }> = existingSessions
    .filter((s) => s.category === SessionCategory.SPACED_REVISION)
    .map((s) => ({
      startMs: s.scheduledStartMs,
      endMs: s.scheduledStartMs + s.slides.length * s.baseSecondsPerSlide * 1000,
    }));

  const initialBaseSec = Math.max(30, sourceSession.baseSecondsPerSlide || 50);
  const chapterName = sourceSession.chapterName || sourceSession.title;
  const created: LiveSession[] = [];
  const now = Date.now();

  for (const spec of SPACED_REPETITION_STAGES) {
    const reducedSec = Math.max(
      spec.minSecondsPerSlide,
      Math.round(initialBaseSec * spec.timeRatio)
    );
    const emergSec = spec.emergencySeconds;

    const rawMorningMs = computeMorning6AmTimestamp(
      completedAtMs,
      spec.intervalDays
    );
    const baseRunMs = sourceSession.slides.length * reducedSec * 1000;
    const finalStartMs = resolveNonOverlappingMorningSlot(
      rawMorningMs,
      baseRunMs,
      occupiedWindows
    );
    const hardCloseMs =
      finalStartMs + sourceSession.slides.length * (reducedSec + emergSec) * 1000;

    occupiedWindows.push({
      startMs: finalStartMs,
      endMs: finalStartMs + baseRunMs,
    });

    const spacedSession: LiveSession = {
      id: `spaced_${sourceSession.id}_r${spec.stage}_${now}`,
      title: chapterName,
      subject: sourceSession.subject,
      chapterName,
      scheduledStartMs: finalStartMs,
      baseSecondsPerSlide: reducedSec,
      emergencySecondsPerSlide: emergSec,
      hardCloseMs,
      defaultOrientation: sourceSession.defaultOrientation,
      slides: sourceSession.slides,
      lockedAtMs: now,
      category: SessionCategory.SPACED_REVISION,
      parentChapterId: sourceSession.id,
      repetitionStage: spec.stage,
      repetitionIntervalDays: spec.intervalDays,
      emergencyUsedBySlide: {},
      attendedSlides: [],
      lateMissedSlides: [],
      starredSlideIndices: [],
      presenceChecksPassed: 0,
      presenceChecksMissed: 0,
      tabSwitchCount: 0,
      recordedReplaysCount: 0,
    };

    created.push(spacedSession);
  }

  // Idea #4: If the chapter also had flagged Doubts, auto-schedule Day +3 & Day +7 Doubt Live Re-Telecasts in the 6 AM slot!
  if (sourceSession.starredSlideIndices.length > 0) {
    const sortedIndices = [...sourceSession.starredSlideIndices].sort(
      (a, b) => a - b
    );
    const doubtSlides: SlideDescriptor[] = [];
    sortedIndices.forEach((origIdx) => {
      const sl = sourceSession.slides[origIdx];
      if (sl) {
        doubtSlides.push({
          ...sl,
          index: doubtSlides.length,
          originalSlideIndex: origIdx,
        });
      }
    });

    if (doubtSlides.length > 0) {
      for (const [idx, days] of [3, 7].entries()) {
        const doubtSec = idx === 0 ? 35 : 25;
        const emergSec = 25;
        const rawMorningMs = computeMorning6AmTimestamp(completedAtMs, days);
        const baseRunMs = doubtSlides.length * doubtSec * 1000;
        const finalStartMs = resolveNonOverlappingMorningSlot(
          rawMorningMs,
          baseRunMs,
          occupiedWindows
        );
        occupiedWindows.push({
          startMs: finalStartMs,
          endMs: finalStartMs + baseRunMs,
        });

        created.push({
          id: `spaced_doubt_${sourceSession.id}_d${days}_${now}`,
          title: `${chapterName} · Doubts`,
          subject: sourceSession.subject,
          chapterName,
          scheduledStartMs: finalStartMs,
          baseSecondsPerSlide: doubtSec,
          emergencySecondsPerSlide: emergSec,
          hardCloseMs:
            finalStartMs + doubtSlides.length * (doubtSec + emergSec) * 1000,
          defaultOrientation: sourceSession.defaultOrientation,
          slides: doubtSlides,
          lockedAtMs: now,
          category: SessionCategory.SPACED_REVISION,
          parentChapterId: sourceSession.id,
          repetitionStage: idx + 1,
          repetitionIntervalDays: days,
          isDoubtTelecast: true,
          emergencyUsedBySlide: {},
          attendedSlides: [],
          lateMissedSlides: [],
          starredSlideIndices: [],
          presenceChecksPassed: 0,
          presenceChecksMissed: 0,
          tabSwitchCount: 0,
          recordedReplaysCount: 0,
        });
      }
    }
  }

  return created;
}
