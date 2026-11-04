import React, { useEffect } from 'react';
import { Bell, BellOff, ExternalLink, Play, Volume2, X } from 'lucide-react';
import { LiveSession } from '../types';

interface LiveAlarmModalProps {
  session: LiveSession;
  onEnterLive: (session: LiveSession) => void;
  onDismiss: () => void;
}

export const LiveAlarmModal: React.FC<LiveAlarmModalProps> = ({
  session,
  onEnterLive,
  onDismiss,
}) => {
  // Stop alarm on unmount
  useEffect(() => {
    return () => {
      // unmount cleanup
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-md rounded-2xl bg-[#121214] border-2 border-red-500 shadow-[0_0_50px_rgba(255,0,0,0.4)] p-6 text-white space-y-5 overflow-hidden">
        {/* Pulsing Alert Header Bar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-red-600/20 border border-red-500 text-xs font-mono font-bold text-red-400">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping" />
            <span>LIVE CLASSROOM ALARM</span>
          </div>

          <button
            type="button"
            onClick={onDismiss}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            title="Turn Off Alarm"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Alarm Body */}
        <div className="space-y-2 text-center py-2">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-red-600/10 border border-red-500/30 flex items-center justify-center text-red-500 shadow-inner">
            <Bell className="w-8 h-8 animate-bounce text-red-500" />
          </div>

          <h2 className="text-xl font-black tracking-tight text-white">
            {session.chapterName || session.title}
          </h2>

          <p className="text-xs text-zinc-300 leading-relaxed max-w-xs mx-auto">
            Your scheduled live revision is <strong className="text-red-400">LIVE NOW</strong>. 
            Slides advance automatically on wall-clock time.
          </p>

          <div className="inline-flex items-center gap-1.5 text-xs font-mono text-amber-400 bg-amber-500/10 border border-amber-500/30 px-3 py-1 rounded-lg">
            <Volume2 className="w-3.5 h-3.5" />
            <span>Alarm Ringing — Opens when you enter</span>
          </div>
        </div>

        {/* Buttons */}
        <div className="space-y-2 pt-1">
          <button
            type="button"
            onClick={() => onEnterLive(session)}
            className="w-full py-3 px-4 rounded-xl bg-[#FF0000] hover:bg-red-700 text-white font-bold text-sm tracking-wide flex items-center justify-center gap-2 shadow-lg transition-transform active:scale-98 cursor-pointer"
          >
            <Play className="w-4 h-4 fill-current" />
            <span>Enter Live Classroom</span>
          </button>

          <button
            type="button"
            onClick={onDismiss}
            className="w-full py-2.5 px-4 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-zinc-300 text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <BellOff className="w-3.5 h-3.5" />
            <span>Turn Off Alarm</span>
          </button>
        </div>
      </div>
    </div>
  );
};
