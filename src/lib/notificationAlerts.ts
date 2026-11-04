export type NotificationPermissionState = 'default' | 'granted' | 'denied' | 'unsupported';

export function getNotificationPermissionStatus(): NotificationPermissionState {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      try {
        localStorage.setItem('inspiro_notifications_allowed', 'true');
      } catch {
        // ignore
      }
    }
    return permission;
  } catch {
    return 'denied';
  }
}

export function areNotificationsEnabled(): boolean {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false;
  }
  return Notification.permission === 'granted';
}

export async function dispatchSystemAlarmNotification(
  title: string,
  body: string,
  tag = 'inspiro-live-alarm'
): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  // 1. Try Service Worker Notification if registered
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.getRegistration();
        await (reg as unknown as { showNotification: (t: string, o: unknown) => Promise<void> }).showNotification(title, {
          body,
          icon: '/pwa-192x192.png',
          badge: '/favicon.ico',
          tag,
          requireInteraction: true,
          vibrate: [400, 150, 400, 150, 600, 200, 800],
          data: { url: '/' },
        });
        return true;
    } catch {
      // Fallback to standard window Notification
    }
  }

  // 2. Standard window Notification
  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      const notif = new Notification(title, {
        body,
        icon: '/pwa-192x192.png',
        badge: '/favicon.ico',
        tag,
        requireInteraction: true,
      });
      notif.onclick = () => {
        window.focus();
        notif.close();
      };
      return true;
    } catch {
      return false;
    }
  }

  return false;
}
