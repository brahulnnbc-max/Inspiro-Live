import React, { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  PieChart,
  Pie,
} from 'recharts';
import { BarChart3, PieChart as PieIcon, Flame, Clock, TrendingUp, Plus, Check } from 'lucide-react';
import { JEEClass, JEEClassSubject } from '../types/class';
import { getWeeklyStudySummary, logStudyTime, DayBreakdown } from '../lib/studyTracker';

interface Props {
  classes: JEEClass[];
}

const SUBJECT_COLORS = {
  Physics: '#38bdf8',    // Cyan/Sky
  Chemistry: '#34d399',  // Emerald
  Mathematics: '#fbbf24',// Amber
};

export const WeeklyProgressCard: React.FC<Props> = () => {
  const [chartType, setChartType] = useState<'bar' | 'pie'>('bar');
  const [summary, setSummary] = useState(getWeeklyStudySummary);
  const [showQuickLog, setShowQuickLog] = useState(false);
  const [logSubject, setLogSubject] = useState<JEEClassSubject>('Physics');
  const [logMinutes, setLogMinutes] = useState(45);
  const [logConfirmed, setLogConfirmed] = useState(false);

  // Sync real-time updates across classroom player & Pomodoro timer
  React.useEffect(() => {
    const handleUpdate = () => {
      setSummary(getWeeklyStudySummary());
    };
    window.addEventListener('inspiro_study_updated', handleUpdate);
    return () => window.removeEventListener('inspiro_study_updated', handleUpdate);
  }, []);

  const { weeklyData, subjectTotals, totalWeekHours } = summary;
  const targetHours = 35.0; // Standard weekly JEE preparation benchmark

  const handleLogSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    logStudyTime(logSubject, logMinutes, 'self_study', `Self Study / Problem Practice (${logMinutes}m)`);
    setLogConfirmed(true);
    setTimeout(() => {
      setLogConfirmed(false);
      setShowQuickLog(false);
    }, 1200);
  };

  const pieData = [
    { name: 'Physics', hours: subjectTotals.Physics, color: SUBJECT_COLORS.Physics },
    { name: 'Chemistry', hours: subjectTotals.Chemistry, color: SUBJECT_COLORS.Chemistry },
    { name: 'Mathematics', hours: subjectTotals.Mathematics, color: SUBJECT_COLORS.Mathematics },
  ];

  const goalPercentage = Math.min(100, Math.round((totalWeekHours / targetHours) * 100));

  // Custom tooltips
  const CustomBarTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || !payload.length) return null;
    const item = payload[0].payload as DayBreakdown;

    return (
      <div className="bg-slate-900 border border-slate-700/80 rounded-lg p-3 shadow-xl text-xs space-y-1.5 font-mono">
        <div className="font-semibold text-slate-200 border-b border-slate-800 pb-1 flex justify-between gap-4">
          <span>{label} Class Hours</span>
          <span className="text-white">{item.total} hrs</span>
        </div>
        <div className="space-y-1 pt-0.5">
          <div className="flex items-center justify-between gap-4 text-sky-400">
            <span>Physics:</span>
            <span className="tabular-nums font-bold">{item.physics}h</span>
          </div>
          <div className="flex items-center justify-between gap-4 text-emerald-400">
            <span>Chemistry:</span>
            <span className="tabular-nums font-bold">{item.chemistry}h</span>
          </div>
          <div className="flex items-center justify-between gap-4 text-amber-400">
            <span>Mathematics:</span>
            <span className="tabular-nums font-bold">{item.mathematics}h</span>
          </div>
        </div>
      </div>
    );
  };

  const CustomPieTooltip = ({ active, payload }: any) => {
    if (!active || !payload || !payload.length) return null;
    const data = payload[0];
    const percent = Math.round((data.value / totalWeekHours) * 100);

    return (
      <div className="bg-slate-900 border border-slate-700/80 rounded-lg p-2.5 shadow-xl text-xs font-mono">
        <div className="font-semibold" style={{ color: data.payload.color }}>
          {data.name}
        </div>
        <div className="text-slate-200 tabular-nums font-bold mt-0.5">
          {data.value} hours ({percent}%)
        </div>
      </div>
    );
  };

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-xl space-y-5 sm:space-y-6">
      {/* Header and Toggle Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            <h2 className="text-sm sm:text-base font-semibold text-white tracking-tight">
              Weekly Progress: Class Attendance & Study Hours
            </h2>
          </div>
          <p className="text-xs text-slate-400">
            Time committed to live and scheduled video lectures across core JEE subjects
          </p>
        </div>

        {/* View segmented control & Quick Log */}
        <div className="flex items-center gap-2 flex-wrap self-start">
          <button
            onClick={() => setShowQuickLog(!showQuickLog)}
            className="px-2.5 py-1.5 text-xs font-semibold rounded-md bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 transition-colors flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Log Study</span>
          </button>

          <div className="flex items-center gap-1 p-1 bg-slate-950/80 border border-slate-800 rounded-lg">
            <button
              onClick={() => setChartType('bar')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 ${
                chartType === 'bar'
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>Daily Breakdown</span>
            </button>
            <button
              onClick={() => setChartType('pie')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 ${
                chartType === 'pie'
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <PieIcon className="w-3.5 h-3.5" />
              <span>Subject Share</span>
            </button>
          </div>
        </div>
      </div>

      {/* Quick Self-Study Logger Form */}
      {showQuickLog && (
        <form onSubmit={handleLogSubmit} className="p-3 bg-slate-950 border border-slate-800 rounded-xl flex items-center gap-3 flex-wrap animate-in fade-in">
          <span className="text-xs font-semibold text-slate-300">Log Real Hours:</span>
          <div className="flex items-center gap-1">
            {(['Physics', 'Chemistry', 'Mathematics'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setLogSubject(s)}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  logSubject === s
                    ? 'bg-emerald-500 text-slate-950 font-bold'
                    : 'bg-slate-900 text-slate-400 hover:text-white'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            {[15, 30, 45, 60, 90, 120].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setLogMinutes(m)}
                className={`px-2 py-1 text-xs rounded transition-colors font-mono ${
                  logMinutes === m
                    ? 'bg-sky-500 text-slate-950 font-bold'
                    : 'bg-slate-900 text-slate-400 hover:text-white'
                }`}
              >
                {m}m
              </button>
            ))}
          </div>
          <button
            type="submit"
            className="px-3 py-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded transition-colors flex items-center gap-1 ml-auto"
          >
            {logConfirmed ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            <span>{logConfirmed ? 'Logged!' : 'Add to Week'}</span>
          </button>
        </form>
      )}

      {/* High-level Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-4">
        {/* Total hours */}
        <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-1">
          <span className="text-[11px] text-slate-400 block font-medium">Total Classroom Time</span>
          <div className="text-xl font-bold font-mono text-white tabular-nums">
            {totalWeekHours} <span className="text-xs font-normal text-slate-400">hrs</span>
          </div>
          <div className="text-[10px] text-emerald-400 flex items-center gap-1">
            <Flame className="w-3 h-3 fill-current" />
            <span>{goalPercentage}% of 35h goal</span>
          </div>
        </div>

        {/* Physics */}
        <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-sky-400 font-medium">Physics</span>
            <span className="w-2 h-2 rounded-full bg-sky-400"></span>
          </div>
          <div className="text-xl font-bold font-mono text-white tabular-nums">
            {subjectTotals.Physics} <span className="text-xs font-normal text-slate-400">hrs</span>
          </div>
          <span className="text-[10px] text-slate-400">
            {Math.round((subjectTotals.Physics / totalWeekHours) * 100)}% of total
          </span>
        </div>

        {/* Chemistry */}
        <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-emerald-400 font-medium">Chemistry</span>
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
          </div>
          <div className="text-xl font-bold font-mono text-white tabular-nums">
            {subjectTotals.Chemistry} <span className="text-xs font-normal text-slate-400">hrs</span>
          </div>
          <span className="text-[10px] text-slate-400">
            {Math.round((subjectTotals.Chemistry / totalWeekHours) * 100)}% of total
          </span>
        </div>

        {/* Mathematics */}
        <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-amber-400 font-medium">Mathematics</span>
            <span className="w-2 h-2 rounded-full bg-amber-400"></span>
          </div>
          <div className="text-xl font-bold font-mono text-white tabular-nums">
            {subjectTotals.Mathematics} <span className="text-xs font-normal text-slate-400">hrs</span>
          </div>
          <span className="text-[10px] text-slate-400">
            {Math.round((subjectTotals.Mathematics / totalWeekHours) * 100)}% of total
          </span>
        </div>
      </div>

      {/* Chart Visualizer */}
      <div className="h-64 w-full pt-2">
        {chartType === 'bar' ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={weeklyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <XAxis
                dataKey="day"
                stroke="#64748b"
                fontSize={11}
                tickLine={false}
                axisLine={{ stroke: '#334155' }}
              />
              <YAxis
                stroke="#64748b"
                fontSize={11}
                tickLine={false}
                axisLine={{ stroke: '#334155' }}
                tickFormatter={(val) => `${val}h`}
              />
              <Tooltip content={<CustomBarTooltip />} />
              <Bar dataKey="physics" name="Physics" stackId="a" fill={SUBJECT_COLORS.Physics} radius={[0, 0, 0, 0]} />
              <Bar dataKey="chemistry" name="Chemistry" stackId="a" fill={SUBJECT_COLORS.Chemistry} radius={[0, 0, 0, 0]} />
              <Bar dataKey="mathematics" name="Mathematics" stackId="a" fill={SUBJECT_COLORS.Mathematics} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full flex flex-col sm:flex-row items-center justify-around gap-4">
            <div className="w-full sm:w-1/2 h-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Tooltip content={<CustomPieTooltip />} />
                  <Pie
                    data={pieData}
                    dataKey="hours"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={3}
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} stroke="#0f172a" strokeWidth={2} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Legend breakdown list */}
            <div className="w-full sm:w-1/2 space-y-2.5 font-mono text-xs pr-4">
              {pieData.map((entry) => {
                const percent = Math.round((entry.hours / totalWeekHours) * 100);
                return (
                  <div
                    key={entry.name}
                    className="p-2.5 rounded-lg bg-slate-950/50 border border-slate-800 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
                      <span className="font-semibold text-slate-200">{entry.name}</span>
                    </div>
                    <div className="text-slate-400">
                      <span className="text-white font-bold tabular-nums">{entry.hours}h</span>
                      <span className="ml-1 text-[11px]">({percent}%)</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Target Progress Bar */}
      <div className="pt-2 border-t border-slate-800/80 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-400">Weekly Target Progress</span>
          <span className="font-mono text-slate-200 font-medium">
            {totalWeekHours}h / {targetHours}h ({goalPercentage}%)
          </span>
        </div>
        <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800">
          <div
            className="h-full bg-gradient-to-r from-sky-400 via-emerald-400 to-amber-400 rounded-full transition-all duration-1000"
            style={{ width: `${goalPercentage}%` }}
          />
        </div>
      </div>
    </div>
  );
};
