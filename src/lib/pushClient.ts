// Web Push, Audio Chimes & Browser Notification Client

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

let sharedAudioCtx: AudioContext | null = null;

/**
 * Returns a primed AudioContext instance, resuming it if suspended.
 */
export function getAudioContext(): AudioContext | null {
  try {
    if (typeof window === 'undefined') return null;
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return null;
    if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
      sharedAudioCtx = new AudioContextClass();
    }
    if (sharedAudioCtx.state === 'suspended') {
      sharedAudioCtx.resume().catch(() => {});
    }
    return sharedAudioCtx;
  } catch (e) {
    return null;
  }
}

// Automatically unlock audio on first student interaction (click/touch/key)
if (typeof window !== 'undefined') {
  const unlockAudio = () => {
    const ctx = getAudioContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
  };
  window.addEventListener('click', unlockAudio, { once: true, passive: true });
  window.addEventListener('touchstart', unlockAudio, { once: true, passive: true });
  window.addEventListener('keydown', unlockAudio, { once: true, passive: true });
}

/**
 * Synthesizes a high-clarity harmonic bell chime (two notes: E5 followed by A5).
 * Each tone features a fundamental sine wave plus a resonant harmonic overtone.
 */
function synthesizeChimeTone(ctx: AudioContext, startTime: number) {
  const notes = [
    { freq: 659.25, offset: 0, dur: 0.45, gain: 0.35 },    // E5
    { freq: 880.00, offset: 0.16, dur: 0.70, gain: 0.40 },  // A5
  ];

  notes.forEach(({ freq, offset, dur, gain: peakGain }) => {
    const toneStart = startTime + offset;

    // 1. Fundamental tone (smooth sine)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(freq, toneStart);

    gain1.gain.setValueAtTime(0.0001, toneStart);
    gain1.gain.linearRampToValueAtTime(peakGain, toneStart + 0.02);
    gain1.gain.exponentialRampToValueAtTime(0.0001, toneStart + dur);

    osc1.connect(gain1);
    gain1.connect(ctx.destination);

    osc1.start(toneStart);
    osc1.stop(toneStart + dur + 0.05);

    // 2. Harmonic bell overtone (triangle wave at 2x frequency for rich chime ring)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(freq * 2, toneStart);

    gain2.gain.setValueAtTime(0.0001, toneStart);
    gain2.gain.linearRampToValueAtTime(peakGain * 0.35, toneStart + 0.015);
    gain2.gain.exponentialRampToValueAtTime(0.0001, toneStart + (dur * 0.7));

    osc2.connect(gain2);
    gain2.connect(ctx.destination);

    osc2.start(toneStart);
    osc2.stop(toneStart + (dur * 0.7) + 0.05);
  });
}

/**
 * 15-Minute Alert: Plays a single clean harmonic alert chime.
 */
export function playClassroomChime() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      ctx.resume().then(() => synthesizeChimeTone(ctx, ctx.currentTime)).catch(() => {});
    } else {
      synthesizeChimeTone(ctx, ctx.currentTime);
    }
  } catch (err) {
    console.debug('Audio chime skipped:', err);
  }
}

/**
 * Live Class Start Alert: Plays the notification alert ring 2 or 3 times (default 3 times)
 * spaced 0.85 seconds apart (Ring 1 -> Ring 2 -> Ring 3) so students never miss class start.
 */
export function playLiveStartRings(count: number = 3) {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const playSequence = () => {
      const now = ctx.currentTime;
      for (let i = 0; i < count; i++) {
        synthesizeChimeTone(ctx, now + (i * 0.85));
      }
    };

    if (ctx.state === 'suspended') {
      ctx.resume().then(playSequence).catch(() => {});
    } else {
      playSequence();
    }
  } catch (err) {
    console.debug('Live alert rings skipped:', err);
  }
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) {
    return 'denied';
  }
  return await Notification.requestPermission();
}

export async function subscribeToPushNotifications(vapidPublicKey?: string): Promise<{
  success: boolean;
  message: string;
  subscription?: PushSubscription;
}> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return {
      success: false,
      message: 'Push notifications are not supported in this browser.',
    };
  }

  const permission = await requestNotificationPermission();
  if (permission !== 'granted') {
    return {
      success: false,
      message: 'Notification permission was denied. Please allow notifications in site settings.',
    };
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;

    // If VAPID public key is available, subscribe with PushManager
    if (vapidPublicKey && vapidPublicKey.length > 20) {
      try {
        let subscription = await registration.pushManager.getSubscription();
        if (!subscription) {
          const convertedVapidKey = urlBase64ToUint8Array(vapidPublicKey);
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: convertedVapidKey,
          });
        }

        // Send to backend
        await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            subscription,
            userAgent: navigator.userAgent,
          }),
        });

        return {
          success: true,
          message: 'Subscribed to Web Push reminders!',
          subscription,
        };
      } catch (pushErr: any) {
        console.warn('Push manager subscribe error, using local browser notification fallback:', pushErr);
      }
    }

    // In-browser notification fallback
    return {
      success: true,
      message: 'Class notifications enabled for this device!',
    };
  } catch (err: any) {
    console.error('Service worker registration failed:', err);
    return {
      success: false,
      message: err.message || 'Failed to initialize notifications.',
    };
  }
}

/**
 * Trigger an instant test notification to verify audio and alert setup
 */
export async function sendTestNotification(): Promise<void> {
  playLiveStartRings(3);

  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg && reg.showNotification) {
          await reg.showNotification('Inspiro Live Class Alert', {
            body: 'Physics: Rotational Motion is starting now! 3 alert rings played.',
            icon: '/favicon.ico',
            tag: 'inspiro-test-alert',
          });
          return;
        }
      }

      new Notification('Inspiro Live Class Alert', {
        body: 'Physics: Rotational Motion is starting now! 3 alert rings played.',
        icon: '/favicon.ico',
      });
    } catch (e) {
      // Ignore
    }
  }
}
