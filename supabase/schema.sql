-- ==============================================================================
-- JEE LiveSync Database Schema (Supabase / PostgreSQL)
-- ==============================================================================

-- 1. Classes Table
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

-- Index for querying timetable chronologically
CREATE INDEX IF NOT EXISTS idx_classes_start_at ON public.classes (start_at);

-- 2. Push Subscriptions Table
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    endpoint TEXT UNIQUE NOT NULL,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 3. Row Level Security (RLS)
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Allow anyone (students) to view scheduled classes
CREATE POLICY "Public classes read access"
    ON public.classes
    FOR SELECT
    TO anon, authenticated
    USING (true);

-- Allow service role (or admin API) full access to classes
CREATE POLICY "Admin full access on classes"
    ON public.classes
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Allow anyone to register push subscriptions
CREATE POLICY "Public can register push subscriptions"
    ON public.push_subscriptions
    FOR INSERT
    TO anon, authenticated
    WITH CHECK (true);

-- Allow service role to read push subscriptions for cron dispatch
CREATE POLICY "Service role push subscriptions read"
    ON public.push_subscriptions
    FOR SELECT
    TO service_role
    USING (true);
