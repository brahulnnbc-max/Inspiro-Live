import { JEEClass } from '../types/class';
import { playClassroomChime, playLiveStartRings } from './pushClient';

const ALERTS_FIRED_KEY = 'inspiro_alerts_fired_v2';

interface FiredAlertRecord {
  classId: string;
  type: '15m' | 'live';
  firedAt: string;
}

function getFiredAlerts(): FiredAlertRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(ALERTS_FIRED_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    // Ignore
  }
  return [];
}

function markAlertFired(classId: string, type: '15m' | 'live'): void {
  if (typeof window === 'undefined') return;
  try {
    const existing = getFiredAlerts();
    existing.push({
      classId,
      type,
      firedAt: new Date().toISOString(),
    });
    localStorage.setItem(ALERTS_FIRED_KEY, JSON.stringify(existing));
  } catch (e) {
    // Ignore
  }
}

function isAlertFired(classId: string, type: '15m' | 'live'): boolean {
  const existing = getFiredAlerts();
  return existing.some(a => a.classId === classId && a.type === type);
}

export interface InAppAlertPayload {
  id: string;
  type: '15m' | 'live';
  title: string;
  body: string;
  classId: string;
  subject: string;
  faculty: string;
}

/**
 * Check all classes and dispatch 15m and Real-Time Live notifications
 */
export function checkClassroomNotifications(classes: JEEClass[]): void {
  if (!Array.isArray(classes) || classes.length === 0) return;

  const now = Date.now();

  classes.forEach(cls => {
    const startTime = new Date(cls.start_at).getTime();
    const diffMs = startTime - now;
    const diffMin = Math.round(diffMs / 60000);

    // 1. T - 15 Minutes Alert
    if (diffMin <= 15 && diffMin > 0 && !isAlertFired(cls.id, '15m')) {
      markAlertFired(cls.id, '15m');
      playClassroomChime();

      const title = `⏳ JEE Class in ${diffMin} mins`;
      const body = `${cls.subject}: "${cls.title}" with ${cls.faculty}. Prepare your rough notebook!`;

      // Dispatch browser push notification if permitted
      if ('Notification' in window && Notification.permission === 'granted') {
        try {
          new Notification(title, {
            body,
            icon: '/favicon.ico',
            tag: `alert-15m-${cls.id}`,
          });
        } catch (e) {
          // Ignore
        }
      }

      // Dispatch in-app toast event
      window.dispatchEvent(
        new CustomEvent('inspiro_inapp_alert', {
          detail: {
            id: `alert-15m-${cls.id}-${Date.now()}`,
            type: '15m',
            title,
            body,
            classId: cls.id,
            subject: cls.subject,
            faculty: cls.faculty,
          } as InAppAlertPayload,
        })
      );
    }

    // 2. Real-Time Live Now Alert (T = 0)
    if (diffMin <= 0 && diffMin >= -3 && !isAlertFired(cls.id, 'live')) {
      markAlertFired(cls.id, 'live');
      // Rings 3 times when any live class starts
      playLiveStartRings(3);

      const title = `🔴 Class is LIVE NOW!`;
      const body = `${cls.subject}: "${cls.title}" stream is broadcasting in lockstep with IST. Join now!`;

      // Dispatch browser notification
      if ('Notification' in window && Notification.permission === 'granted') {
        try {
          new Notification(title, {
            body,
            icon: '/favicon.ico',
            tag: `alert-live-${cls.id}`,
          });
        } catch (e) {
          // Ignore
        }
      }

      // Dispatch in-app toast event
      window.dispatchEvent(
        new CustomEvent('inspiro_inapp_alert', {
          detail: {
            id: `alert-live-${cls.id}-${Date.now()}`,
            type: 'live',
            title,
            body,
            classId: cls.id,
            subject: cls.subject,
            faculty: cls.faculty,
          } as InAppAlertPayload,
        })
      );
    }
  });
}
