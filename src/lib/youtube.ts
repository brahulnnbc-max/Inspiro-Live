import type { EmbeddabilityResult } from '../types/class.ts';

/**
 * Extracts a YouTube Video ID from any valid YouTube URL or raw ID string.
 */
export function extractYouTubeId(urlOrId: string): string | null {
  if (!urlOrId) return null;
  const trimmed = urlOrId.trim();

  // If it's already an 11-char ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }

  // Regex covering standard watch, youtu.be, embed, shorts, and live URLs
  const regExp = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?|live|shorts)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
  const match = trimmed.match(regExp);

  return match && match[1] ? match[1] : null;
}

/**
 * Checks YouTube embeddability using YouTube's public oEmbed service.
 * Videos with embedding disabled by creator will return HTTP 401 or 403.
 */
export async function verifyYouTubeEmbeddability(videoIdOrUrl: string): Promise<EmbeddabilityResult> {
  const videoId = extractYouTubeId(videoIdOrUrl);
  if (!videoId) {
    return {
      isEmbeddable: false,
      reason: 'Invalid YouTube link or Video ID provided.',
    };
  }

  const oEmbedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;

  try {
    const res = await fetch(oEmbedUrl);
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        return {
          isEmbeddable: false,
          reason: 'Video embedding is disabled by the creator or restricted to YouTube.com.',
        };
      }
      if (res.status === 404) {
        return {
          isEmbeddable: false,
          reason: 'Video not found, private, or removed.',
        };
      }
      return {
        isEmbeddable: false,
        reason: `YouTube oEmbed returned status ${res.status}`,
      };
    }

    const data = await res.json();
    return {
      isEmbeddable: true,
      title: data.title || 'JEE Lecture',
      authorName: data.author_name || 'Faculty',
      thumbnailUrl: data.thumbnail_url || `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
    };
  } catch (error: any) {
    // If network or CORS blocked in browser, allow fallback if ID looks valid
    console.warn('oEmbed check fallback:', error);
    return {
      isEmbeddable: true,
      title: 'Scheduled JEE Lecture',
      thumbnailUrl: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
    };
  }
}
