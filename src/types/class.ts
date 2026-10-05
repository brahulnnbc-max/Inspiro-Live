export type JEEClassSubject = 'Physics' | 'Chemistry' | 'Mathematics';

export interface JEEClass {
  id: string;
  title: string;
  subject: JEEClassSubject;
  faculty: string;
  topic?: string;
  description?: string;
  youtube_url: string;
  youtube_id: string;
  start_at: string; // ISO 8601 string
  duration_min: number;
  is_embeddable: boolean;
  notification_15m_sent?: boolean;
  notification_live_sent?: boolean;
  created_at?: string;
  thumbnail_url?: string;
}

export type ClassStatus = 'upcoming' | 'live' | 'ended';

export interface OverlapResult {
  hasOverlap: boolean;
  conflictingClass?: JEEClass;
  message?: string;
}

export interface EmbeddabilityResult {
  isEmbeddable: boolean;
  title?: string;
  authorName?: string;
  thumbnailUrl?: string;
  reason?: string;
}

export interface PushSubscriptionData {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  userAgent?: string;
}
