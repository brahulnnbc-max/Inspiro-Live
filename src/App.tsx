import React, { useState, useEffect, useCallback } from 'react';
import { JEEClass } from './types/class';
import { Navbar } from './components/Navbar';
import { StudentTimetable } from './components/StudentTimetable';
import { ClassroomPlayer } from './components/ClassroomPlayer';
import { AdminPanel } from './components/AdminPanel';
import { FormulaSheetModal } from './components/FormulaSheetModal';
import { MomentsTable } from './components/MomentsTable';
import { getLiveClockStatus } from './lib/istTime';
import { subscribeToPushNotifications, sendTestNotification } from './lib/pushClient';
import { InspiroLogo } from './components/InspiroLogo';
import { fetchAllClasses } from './lib/clientData';
import { checkClassroomNotifications, InAppAlertPayload } from './lib/notificationMonitor';
import { X, Play, Clock } from 'lucide-react';
import { AppView } from './components/Navbar';

export default function App() {
  const [classes, setClasses] = useState<JEEClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedClass, setSelectedClass] = useState<JEEClass | null>(null);
  const [initialSeekSeconds, setInitialSeekSeconds] = useState<number | undefined>(undefined);
  const [activeView, setActiveView] = useState<AppView>('timetable');
  const [isFormulaModalOpen, setIsFormulaModalOpen] = useState(false);
  const [hasNotifications, setHasNotifications] = useState(false);
  const [activeAlert, setActiveAlert] = useState<InAppAlertPayload | null>(null);

  // Check if browser notifications are already granted
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'granted') {
      setHasNotifications(true);
    }
  }, []);

  // Active real-time notification monitor (15m before & Real-Time Live)
  useEffect(() => {
    if (classes.length === 0) return;
    checkClassroomNotifications(classes);

    const interval = setInterval(() => {
      checkClassroomNotifications(classes);
    }, 5000);

    return () => clearInterval(interval);
  }, [classes]);

  // Listen to in-app notification toasts
  useEffect(() => {
    const handleAlert = (e: any) => {
      if (e.detail) {
        setActiveAlert(e.detail);
      }
    };
    window.addEventListener('inspiro_inapp_alert', handleAlert);
    return () => window.removeEventListener('inspiro_inapp_alert', handleAlert);
  }, []);

  // Fetch classes with automatic cache and server sync
  const fetchClasses = useCallback(async () => {
    try {
      const loaded = await fetchAllClasses();
      setClasses(loaded);
    } catch (err) {
      console.warn('Could not fetch classes:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchClasses();
  }, [fetchClasses]);

  // Deep-link routing via hash (e.g. #admin, #classroom/id)
  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash;
      if (hash === '#admin') {
        setActiveView('admin');
      } else if (hash === '#moments') {
        setActiveView('moments');
      } else if (hash.startsWith('#classroom/')) {
        const classId = hash.replace('#classroom/', '');
        const target = classes.find((c) => c.id === classId);
        if (target) {
          setSelectedClass(target);
          setActiveView('classroom');
        }
      } else if (hash === '#timetable' || !hash) {
        setActiveView('timetable');
      }
    };

    if (classes.length > 0) {
      handleHash();
    }

    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, [classes]);

  // Find currently live class if any
  const liveClass = classes.find((c) => {
    const status = getLiveClockStatus(c.start_at, c.duration_min);
    return status.status === 'live';
  });

  const handleToggleNotifications = async () => {
    if (hasNotifications) {
      // Trigger test alert if already active
      await sendTestNotification();
      return;
    }

    const res = await subscribeToPushNotifications();
    if (res.success) {
      setHasNotifications(true);
      await sendTestNotification();
    } else {
      alert(res.message);
    }
  };

  const handleSelectClass = (cls: JEEClass) => {
    setSelectedClass(cls);
    setInitialSeekSeconds(undefined);
    setActiveView('classroom');
    window.location.hash = `#classroom/${cls.id}`;
  };

  const handleGoToMoment = (targetClass: JEEClass, seconds: number) => {
    setSelectedClass(targetClass);
    setInitialSeekSeconds(seconds);
    setActiveView('classroom');
    window.location.hash = `#classroom/${targetClass.id}`;
  };

  const handleBackToTimetable = () => {
    setInitialSeekSeconds(undefined);
    setActiveView('timetable');
    window.location.hash = '#timetable';
  };

  return (
    <div className="min-h-screen bg-[#0b0f17] text-slate-100 flex flex-col selection:bg-sky-500/30 selection:text-sky-200">
      {/* 3-Zone Navigation Bar */}
      <Navbar
        activeView={activeView}
        setActiveView={(v) => {
          setActiveView(v);
          window.location.hash = v === 'classroom' && selectedClass ? `#classroom/${selectedClass.id}` : `#${v}`;
        }}
        openFormulaModal={() => setIsFormulaModalOpen(true)}
        hasNotifications={hasNotifications}
        onToggleNotifications={handleToggleNotifications}
        liveClass={liveClass}
        onSelectClass={handleSelectClass}
      />

      {/* Real-Time Live and 15-Minute Warning Notification Banner */}
      {activeAlert && (
        <aside aria-label="Classroom notification banner" className="sticky top-14 z-50 bg-slate-900/95 border-b border-emerald-500/40 px-3 sm:px-6 py-2.5 shadow-2xl backdrop-blur-md animate-in slide-in-from-top-2">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2.5">
              {activeAlert.type === 'live' ? (
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_#ef4444]"></span>
              ) : (
                <Clock className="w-4 h-4 text-amber-400" />
              )}
              <span className="text-xs font-semibold text-white">
                {activeAlert.title}
              </span>
              <span className="hidden sm:inline text-xs text-slate-300">
                · {activeAlert.body}
              </span>
            </div>

            <div className="flex items-center gap-2 ml-auto">
              <button
                onClick={() => {
                  const target = classes.find((c) => c.id === activeAlert.classId);
                  if (target) {
                    handleSelectClass(target);
                  }
                  setActiveAlert(null);
                }}
                className="px-3 py-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-lg transition-colors flex items-center gap-1.5 shadow"
              >
                <Play className="w-3 h-3 fill-current" />
                <span>{activeAlert.type === 'live' ? 'Join Stream' : 'Open Classroom'}</span>
              </button>
              <button
                onClick={() => setActiveAlert(null)}
                className="p-1 text-slate-400 hover:text-white rounded"
                title="Dismiss"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </aside>
      )}

      {/* Main Content Area */}
      <main className="flex-1">
        {loading ? (
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="text-center space-y-3">
              <div className="w-8 h-8 border-2 border-sky-400 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-xs font-mono text-slate-400">Loading JEE Class Schedule...</p>
            </div>
          </div>
        ) : (
          <>
            {activeView === 'timetable' && (
              <StudentTimetable
                classes={classes}
                onSelectClass={handleSelectClass}
                openAdmin={() => {
                  setActiveView('admin');
                  window.location.hash = '#admin';
                }}
                openFormulaModal={() => setIsFormulaModalOpen(true)}
                onEnableNotifications={handleToggleNotifications}
                hasNotifications={hasNotifications}
              />
            )}

            {activeView === 'classroom' && selectedClass && (
              <ClassroomPlayer
                jeeClass={selectedClass}
                onBack={handleBackToTimetable}
                openFormulaModal={() => setIsFormulaModalOpen(true)}
                initialSeekSeconds={initialSeekSeconds}
                onOpenMomentsTable={() => {
                  setActiveView('moments');
                  window.location.hash = '#moments';
                }}
              />
            )}

            {activeView === 'moments' && (
              <MomentsTable
                classes={classes}
                onGoToMoment={handleGoToMoment}
                onBackToTimetable={handleBackToTimetable}
              />
            )}

            {activeView === 'admin' && (
              <AdminPanel
                classes={classes}
                onRefreshClasses={fetchClasses}
                onBackToTimetable={handleBackToTimetable}
              />
            )}
          </>
        )}
      </main>

      {/* Formula Reference Modal */}
      <FormulaSheetModal
        isOpen={isFormulaModalOpen}
        onClose={() => setIsFormulaModalOpen(false)}
        defaultSubject={selectedClass ? selectedClass.subject : 'Physics'}
      />

      {/* Quiet Inspiro Footer */}
      <footer className="border-t border-slate-900 bg-slate-950/80 py-6 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <InspiroLogo size="sm" showSubtitle={true} />
            <span className="text-slate-600 hidden sm:inline">|</span>
            <p className="text-slate-400 text-xs">© {new Date().getFullYear()} inspiro · Synchronized Online Learning for JEE Aspirants</p>
          </div>
          <div className="flex items-center gap-3 text-slate-400 font-mono text-[11px]">
            <span>IST (UTC+05:30)</span>
            <span aria-hidden="true">·</span>
            <span>Distraction-Free Mode</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
