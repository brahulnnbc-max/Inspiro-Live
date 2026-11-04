import React, { useEffect, useState } from 'react';
import { Bell, BellRing, CheckCircle2, ShieldAlert, Volume2, X } from 'lucide-react';
import {
  areNotificationsEnabled,
  dispatchSystemAlarmNotification,
  getNotificationPermissionStatus,
  requestNotificationPermission,
} from '../lib/notificationAlerts';
import { startRepeatingClassroomAlarm, stopRepeatingClassroomAlarm } from '../lib/soundEngine';

interface NotificationSettingsButtonProps {
  isNightMode?: boolean;
}

export const NotificationSettingsButton: React.FC<NotificationSettingsButtonProps> = ({
  isNightMode = true,
}) => {
  const [permission, setPermission] = useState<string>('default');
  const [isOpen, setIsOpen] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  useEffect(() => {
    setPermission(getNotificationPermissionStatus());
  }, []);

  const handleEnable = async () => {
    const res = await requestNotificationPermission();
    setPermission(res);
  };

  const handleTestAlarm = () => {
    if (isTesting) {
      stopRepeatingClassroomAlarm();
      setIsTesting(false);
      return;
    }

    setIsTesting(true);
    startRepeatingClassroomAlarm();
    dispatchSystemAlarmNotification(
      'TEST: inspiro LIVE Classroom Alarm',
      'This is how your live revision alarm will notify you on time!'
    );

    // Auto-stop test after 5 seconds
    window.setTimeout(() => {
      stopRepeatingClassroomAlarm();
      setIsTesting(false);
    }, 5000);
  };

  const isGranted = permission === 'granted';

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border transition-colors cursor-pointer whitespace-nowrap ${
          isGranted
            ? isNightMode
              ? 'bg-zinc-900 hover:bg-zinc-800 border-white/15 text-zinc-200'
              : 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-800'
            : 'bg-amber-500/15 border-amber-500/40 text-amber-400 hover:bg-amber-500/25'
        }`}
        title="Notification & Alarm Settings"
      >
        {isGranted ? (
          <>
            <BellRing className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden sm:inline">Alarm On</span>
          </>
        ) : (
          <>
            <Bell className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
            <span className="hidden sm:inline">Enable Alarm</span>
          </>
        )}
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs">
          <div
            className={`w-full max-w-sm rounded-xl border p-5 shadow-2xl space-y-4 ${
              isNightMode ? 'bg-[#18181B] border-white/15 text-white' : 'bg-white border-slate-200 text-slate-900'
            }`}
          >
            <div className="flex items-center justify-between border-b pb-3 border-inherit">
              <div className="flex items-center gap-2">
                <BellRing className="w-4 h-4 text-red-500" />
                <h3 className="font-bold text-sm">Classroom Alarm &amp; Alerts</h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  stopRepeatingClassroomAlarm();
                  setIsTesting(false);
                  setIsOpen(false);
                }}
                className="p-1 rounded-lg text-zinc-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-zinc-400 leading-relaxed">
              When a scheduled chapter or 6:00 AM re-revision goes live, inspiro LIVE rings an alarm and sends a notification alert until you open the classroom.
            </p>

            {/* Permission Status */}
            <div
              className={`p-3 rounded-lg border text-xs flex items-center justify-between ${
                isGranted
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                  : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
              }`}
            >
              <span className="font-semibold">
                {isGranted ? 'Notifications Allowed' : 'Notifications Not Allowed Yet'}
              </span>
              {isGranted ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <button
                  type="button"
                  onClick={handleEnable}
                  className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-zinc-950 font-bold rounded text-[11px] cursor-pointer"
                >
                  Allow Now
                </button>
              )}
            </div>

            {/* Test Alarm Sound */}
            <div className="pt-1 space-y-2">
              <button
                type="button"
                onClick={handleTestAlarm}
                className={`w-full py-2.5 px-3 rounded-lg border text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                  isTesting
                    ? 'bg-red-600 text-white border-red-500'
                    : isNightMode
                    ? 'bg-zinc-900 hover:bg-zinc-800 border-white/15 text-zinc-200'
                    : 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-800'
                }`}
              >
                <Volume2 className="w-4 h-4" />
                <span>{isTesting ? 'Ringing... (Click to Stop)' : 'Test Alarm Sound (5s)'}</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                stopRepeatingClassroomAlarm();
                setIsTesting(false);
                setIsOpen(false);
              }}
              className="w-full py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-medium cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </>
  );
};
