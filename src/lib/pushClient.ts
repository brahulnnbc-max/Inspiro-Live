// Web Push & Browser Notification Client

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

/**
 * Play a calm harmonic double chime for classroom announcements using Web Audio API
 */
export function playClassroomChime() {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();

    const playTone = (freq: number, start: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
      gain.gain.setValueAtTime(0.001, ctx.currentTime + start);
      gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + start + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + duration);
    };

    // Nice educational chime: E5 followed by B5
    playTone(659.25, 0, 0.4);
    playTone(987.77, 0.25, 0.6);
  } catch (err) {
    console.debug('Audio chime skipped:', err);
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
 * Trigger an instant test notification to verify setup
 */
export async function sendTestNotification(): Promise<void> {
  playClassroomChime();

  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg && reg.showNotification) {
          await reg.showNotification('JEE LiveSync Alert', {
            body: 'Physics: Rotational Motion class is live now. Tap to enter the lecture.',
            icon: '/favicon.ico',
            tag: 'jee-test-alert',
          });
          return;
        }
      }

      new Notification('JEE LiveSync Alert', {
        body: 'Physics: Rotational Motion class is live now. Tap to enter the lecture.',
        icon: '/favicon.ico',
      });
    } catch (e) {
      console.warn('Fallback test notification:', e);
    }
  }
}
