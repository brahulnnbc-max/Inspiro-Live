import React, { useState, useEffect, useMemo } from 'react';
import {
  Bookmark,
  Play,
  Trash2,
  Search,
  Filter,
  Download,
  ArrowLeft,
  Clock,
  ExternalLink,
  BookOpen,
  Sparkles,
  CheckCircle2,
} from 'lucide-react';
import { JEEClass, JEEClassSubject } from '../types/class';
import {
  getAllBookmarks,
  deleteBookmark,
  LectureBookmark,
  BookmarkCategory,
} from '../lib/bookmarkStore';

interface Props {
  classes: JEEClass[];
  onGoToMoment: (targetClass: JEEClass, seconds: number) => void;
  onBackToTimetable: () => void;
}

export const MomentsTable: React.FC<Props> = ({
  classes,
  onGoToMoment,
  onBackToTimetable,
}) => {
  const [bookmarks, setBookmarks] = useState<LectureBookmark[]>(() => getAllBookmarks());
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSubject, setSelectedSubject] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Listen to bookmark updates
  useEffect(() => {
    const handleUpdate = () => {
      setBookmarks(getAllBookmarks());
    };
    window.addEventListener('inspiro_bookmarks_updated', handleUpdate);
    return () => window.removeEventListener('inspiro_bookmarks_updated', handleUpdate);
  }, []);

  // Map bookmarks with their class details
  const enrichedBookmarks = useMemo(() => {
    return bookmarks.map((bm) => {
      const cls = classes.find((c) => c.id === bm.classId);
      return {
        ...bm,
        classObj: cls,
        classTitle: cls?.title || 'JEE Lecture',
        subject: cls?.subject || ('General' as JEEClassSubject),
        faculty: cls?.faculty || 'Faculty Specialist',
      };
    });
  }, [bookmarks, classes]);

  // Filtered list
  const filteredList = useMemo(() => {
    return enrichedBookmarks.filter((item) => {
      // Subject filter
      if (selectedSubject !== 'all' && item.subject !== selectedSubject) {
        return false;
      }
      // Category filter
      if (selectedCategory !== 'all' && item.category !== selectedCategory) {
        return false;
      }
      // Search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const inNote = item.note.toLowerCase().includes(query);
        const inTitle = item.classTitle.toLowerCase().includes(query);
        const inSubject = item.subject.toLowerCase().includes(query);
        if (!inNote && !inTitle && !inSubject) return false;
      }
      return true;
    });
  }, [enrichedBookmarks, selectedSubject, selectedCategory, searchQuery]);

  // Category counts
  const categoryCounts = useMemo(() => {
    const counts = { mistake: 0, formula: 0, derivation: 0, doubt: 0 };
    bookmarks.forEach((b) => {
      if (counts[b.category] !== undefined) counts[b.category]++;
    });
    return counts;
  }, [bookmarks]);

  // Export notes as formatted text file
  const handleExportNotes = () => {
    if (bookmarks.length === 0) return;
    let content = `INSPRO LIVE - JEE MOMENTS & REVISION NOTES\nExported: ${new Date().toLocaleString()}\nTotal Moments: ${bookmarks.length}\n`;
    content += `=======================================================\n\n`;

    filteredList.forEach((item, idx) => {
      content += `[${idx + 1}] ${item.timestampFormatted} - ${item.subject}: ${item.classTitle}\n`;
      content += `    Category: ${item.category.toUpperCase()}\n`;
      content += `    Faculty:  ${item.faculty}\n`;
      content += `    Note:     ${item.note}\n`;
      content += `    Created:  ${new Date(item.createdAt).toLocaleString()}\n\n`;
    });

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `inspiro_jee_moments_${Date.now()}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const getSubjectBadge = (subject: string) => {
    switch (subject) {
      case 'Physics':
        return 'bg-sky-500/20 text-sky-300 border-sky-500/40';
      case 'Chemistry':
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
      case 'Mathematics':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
      default:
        return 'bg-slate-800 text-slate-300 border-slate-700';
    }
  };

  const getCategoryBadge = (category: BookmarkCategory) => {
    switch (category) {
      case 'mistake':
        return { label: 'Mistake Trap', icon: '⚠️', bg: 'bg-red-500/20 text-red-300 border-red-500/40' };
      case 'formula':
        return { label: 'Formula / Law', icon: '📐', bg: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40' };
      case 'derivation':
        return { label: 'Derivation Step', icon: '💡', bg: 'bg-amber-500/20 text-amber-300 border-amber-500/40' };
      case 'doubt':
        return { label: 'Doubt / Review', icon: '❓', bg: 'bg-purple-500/20 text-purple-300 border-purple-500/40' };
      default:
        return { label: 'Note', icon: '🔖', bg: 'bg-slate-800 text-slate-300 border-slate-700' };
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      {/* Top Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <button
              onClick={onBackToTimetable}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-900 border border-slate-800 transition-colors"
              title="Back to Timetable"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2.5">
              <span>Saved Moments & Notes Table</span>
              <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-mono text-xs border border-amber-500/40">
                {bookmarks.length} {bookmarks.length === 1 ? 'Moment' : 'Moments'}
              </span>
            </h1>
          </div>
          <p className="text-xs text-slate-400 pl-8">
            Click any row's <strong className="text-amber-300">Go to Moment</strong> button to jump straight to that timestamp in the lecture video.
          </p>
        </div>

        {/* Quick Actions */}
        <div className="flex items-center gap-2.5 self-start md:self-auto">
          {bookmarks.length > 0 && (
            <button
              onClick={handleExportNotes}
              className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 rounded-xl text-xs font-medium transition-colors flex items-center gap-1.5 shadow-sm"
              title="Download all notes as text file"
            >
              <Download className="w-3.5 h-3.5 text-sky-400" />
              <span>Export Notes</span>
            </button>
          )}
          <button
            onClick={onBackToTimetable}
            className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5"
          >
            <span>Live Timetable</span>
          </button>
        </div>
      </div>

      {/* Filter & Search Strip */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3 sm:p-4 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Search Input */}
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search notes, formulas, topics, or faculty..."
            className="w-full pl-9 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/60 transition-colors"
          />
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Subject Selector */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-medium">
            {['all', 'Physics', 'Chemistry', 'Mathematics'].map((subj) => (
              <button
                key={subj}
                onClick={() => setSelectedSubject(subj)}
                className={`px-2.5 py-1 rounded-lg transition-colors whitespace-nowrap ${
                  selectedSubject === subj
                    ? 'bg-amber-500 text-slate-950 font-bold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {subj === 'all' ? 'All Subjects' : subj}
              </button>
            ))}
          </div>

          {/* Category Dropdown */}
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="bg-slate-950 border border-slate-800 text-slate-300 text-xs font-medium rounded-xl px-2.5 py-1.5 focus:outline-none focus:border-amber-500/60"
          >
            <option value="all">All Classifications ({bookmarks.length})</option>
            <option value="mistake">⚠️ Mistakes ({categoryCounts.mistake})</option>
            <option value="formula">📐 Formulas ({categoryCounts.formula})</option>
            <option value="derivation">💡 Derivations ({categoryCounts.derivation})</option>
            <option value="doubt">❓ Doubts ({categoryCounts.doubt})</option>
          </select>
        </div>
      </div>

      {/* The Moments Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
        {filteredList.length === 0 ? (
          <div className="text-center py-16 px-4 space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center mx-auto">
              <Bookmark className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-white">
              {bookmarks.length === 0 ? 'No Moments Saved Yet' : 'No Matching Moments Found'}
            </h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
              {bookmarks.length === 0
                ? 'During any live broadcast or replay lecture, click the "Note Moment" button (or press "B") to clip key derivation steps, formulas, and tricky mistakes.'
                : 'Try adjusting your search query or subject filters above.'}
            </p>
            {bookmarks.length === 0 && (
              <button
                onClick={onBackToTimetable}
                className="mt-2 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl transition-colors inline-flex items-center gap-2"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Go to Live Timetable</span>
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-950/80 border-b border-slate-800 text-[11px] font-mono text-slate-400 uppercase tracking-wider select-none">
                  <th className="py-3 px-4 w-28">Timestamp</th>
                  <th className="py-3 px-4 w-52 sm:w-64">Class & Subject</th>
                  <th className="py-3 px-4 w-36">Type</th>
                  <th className="py-3 px-4 min-w-[200px]">Your Note & Observation</th>
                  <th className="py-3 px-4 w-36 text-center">Instant Jump</th>
                  <th className="py-3 px-3 w-12 text-center"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-xs">
                {filteredList.map((item) => {
                  const catBadge = getCategoryBadge(item.category);
                  const subjBadge = getSubjectBadge(item.subject);

                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-slate-800/40 transition-colors group"
                    >
                      {/* Timestamp */}
                      <td className="py-3.5 px-4 font-mono whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/15 text-amber-300 font-bold border border-amber-500/30 text-xs shadow-sm">
                          <Clock className="w-3 h-3 text-amber-400" />
                          <span>{item.timestampFormatted}</span>
                        </span>
                      </td>

                      {/* Class & Subject */}
                      <td className="py-3.5 px-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold font-mono uppercase border ${subjBadge}`}>
                              {item.subject}
                            </span>
                          </div>
                          <h4 className="text-white font-semibold text-xs leading-snug line-clamp-2">
                            {item.classTitle}
                          </h4>
                          <span className="text-[11px] text-slate-400 block font-mono">
                            {item.faculty}
                          </span>
                        </div>
                      </td>

                      {/* Category */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border ${catBadge.bg}`}>
                          <span>{catBadge.icon}</span>
                          <span>{catBadge.label}</span>
                        </span>
                      </td>

                      {/* Note */}
                      <td className="py-3.5 px-4">
                        <p className="text-slate-200 leading-relaxed break-words font-sans text-xs bg-slate-950/40 p-2.5 rounded-xl border border-slate-800/60">
                          {item.note}
                        </p>
                      </td>

                      {/* Instant Action */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        {item.classObj ? (
                          <button
                            onClick={() => onGoToMoment(item.classObj!, item.seconds)}
                            className="px-3.5 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-1.5 hover:scale-[1.02] active:scale-[0.98] mx-auto"
                            title={`Jump straight to ${item.timestampFormatted} in ${item.classTitle}`}
                          >
                            <Play className="w-3 h-3 fill-current" />
                            <span>Go to Moment</span>
                          </button>
                        ) : (
                          <span className="text-[11px] text-slate-500 font-mono">
                            Archived Class
                          </span>
                        )}
                      </td>

                      {/* Delete */}
                      <td className="py-3.5 px-3 text-center">
                        <button
                          onClick={() => deleteBookmark(item.id)}
                          className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-slate-800 rounded-lg transition-colors"
                          title="Delete this moment"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Table Footer */}
        {filteredList.length > 0 && (
          <div className="px-4 py-3 bg-slate-950/80 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
            <span className="font-mono text-[11px] text-emerald-400 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>All moments backed up permanently to long-term storage</span>
            </span>
            <span className="font-mono text-[11px] text-slate-400">
              Showing {filteredList.length} of {bookmarks.length} moments
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
