import React from 'react';
import { Bell, BellRing, Sparkles } from 'lucide-react';
import { JEEClass } from '../types/class';
import { InspiroLogo } from './InspiroLogo';

interface Props {
  activeView: 'timetable' | 'classroom' | 'admin';
  setActiveView: (view: 'timetable' | 'classroom' | 'admin') => void;
  openFormulaModal: () => void;
  hasNotifications: boolean;
  onToggleNotifications: () => void;
  liveClass?: JEEClass | null;
  onSelectClass?: (c: JEEClass) => void;
}

export const Navbar: React.FC<Props> = ({
  activeView,
  setActiveView,
  openFormulaModal,
  hasNotifications,
  onToggleNotifications,
  liveClass,
  onSelectClass,
}) => {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-800/80 bg-slate-950/85 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        {/* Zone 1: Inspiro Brand Logo */}
        <button
          onClick={() => setActiveView('timetable')}
          className="flex items-center gap-2 group transition-transform active:scale-95"
          title="inspiro - Synchronized JEE Classroom"
        >
          <InspiroLogo size="sm" showSubtitle={true} />
        </button>

        {/* Zone 2: Navigation links */}
        <nav className="hidden md:flex items-center gap-7 text-xs font-medium text-slate-400">
          <button
            onClick={() => setActiveView('timetable')}
            className={`transition-colors hover:text-slate-100 ${
              activeView === 'timetable'
                ? 'text-slate-100 underline decoration-emerald-400 underline-offset-8 font-semibold'
                : ''
            }`}
          >
            Timetable
          </button>
          <button
            onClick={() => {
              setActiveView('timetable');
              window.dispatchEvent(new CustomEvent('filter-today'));
            }}
            className="transition-colors hover:text-slate-100"
          >
            Today's Schedule
          </button>
          <button
            onClick={openFormulaModal}
            className="transition-colors hover:text-slate-100"
          >
            Formulas & Notes
          </button>
          <button
            onClick={() => setActiveView('admin')}
            className={`transition-colors hover:text-slate-100 ${
              activeView === 'admin'
                ? 'text-slate-100 underline decoration-emerald-400 underline-offset-8 font-semibold'
                : ''
            }`}
          >
            Admin Panel
          </button>
        </nav>

        {/* Zone 3: Actions */}
        <div className="flex items-center gap-2.5">
          {liveClass && (
            <button
              onClick={() => {
                if (onSelectClass) onSelectClass(liveClass);
                setActiveView('classroom');
              }}
              className="px-3 py-1.5 text-xs font-medium text-emerald-300 bg-emerald-950/80 border border-emerald-800/80 rounded-lg hover:bg-emerald-900/60 transition-colors flex items-center gap-2 whitespace-nowrap shadow-sm"
            >
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_#ef4444]"></span>
              <span className="hidden sm:inline">Live Now:</span>
              <span className="font-mono text-emerald-200 truncate max-w-[90px] sm:max-w-[120px]">{liveClass.subject}</span>
            </button>
          )}

          <button
            onClick={onToggleNotifications}
            className={`p-2 rounded-lg border transition-colors ${
              hasNotifications
                ? 'bg-sky-950/60 border-sky-800/80 text-sky-400'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
            title={hasNotifications ? 'Push notifications active' : 'Enable Web Push notifications'}
            aria-label="Toggle notifications"
          >
            {hasNotifications ? <BellRing className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
          </button>

          <button
            onClick={() => setActiveView('admin')}
            className="md:hidden px-2.5 py-1.5 text-xs font-medium text-slate-300 bg-slate-900 border border-slate-800 rounded-lg hover:text-white"
          >
            Admin
          </button>
        </div>
      </div>
    </header>
  );
};
