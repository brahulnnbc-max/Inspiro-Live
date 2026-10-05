import { NextResponse } from 'next/server';
import webpush from 'web-push';
import { getAllClasses, getPushSubscriptions } from '../../../../src/server/db';

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@jeelivesync.edu';

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  try {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  } catch (err) {
    console.warn('VAPID setup warning:', err);
  }
}

export async function GET() {
  try {
    const now = Date.now();
    const classes = await getAllClasses();
    const subscriptions = await getPushSubscriptions();
    const dispatched: string[] = [];

    for (const cls of classes) {
      const startTime = new Date(cls.start_at).getTime();
      const diffMs = startTime - now;
      const diffMin = Math.round(diffMs / 60000);

      if (diffMin <= 15 && diffMin > 0 && !cls.notification_15m_sent) {
        cls.notification_15m_sent = true;
        dispatched.push(`15m alert for ${cls.title}`);

        const payload = JSON.stringify({
          title: `JEE Live in ${diffMin} mins`,
          body: `${cls.subject}: ${cls.title} with ${cls.faculty}.`,
          url: `/#classroom/${cls.id}`,
          classId: cls.id,
        });

        for (const sub of subscriptions) {
          try {
            if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
              await webpush.sendNotification(sub as any, payload);
            }
          } catch (e) {
            // Subscription may have expired
          }
        }
      }

      if (diffMin <= 0 && diffMin >= -5 && !cls.notification_live_sent) {
        cls.notification_live_sent = true;
        dispatched.push(`Live alert for ${cls.title}`);

        const payload = JSON.stringify({
          title: `🔴 Class is Live Now!`,
          body: `${cls.subject}: ${cls.title}. Stream has started!`,
          url: `/#classroom/${cls.id}`,
          classId: cls.id,
        });

        for (const sub of subscriptions) {
          try {
            if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
              await webpush.sendNotification(sub as any, payload);
            }
          } catch (e) {
            // Subscription may have expired
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      dispatchedCount: dispatched.length,
      dispatched,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
