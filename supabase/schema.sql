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
    thumbnail_url TEXT,
    notification_15m_sent BOOLEAN DEFAULT false,
    notification_live_sent BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Ensure thumbnail_url column exists if table was created previously
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;

-- Purge any old dummy default classes if they were previously synced
DELETE FROM public.classes 
WHERE title ILIKE '%Rotational Motion: Moment of Inertia%' 
   OR title ILIKE '%Electrostatics & Gauss Law%' 
   OR title ILIKE '%Definite Integration & Area Under Curves%' 
   OR title ILIKE '%Coordination Chemistry & Crystal Field%';

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

-- Drop existing restrictive policies if present
DROP POLICY IF EXISTS "Public classes read access" ON public.classes;
DROP POLICY IF EXISTS "Admin full access on classes" ON public.classes;
DROP POLICY IF EXISTS "Classes select access" ON public.classes;
DROP POLICY IF EXISTS "Classes insert access" ON public.classes;
DROP POLICY IF EXISTS "Classes update access" ON public.classes;
DROP POLICY IF EXISTS "Classes delete access" ON public.classes;

-- Allow students (anon) and admin API full access to view, schedule, edit, and delete classes
CREATE POLICY "Classes select access"
    ON public.classes
    FOR SELECT
    TO anon, authenticated, service_role
    USING (true);

CREATE POLICY "Classes insert access"
    ON public.classes
    FOR INSERT
    TO anon, authenticated, service_role
    WITH CHECK (true);

CREATE POLICY "Classes update access"
    ON public.classes
    FOR UPDATE
    TO anon, authenticated, service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Classes delete access"
    ON public.classes
    FOR DELETE
    TO anon, authenticated, service_role
    USING (true);

-- Push subscriptions policies
DROP POLICY IF EXISTS "Public can register push subscriptions" ON public.push_subscriptions;
DROP POLICY IF EXISTS "Service role push subscriptions read" ON public.push_subscriptions;
DROP POLICY IF EXISTS "Push subscriptions full access" ON public.push_subscriptions;

CREATE POLICY "Push subscriptions full access"
    ON public.push_subscriptions
    FOR ALL
    TO anon, authenticated, service_role
    USING (true)
    WITH CHECK (true);

