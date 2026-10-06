import express from 'express';
import type { Request, Response } from 'express';
const { Router } = express;
import webpush from 'web-push';
import {
  getAllClasses,
  getClassById,
  createClass,
  updateClass,
  deleteClass,
  savePushSubscription,
  getPushSubscriptions,
  resetClasses,
  clearAllClasses,
  getAllServerBookmarks,
  addServerBookmark,
  deleteServerBookmark,
  getAllServerStudyRecords,
  saveServerStudyRecords,
  getServerAttendance,
  saveServerAttendance,
  syncClasses,
} from './db.ts';
import { extractYouTubeId, verifyYouTubeEmbeddability } from '../lib/youtube.ts';
import { checkScheduleOverlap } from '../lib/overlap.ts';

export const apiRouter = Router();

// Configure Web Push if keys are present
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

// 1. Get all scheduled classes
apiRouter.get('/classes', async (req: Request, res: Response) => {
  try {
    const classes = await getAllClasses();
    res.json({ classes });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Get single class by ID
apiRouter.get('/classes/:id', async (req: Request, res: Response) => {
  try {
    const cls = await getClassById(req.params.id);
    if (!cls) {
      return res.status(404).json({ error: 'Class not found' });
    }
    res.json({ class: cls });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Reset classes to fresh timetable
apiRouter.post('/classes/reset', async (req: Request, res: Response) => {
  try {
    const classes = await resetClasses();
    res.json({ success: true, classes });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 2b. Clear all classes from timetable
apiRouter.post('/classes/clear', async (req: Request, res: Response) => {
  try {
    await clearAllClasses();
    res.json({ success: true, classes: [] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 2c. Bidirectional class schedule synchronization (protects multi-month scheduled classes)
apiRouter.post('/classes/sync', async (req: Request, res: Response) => {
  try {
    const { classes: clientClasses } = req.body;
    const synced = await syncClasses(clientClasses);
    res.json({ success: true, classes: synced });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Admin Authentication Login
apiRouter.post('/admin/login', (req: Request, res: Response) => {
  const { password } = req.body;
  const configuredPassword = process.env.ADMIN_PASSWORD || 'insprioLive@7858';

  if (password && password.trim() === configuredPassword.trim()) {
    const token = Buffer.from(`admin:${Date.now()}`).toString('base64');
    return res.json({ success: true, token });
  }

  return res.status(401).json({ error: 'Invalid admin credentials. Please enter the authorized administrator password.' });
});

// 4. Verify YouTube embeddability
apiRouter.post('/check-embeddability', async (req: Request, res: Response) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  const result = await verifyYouTubeEmbeddability(url);
  res.json(result);
});

// 5. Create new class with overlap and embeddability check
apiRouter.post('/classes', async (req: Request, res: Response) => {
  try {
    const { title, subject, faculty, topic, description, youtube_url, start_at, duration_min } = req.body;

    if (!title || !youtube_url || !start_at || !duration_min) {
      return res.status(400).json({ error: 'Missing required class fields' });
    }

    const youtube_id = extractYouTubeId(youtube_url);
    if (!youtube_id) {
      return res.status(400).json({ error: 'Invalid YouTube URL or ID' });
    }

    const existingClasses = await getAllClasses();

    // Check overlap
    const overlap = checkScheduleOverlap(
      {
        start_at,
        duration_min: Number(duration_min),
      },
      existingClasses
    );

    if (overlap.hasOverlap) {
      return res.status(409).json({
        error: 'Overlap Conflict',
        message: overlap.message,
        conflictingClass: overlap.conflictingClass,
      });
    }

    // Embeddability validation
    const embedResult = await verifyYouTubeEmbeddability(youtube_id);

    const newClass = await createClass({
      title: title.trim(),
      subject: subject || 'Physics',
      faculty: faculty ? faculty.trim() : 'JEE Faculty',
      topic: topic ? topic.trim() : undefined,
      description: description ? description.trim() : undefined,
      youtube_url,
      youtube_id,
      start_at: new Date(start_at).toISOString(),
      duration_min: Number(duration_min),
      is_embeddable: embedResult.isEmbeddable,
      thumbnail_url: embedResult.thumbnailUrl || `https://img.youtube.com/vi/${youtube_id}/hqdefault.jpg`,
    });

    res.status(201).json({ class: newClass, warning: embedResult.isEmbeddable ? null : embedResult.reason });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 6. Update class
apiRouter.put('/classes/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    if (updates.youtube_url) {
      const extracted = extractYouTubeId(updates.youtube_url);
      if (extracted) {
        updates.youtube_id = extracted;
      }
    }

    if (updates.start_at || updates.duration_min) {
      const existingClasses = await getAllClasses();
      const current = await getClassById(id);
      if (!current) return res.status(404).json({ error: 'Class not found' });

      const overlap = checkScheduleOverlap(
        {
          id,
          start_at: updates.start_at || current.start_at,
          duration_min: Number(updates.duration_min || current.duration_min),
        },
        existingClasses
      );

      if (overlap.hasOverlap) {
        return res.status(409).json({
          error: 'Overlap Conflict',
          message: overlap.message,
          conflictingClass: overlap.conflictingClass,
        });
      }
    }

    const updated = await updateClass(id, updates);
    if (!updated) {
      return res.status(404).json({ error: 'Class not found' });
    }
    res.json({ class: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 7. Delete class
apiRouter.delete('/classes/:id', async (req: Request, res: Response) => {
  try {
    const success = await deleteClass(req.params.id);
    if (!success) {
      return res.status(404).json({ error: 'Class not found' });
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 8. Register push subscription
apiRouter.post('/push/subscribe', async (req: Request, res: Response) => {
  try {
    const { subscription, userAgent } = req.body;
    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ error: 'Invalid subscription object' });
    }

    await savePushSubscription({
      endpoint: subscription.endpoint,
      keys: subscription.keys,
      userAgent,
    });

    res.json({ success: true, message: 'Subscription saved' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 9. Vercel Cron Endpoint: check classes and dispatch push
apiRouter.get('/cron/check-notifications', async (req: Request, res: Response) => {
  try {
    const now = Date.now();
    const classes = await getAllClasses();
    const subscriptions = await getPushSubscriptions();

    const notificationsDispatched: Array<{ classId: string; title: string; type: string }> = [];

    for (const cls of classes) {
      const startTime = new Date(cls.start_at).getTime();
      const diffMs = startTime - now;
      const diffMin = Math.round(diffMs / 60000);

      // Check for 15-minute alert
      if (diffMin <= 15 && diffMin > 0 && !cls.notification_15m_sent) {
        cls.notification_15m_sent = true;
        notificationsDispatched.push({
          classId: cls.id,
          title: `Starts in ${diffMin}m: ${cls.title}`,
          type: '15m_reminder',
        });

        // Send push to all stored subscriptions
        const payload = JSON.stringify({
          title: `JEE Live in ${diffMin} mins`,
          body: `${cls.subject}: ${cls.title} with ${cls.faculty}. Tap to prepare your notebook.`,
          url: `/classroom/${cls.id}`,
          classId: cls.id,
        });

        for (const sub of subscriptions) {
          try {
            if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
              await webpush.sendNotification(sub as any, payload);
            }
          } catch (e) {
            console.warn('Failed push send to subscriber:', e);
          }
        }
      }

      // Check for Live Now alert
      if (diffMin <= 0 && diffMin >= -5 && !cls.notification_live_sent) {
        cls.notification_live_sent = true;
        notificationsDispatched.push({
          classId: cls.id,
          title: `Live Now: ${cls.title}`,
          type: 'live_now',
        });

        const payload = JSON.stringify({
          title: `🔴 Class is Live Now!`,
          body: `${cls.subject}: ${cls.title}. Clock-locked stream has started. Join now!`,
          url: `/classroom/${cls.id}`,
          classId: cls.id,
        });

        for (const sub of subscriptions) {
          try {
            if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
              await webpush.sendNotification(sub as any, payload);
            }
          } catch (e) {
            console.warn('Failed push send to subscriber:', e);
          }
        }
      }
    }

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      activeSubscribers: subscriptions.length,
      dispatchedCount: notificationsDispatched.length,
      notificationsDispatched,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// Long-Term Persistence Routes: Bookmarks, Study Hours, Attendance
// -------------------------------------------------------------

// Bookmarks
apiRouter.get('/bookmarks', async (req: Request, res: Response) => {
  try {
    const list = await getAllServerBookmarks();
    res.json({ bookmarks: list });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/bookmarks', async (req: Request, res: Response) => {
  try {
    const bm = req.body;
    if (!bm || !bm.classId || typeof bm.seconds !== 'number') {
      return res.status(400).json({ error: 'Missing required bookmark parameters' });
    }
    const saved = await addServerBookmark(bm);
    res.status(201).json({ success: true, bookmark: saved });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.delete('/bookmarks/:id', async (req: Request, res: Response) => {
  try {
    const deleted = await deleteServerBookmark(req.params.id);
    res.json({ success: deleted });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Study Records (Hours tracked)
apiRouter.get('/study-records', async (req: Request, res: Response) => {
  try {
    const records = await getAllServerStudyRecords();
    res.json({ records });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/study-records', async (req: Request, res: Response) => {
  try {
    const { records } = req.body;
    if (Array.isArray(records)) {
      await saveServerStudyRecords(records);
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Attendance Records
apiRouter.get('/attendance', async (req: Request, res: Response) => {
  try {
    const map = await getServerAttendance();
    res.json({ attendance: map });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/attendance', async (req: Request, res: Response) => {
  try {
    const { attendance } = req.body;
    if (attendance && typeof attendance === 'object') {
      await saveServerAttendance(attendance);
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

