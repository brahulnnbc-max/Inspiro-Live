// Lecture Key Moment & Mistake Bookmark Vault (Dual Client & Server Long-Term Persistence)
export type BookmarkCategory = 'mistake' | 'formula' | 'derivation' | 'doubt';

export interface LectureBookmark {
  id: string;
  classId: string;
  seconds: number;
  timestampFormatted: string; // e.g. "24:15"
  category: BookmarkCategory;
  note: string;
  createdAt: string;
}

const STORAGE_KEY = 'inspiro_lecture_bookmarks_v1';

// Initial sync flag
let hasSyncedWithServer = false;

export function getAllBookmarks(): LectureBookmark[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

export function getBookmarksForClass(classId: string): LectureBookmark[] {
  const all = getAllBookmarks();
  return all
    .filter(b => b.classId === classId)
    .sort((a, b) => a.seconds - b.seconds);
}

/**
 * Sync server bookmarks with local storage on startup
 */
export async function syncServerBookmarks(): Promise<void> {
  if (hasSyncedWithServer || typeof window === 'undefined') return;
  try {
    const res = await fetch('/api/bookmarks');
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.bookmarks)) {
        const local = getAllBookmarks();
        // Merge without duplicates
        const map = new Map<string, LectureBookmark>();
        local.forEach(b => map.set(b.id, b));
        data.bookmarks.forEach((b: LectureBookmark) => map.set(b.id, b));

        const merged = Array.from(map.values());
        localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
        hasSyncedWithServer = true;
        window.dispatchEvent(new CustomEvent('inspiro_bookmarks_updated'));
      }
    }
  } catch (err) {
    // Local fallback
  }
}

// Automatically initiate sync in browser
if (typeof window !== 'undefined') {
  syncServerBookmarks();
}

export function addBookmark(
  classId: string,
  seconds: number,
  category: BookmarkCategory,
  note: string
): LectureBookmark {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const timestampFormatted = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

  const newBookmark: LectureBookmark = {
    id: `bm-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    classId,
    seconds: Math.floor(seconds),
    timestampFormatted,
    category,
    note: note.trim() || 'Key Lecture Timestamp',
    createdAt: new Date().toISOString(),
  };

  const all = getAllBookmarks();
  all.push(newBookmark);

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    window.dispatchEvent(new CustomEvent('inspiro_bookmarks_updated', { detail: { classId } }));
  } catch (e) {
    // Ignore
  }

  // Persist to server for multi-year long-term safety
  fetch('/api/bookmarks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(newBookmark),
  }).catch(() => {});

  return newBookmark;
}

export function deleteBookmark(id: string): void {
  const all = getAllBookmarks().filter(b => b.id !== id);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    window.dispatchEvent(new CustomEvent('inspiro_bookmarks_updated'));
  } catch (e) {
    // Ignore
  }

  fetch(`/api/bookmarks/${id}`, {
    method: 'DELETE',
  }).catch(() => {});
}
