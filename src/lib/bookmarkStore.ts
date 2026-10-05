// Lecture Key Moment & Mistake Bookmark Vault
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
}
