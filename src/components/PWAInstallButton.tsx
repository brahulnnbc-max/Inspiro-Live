import React, { useState } from 'react';
import { Download, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../lib/usePWAInstall';

interface PWAInstallButtonProps {
  isNightMode?: boolean;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ isNightMode = true }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  // If already running as an installed PWA on home screen, hide the button
  if (isInstalled) {
    return null;
  }

  // Chromium / Android / Desktop flow
  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors cursor-pointer shadow-xs whitespace-nowrap"
        title="Install inspiro LIVE as app"
      >
        <Download className="w-3.5 h-3.5 shrink-0" />
        <span>Install App</span>
      </button>
    );
  }

  // iOS Safari flow (beforeinstallprompt is not supported by WebKit)
  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border transition-colors cursor-pointer whitespace-nowrap ${
            isNightMode
              ? 'bg-zinc-900 hover:bg-zinc-800 border-white/15 text-zinc-200'
              : 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-800'
          }`}
          title="Install inspiro LIVE on Home Screen"
        >
          <Smartphone className="w-3.5 h-3.5 text-red-500 shrink-0" />
          <span>Install App</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4">
            <div className="w-full max-w-sm rounded-xl bg-[#18181B] border border-white/15 p-6 shadow-2xl text-white space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm">Install inspiro</span>
                  <span className="font-black text-xs text-[#FF0000]">LIVE</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-2 text-xs text-zinc-300 leading-relaxed">
                <p className="flex items-start gap-2">
                  <span className="font-mono font-bold text-red-400">1.</span>
                  <span>
                    Tap the <strong>Share</strong> button (box with upward arrow) in your Safari toolbar.
                  </span>
                </p>
                <p className="flex items-start gap-2">
                  <span className="font-mono font-bold text-red-400">2.</span>
                  <span>
                    Scroll down and tap <strong>&ldquo;Add to Home Screen&rdquo;</strong>.
                  </span>
                </p>
                <p className="flex items-start gap-2">
                  <span className="font-mono font-bold text-red-400">3.</span>
                  <span>
                    Open from your home screen for fullscreen live classes with zero browser address bar!
                  </span>
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="w-full py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-lg cursor-pointer"
              >
                Got It
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  // Fallback install button for browsers that haven't fired beforeinstallprompt yet
  return (
    <button
      type="button"
      onClick={() => setShowIOSGuide(true)}
      className={`hidden sm:flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border transition-colors cursor-pointer whitespace-nowrap ${
        isNightMode
          ? 'bg-zinc-900 hover:bg-zinc-800 border-white/15 text-zinc-200'
          : 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-800'
      }`}
      title="Install inspiro LIVE as app"
    >
      <Download className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
      <span>Install App</span>
    </button>
  );
};
