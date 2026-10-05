import React, { useState, useEffect } from 'react';
import { Bell, BellRing, Bookmark } from 'lucide-react';
import { JEEClass } from '../types/class';
import { InspiroLogo } from './InspiroLogo';
import { getAllBookmarks } from '../lib/bookmarkStore';

export type AppView = 'timetable' | 'classroom' | 'admin' | 'moments';

interface Props {
  activeView: AppView;
  setActiveView: (view: AppView) => void;
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
  const [momentsCount, setMomentsCount] = useState<number>(() => getAllBookmarks().length);

  useEffect(() => {
    const handleUpdate = () => {
      setMomentsCount(getAllBookmarks().length);
    };
    window.addEventListener('inspiro_bookmarks_updated', handleUpdate);
    return () => window.removeEventListener('inspiro_bookmarks_updated', handleUpdate);
  }, []);

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
        <nav className="hidden md:flex items-center gap-6 text-xs font-medium text-slate-400">
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

          {/* Simple Direct Moments Table Tab */}
          <button
            onClick={() => setActiveView('moments')}
            className={`transition-colors hover:text-slate-100 flex items-center gap-1.5 ${
              activeView === 'moments'
                ? 'text-slate-100 underline decoration-amber-400 underline-offset-8 font-semibold'
                : ''
            }`}
            title="View simple table of all saved moments and notes"
          >
            <Bookmark className="w-3.5 h-3.5 text-amber-400" />
            <span>Moments Table</span>
            {momentsCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-300 font-mono text-[10px] border border-amber-500/30">
                {momentsCount}
              </span>
            )}
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
        <div className="flex items-center gap-2">
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

          {/* Quick Mobile Moments Button */}
          <button
            onClick={() => setActiveView('moments')}
            className={`md:hidden px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors flex items-center gap-1 ${
              activeView === 'moments'
                ? 'bg-amber-500 text-slate-950 font-bold border-amber-400'
                : 'bg-slate-900 border-slate-800 text-slate-300 hover:text-white'
            }`}
            title="Open Moments Table"
          >
            <Bookmark className="w-3 h-3 text-amber-400" />
            <span>Moments</span>
            {momentsCount > 0 && <span className="font-mono text-[10px]">({momentsCount})</span>}
          </button>

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
