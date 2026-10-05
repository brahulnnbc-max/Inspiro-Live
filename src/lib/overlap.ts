import type { JEEClass, OverlapResult } from '../types/class.ts';
import { formatISTDateTime } from './istTime.ts';

/**
 * Validates whether a candidate class window [start, start + duration]
 * overlaps with any existing classes in the timetable.
 */
export function checkScheduleOverlap(
  candidate: {
    start_at: string;
    duration_min: number;
    id?: string;
  },
  existingClasses: JEEClass[]
): OverlapResult {
  const candidateStart = new Date(candidate.start_at).getTime();
  if (isNaN(candidateStart)) {
    return { hasOverlap: false };
  }

  const candidateEnd = candidateStart + candidate.duration_min * 60 * 1000;

  for (const existing of existingClasses) {
    // If editing, skip comparing with self
    if (candidate.id && existing.id === candidate.id) {
      continue;
    }

    const existingStart = new Date(existing.start_at).getTime();
    const existingEnd = existingStart + existing.duration_min * 60 * 1000;

    // Overlap condition: startA < endB AND startB < endA
    const isOverlapping = candidateStart < existingEnd && existingStart < candidateEnd;

    if (isOverlapping) {
      const conflictStartIST = formatISTDateTime(existing.start_at);
      return {
        hasOverlap: true,
        conflictingClass: existing,
        message: `Schedule conflict with "${existing.title}" (${existing.subject}), scheduled at ${conflictStartIST} for ${existing.duration_min} mins.`,
      };
    }
  }

  return { hasOverlap: false };
}
