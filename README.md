# JEE LiveSync Classroom

A distraction-free, live-style synchronized YouTube lecture timetable and clock-locked player built for JEE Main & JEE Advanced aspirants.

---

## Key Features

1. **Clock-Locked Synchronized Classroom**:
   - Lectures begin exactly at the scheduled Indian Standard Time (IST, UTC+05:30).
   - **Late Joiner Wall-Clock Sync**: Late attendees start at `elapsed_time = now - scheduled_start_time`.
   - **Scrubbing & Seek Prevention**: Fast-forwarding and seeking are blocked to recreate authentic in-person classroom discipline.
   - **Reconnection Catch-up**: Reconnecting or switching tabs automatically snaps back to current live stream wall-clock time.
   - **Replay Mode**: Free seeking and revision controls unlock after the scheduled broadcast concludes.
   - **Discipline Notice**: Built-in disclaimer clarifying that web browsers cannot prevent opening the video directly on YouTube outside the app.

2. **Student Timetable & Schedule**:
   - Filter by Today's Schedule, Upcoming, Past Replays, and Subject (Physics, Chemistry, Mathematics).
   - Live countdowns to upcoming sessions and real-time progress bars for in-session classes.
   - High-yield JEE Formula & Theorem Vault with one-click copy.
   - Interactive Digital Scratchpad / Rough Workpad for step-by-step problem calculations.

3. **Faculty & Admin Panel (`/admin`)**:
   - Password-protected access (Default password: `jee-admin-2025` or custom `ADMIN_PASSWORD`).
   - Add single classes or bulk schedule multiple YouTube URLs.
   - **Automatic Embeddability Verification**: Uses YouTube's oEmbed API to verify whether video embedding is enabled by the creator.
   - **Schedule Overlap Validation**: Flags time conflicts before publishing to avoid double-booking slots.
   - Edit titles, faculty names, durations, and manage the timetable.

4. **Web Push & Browser Notifications**:
   - VAPID-based opt-in Web Push notifications for 15-minute reminders and class start announcements.
   - Vercel Cron endpoint (`/api/cron/check-notifications`) running every minute to dispatch alerts.
   - Browser audio chime fallback using the Web Audio API.

---

## Environment Variables

Copy `.env.example` to `.env`:

```bash
# Supabase Configuration (Optional - Persistent fallback is active if unset)
NEXT_PUBLIC_SUPABASE_URL="https://your-project.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="your-anon-key-here"
SUPABASE_SERVICE_ROLE_KEY="your-service-role-key-here"

# Admin Authentication
ADMIN_PASSWORD="jee-admin-2025"

# Web Push Notifications (VAPID)
# Generate via: npx web-push generate-vapid-keys
VAPID_PUBLIC_KEY="your-vapid-public-key"
VAPID_PRIVATE_KEY="your-vapid-private-key"
VAPID_SUBJECT="mailto:admin@jeelivesync.edu"

# Base Application URL
NEXT_PUBLIC_APP_URL="https://your-app.vercel.app"
```

---

## Setting Up Supabase Database

1. Create a project on [Supabase](https://supabase.com).
2. Go to **SQL Editor** in the Supabase Dashboard.
3. Paste and run the schema from `supabase/schema.sql`:

```sql
CREATE TABLE IF NOT EXISTS public.classes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    subject TEXT NOT NULL CHECK (subject IN ('Physics', 'Chemistry', 'Mathematics')),
    faculty TEXT DEFAULT 'Faculty',
    topic TEXT,
    description TEXT,
    youtube_url TEXT NOT NULL,
    youtube_id TEXT NOT NULL,
    start_at TIMESTAMPTZ NOT NULL,
    duration_min INTEGER NOT NULL CHECK (duration_min > 0),
    is_embeddable BOOLEAN NOT NULL DEFAULT true,
    notification_15m_sent BOOLEAN DEFAULT false,
    notification_live_sent BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
```

4. Add your `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to your environment settings.

---

## Generating Web Push VAPID Keys

Generate VAPID keys for push notifications with:

```bash
npx web-push generate-vapid-keys
```

Copy the generated Public Key to `VAPID_PUBLIC_KEY` and the Private Key to `VAPID_PRIVATE_KEY`.

---

## Vercel Deployment

1. Push this repository to GitHub or GitLab.
2. In [Vercel](https://vercel.com), click **Add New Project** and select the repository.
3. In **Environment Variables**, add:
   - `ADMIN_PASSWORD`
   - `NEXT_PUBLIC_APP_URL`
   - `VAPID_PUBLIC_KEY`
   - `VAPID_PRIVATE_KEY`
   - `NEXT_PUBLIC_SUPABASE_URL` (optional)
   - `SUPABASE_SERVICE_ROLE_KEY` (optional)
4. Click **Deploy**. Vercel will automatically detect `vercel.json` and configure the Cron job for `/api/cron/check-notifications` every minute!

---

## Local Development

```bash
npm install
npm run dev
```

Visit `http://localhost:3000` to access the application.
