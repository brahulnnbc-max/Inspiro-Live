// Streak & Daily Commitment Tracker for JEE Aspirants
const STREAK_KEY = 'inspiro_student_streak_v1';

export interface StreakData {
  currentStreak: number;
  longestStreak: number;
  lastActiveDate: string; // YYYY-MM-DD
  todayMinutes: number;
  dailyGoalMinutes: number; // default 300 (5 hours)
  historyDays: { date: string; dayLetter: string; completed: boolean; minutes: number }[];
}

function getTodayKey(): string {
  return new Date().toISOString().split('T')[0];
}

export function getStreakData(): StreakData {
  if (typeof window === 'undefined') {
    return {
      currentStreak: 5,
      longestStreak: 12,
      lastActiveDate: getTodayKey(),
      todayMinutes: 180,
      dailyGoalMinutes: 300,
      historyDays: [],
    };
  }

  const today = getTodayKey();
  let data: StreakData | null = null;

  try {
    const raw = localStorage.getItem(STREAK_KEY);
    if (raw) data = JSON.parse(raw);
  } catch (e) {
    // Ignore
  }

  if (!data) {
    // Initial sensible baseline for serious aspirants
    data = {
      currentStreak: 6,
      longestStreak: 14,
      lastActiveDate: today,
      todayMinutes: 195,
      dailyGoalMinutes: 300,
      historyDays: [],
    };
  }

  // Generate last 7 days history
  const history: StreakData['historyDays'] = [];
  const dayNames = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const key = d.toISOString().split('T')[0];
    const letter = dayNames[d.getDay()];
    // Mark as completed if in streak
    const completed = i < data.currentStreak;
    history.push({
      date: key,
      dayLetter: letter,
      completed,
      minutes: completed ? (i === 0 ? data.todayMinutes : 240 + (i * 15)) : 0,
    });
  }
  data.historyDays = history;

  return data;
}

export function recordStreakActivity(minutes: number): void {
  if (typeof window === 'undefined' || minutes <= 0) return;
  const current = getStreakData();
  const today = getTodayKey();

  if (current.lastActiveDate !== today) {
    // Check if consecutive
    const lastDate = new Date(current.lastActiveDate);
    const now = new Date(today);
    const diffDays = Math.round((now.getTime() - lastDate.getTime()) / 86400000);

    if (diffDays === 1) {
      current.currentStreak += 1;
      current.longestStreak = Math.max(current.longestStreak, current.currentStreak);
    } else if (diffDays > 1) {
      current.currentStreak = 1;
    }
    current.lastActiveDate = today;
    current.todayMinutes = minutes;
  } else {
    current.todayMinutes += minutes;
  }

  try {
    localStorage.setItem(STREAK_KEY, JSON.stringify(current));
    window.dispatchEvent(new CustomEvent('inspiro_streak_updated'));
  } catch (e) {
    // Ignore
  }
}
