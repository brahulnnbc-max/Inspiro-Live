import type { ClassStatus } from '../types/class.ts';

export const IST_OFFSET_MINUTES = 330; // 5 hours 30 mins

/**
 * Returns the current time formatted in IST.
 */
export function getCurrentISTDate(): Date {
  return new Date();
}

/**
 * Converts a standard Date or ISO string into an IST formatted string.
 */
export function formatISTDateTime(isoString: string): string {
  const d = new Date(isoString);
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'short',
    hour12: true,
  }).format(d);
}

/**
 * Formats just the time in IST (e.g., "04:30 PM IST")
 */
export function formatISTTime(isoString: string): string {
  const d = new Date(isoString);
  const formatted = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: 'numeric',
    minute: 'numeric',
    hour12: true,
  }).format(d);
  return `${formatted} IST`;
}

/**
 * Formats date label in IST (e.g., "Today, 14 Oct" or "Tomorrow" or "Wed, 15 Oct")
 */
export function formatISTDayLabel(isoString: string): string {
  const targetDate = new Date(isoString);
  const now = new Date();

  const toISTDateString = (date: Date) =>
    new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);

  const targetIST = toISTDateString(targetDate);
  const nowIST = toISTDateString(now);

  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const tomorrowIST = toISTDateString(tomorrow);

  if (targetIST === nowIST) return 'Today';
  if (targetIST === tomorrowIST) return 'Tomorrow';

  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(targetDate);
}

/**
 * Computes the live playback status and exact wall-clock offset in seconds.
 */
export function getLiveClockStatus(
  startAtIso: string,
  durationMin: number
): {
  status: ClassStatus;
  elapsedSeconds: number;
  durationSeconds: number;
  remainingSeconds: number;
  progressPercent: number;
} {
  const startTime = new Date(startAtIso).getTime();
  const now = Date.now();
  const durationSeconds = durationMin * 60;
  const elapsedSeconds = Math.floor((now - startTime) / 1000);

  if (elapsedSeconds < 0) {
    return {
      status: 'upcoming',
      elapsedSeconds: 0,
      durationSeconds,
      remainingSeconds: Math.abs(elapsedSeconds),
      progressPercent: 0,
    };
  }

  if (elapsedSeconds <= durationSeconds) {
    const remaining = Math.max(0, durationSeconds - elapsedSeconds);
    const progressPercent = Math.min(100, Math.max(0, (elapsedSeconds / durationSeconds) * 100));
    return {
      status: 'live',
      elapsedSeconds,
      durationSeconds,
      remainingSeconds: remaining,
      progressPercent,
    };
  }

  return {
    status: 'ended',
    elapsedSeconds: durationSeconds,
    durationSeconds,
    remainingSeconds: 0,
    progressPercent: 100,
  };
}

/**
 * Formats a duration in seconds into HH:MM:SS or MM:SS
 */
export function formatDurationHMS(totalSeconds: number): string {
  const sec = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(sec / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  const seconds = sec % 60;

  const pad = (n: number) => n.toString().padStart(2, '0');

  if (hours > 0) {
    return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${pad(minutes)}:${pad(seconds)}`;
}

/**
 * Formats countdown for upcoming classes (e.g., "02h 15m 30s")
 */
export function formatCountdownString(totalSeconds: number): string {
  const sec = Math.max(0, Math.floor(totalSeconds));
  const days = Math.floor(sec / 86400);
  const hours = Math.floor((sec % 86400) / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  const seconds = sec % 60;

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes.toString().padStart(2, '0')}m ${seconds.toString().padStart(2, '0')}s`;
  }
  return `${minutes.toString().padStart(2, '0')}m ${seconds.toString().padStart(2, '0')}s`;
}
