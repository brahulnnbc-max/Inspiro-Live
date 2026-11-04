import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Calendar,
  Clock,
  FileText,
  FolderOpen,
  Image as ImageIcon,
  Lock,
  Monitor,
  Play,
  ShieldAlert,
  Smartphone,
  Upload,
  X,
} from 'lucide-react';
import {
  BroadcastOrientation,
  LiveSession,
  SessionCategory,
  SlideDescriptor,
  SlideSourceType,
  Subject,
} from '../types';
import { inspectAndCachePdfBlob } from '../lib/pdfEngine';
import { createLockedSession, saveMediaBlob } from '../lib/storage';

interface ScheduleModalProps {
  isNightMode: boolean;
  onClose: () => void;
  onSessionLocked: (session: LiveSession, autoOpenFullscreen: boolean) => void;
}

type StartPreset = 'EXACT_CLOCK' | 'INSTANT_NOW';
type Meridiem = 'AM' | 'PM';

function formatLocalDateYMD(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function addDaysToYMD(daysFromToday: number): string {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + daysFromToday);
  return formatLocalDateYMD(d);
}

function extract12HourParts(d: Date): {
  dateStr: string;
  hour12: number;
  minute: number;
  meridiem: Meridiem;
} {
  const h24 = d.getHours();
  const meridiem: Meridiem = h24 >= 12 ? 'PM' : 'AM';
  const raw12 = h24 % 12;
  const hour12 = raw12 === 0 ? 12 : raw12;
  return {
    dateStr: formatLocalDateYMD(d),
    hour12,
    minute: d.getMinutes(),
    meridiem,
  };
}

function buildLocalTimestamp(
  dateStr: string,
  hour12: number,
  minute: number,
  meridiem: Meridiem
): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const monthIdx = Number(match[2]) - 1;
  const day = Number(match[3]);

  let hour24 = hour12 % 12;
  if (meridiem === 'PM') {
    hour24 += 12;
  }

  const dt = new Date(year, monthIdx, day, hour24, minute, 0, 0);
  const ms = dt.getTime();
  return Number.isFinite(ms) ? ms : null;
}

function formatFullDateClock(ms: number): string {
  return new Date(ms).toLocaleString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatHMSCountdown(ms: number): string {
  const sec = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m ${String(s).padStart(
    2,
    '0'
  )}s`;
}

const HOURS_12 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const MINUTES_60 = Array.from({ length: 60 }, (_, i) => i);

export const ScheduleModal: React.FC<ScheduleModalProps> = ({
  isNightMode,
  onClose,
  onSessionLocked,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);

  // Initialize default schedule 30 minutes ahead in exact local wall-clock parts
  const initialTarget = useMemo(() => {
    const t = new Date(Date.now() + 30 * 60 * 1000);
    t.setSeconds(0, 0);
    return extract12HourParts(t);
  }, []);

  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [subject, setSubject] = useState<Subject>(Subject.PHYSICS);
  const [chapterName, setChapterName] = useState('');
  const [orientation, setOrientation] = useState<BroadcastOrientation>(
    BroadcastOrientation.LANDSCAPE
  );

  // Default strictly to SCHEDULED TIME LOCK so uploaded PDFs never go live by accident
  const [startPreset, setStartPreset] = useState<StartPreset>('EXACT_CLOCK');
  const [dateStr, setDateStr] = useState<string>(initialTarget.dateStr);
  const [hour12, setHour12] = useState<number>(initialTarget.hour12);
  const [minute, setMinute] = useState<number>(initialTarget.minute);
  const [meridiem, setMeridiem] = useState<Meridiem>(initialTarget.meridiem);

  const [baseSeconds, setBaseSeconds] = useState<number>(50);
  const [emergencySeconds, setEmergencySeconds] = useState<number>(45);

  const [isScanning, setIsScanning] = useState(false);
  const [scanSummary, setScanSummary] = useState<string>('');
  const [pendingSlides, setPendingSlides] = useState<SlideDescriptor[]>([]);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [confirmLockStep, setConfirmLockStep] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Live 500ms wall-clock ticker inside modal so countdown & past-time check stay real-time
  useEffect(() => {
    const id = window.setInterval(() => {
      setNowMs(Date.now());
    }, 500);
    return () => window.clearInterval(id);
  }, []);

  const applyQuickOffsetMinutes = (minsAhead: number) => {
    const target = new Date(Date.now() + minsAhead * 60 * 1000);
    target.setSeconds(0, 0);
    // Ensure target is strictly ahead of current second even when seconds get zeroed
    if (target.getTime() <= Date.now() + 10 * 1000) {
      target.setMinutes(target.getMinutes() + 1);
    }
    const parts = extract12HourParts(target);
    setStartPreset('EXACT_CLOCK');
    setDateStr(parts.dateStr);
    setHour12(parts.hour12);
    setMinute(parts.minute);
    setMeridiem(parts.meridiem);
    setConfirmLockStep(false);
    setErrorMsg('');
  };

  const applyTomorrow6Am = () => {
    setStartPreset('EXACT_CLOCK');
    setDateStr(addDaysToYMD(1));
    setHour12(6);
    setMinute(0);
    setMeridiem('AM');
    setConfirmLockStep(false);
    setErrorMsg('');
  };

  /**
   * Zero-lag PDF & Image Folder ingestion:
   * Persists File/Blob handles directly without copying multi-MB ArrayBuffers into JS RAM.
   */
  const ingestSelectedFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setErrorMsg('');
    setConfirmLockStep(false);
    setIsScanning(true);

    try {
      const files = Array.from(fileList).filter((f) => {
        const lower = f.name.toLowerCase();
        return (
          lower.endsWith('.pdf') ||
          lower.endsWith('.png') ||
          lower.endsWith('.jpg') ||
          lower.endsWith('.jpeg') ||
          lower.endsWith('.webp')
        );
      });

      files.sort((a, b) =>
        (a.webkitRelativePath || a.name).localeCompare(
          b.webkitRelativePath || b.name,
          undefined,
          { numeric: true, sensitivity: 'base' }
        )
      );

      if (files.length === 0) {
        setErrorMsg('Select PDF chapters or JPG/PNG/WebP note pages.');
        setIsScanning(false);
        return;
      }

      const batchPrefix = `media_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const slides: SlideDescriptor[] = [];
      let pdfCount = 0;
      let imageCount = 0;

      for (let fIdx = 0; fIdx < files.length; fIdx++) {
        const file = files[fIdx];
        const lower = file.name.toLowerCase();

        if (lower.endsWith('.pdf')) {
          pdfCount++;
          const mediaKey = `${batchPrefix}_pdf_${fIdx}`;
          // Save native File Blob directly (zero-copy, <15ms) and inspect page count via Blob URL (<80ms)
          await saveMediaBlob(mediaKey, file);
          const pageCount = await inspectAndCachePdfBlob(mediaKey, file);

          const padDigits = pageCount >= 100 ? 3 : 2;
          for (let p = 1; p <= pageCount; p++) {
            slides.push({
              index: slides.length,
              label: `Page ${String(p).padStart(padDigits, '0')}`,
              sourceType: SlideSourceType.PDF_PAGE,
              mediaKey,
              pdfPageNumber: p,
            });
          }
        } else {
          imageCount++;
          const mediaKey = `${batchPrefix}_img_${fIdx}`;
          await saveMediaBlob(mediaKey, file);
          slides.push({
            index: slides.length,
            label: `Page ${String(slides.length + 1).padStart(2, '0')}`,
            sourceType: SlideSourceType.IMAGE_DATA,
            mediaKey,
          });
        }
      }

      if (!chapterName.trim()) {
        const firstFile = files[0];
        const rel = firstFile.webkitRelativePath;
        if (rel && rel.includes('/')) {
          setChapterName(rel.split('/')[0]);
        } else {
          const clean = firstFile.name
            .replace(/\.[^.]+$/, '')
            .replace(/\(notes\)/gi, '')
            .replace(/_/g, ' ')
            .trim();
          setChapterName(clean || 'Chapter Revision');
        }
      }

      setPendingSlides(slides);

      const parts: string[] = [];
      if (pdfCount > 0) parts.push(`${pdfCount} PDF${pdfCount > 1 ? 's' : ''}`);
      if (imageCount > 0) parts.push(`${imageCount} image${imageCount > 1 ? 's' : ''}`);
      setScanSummary(`${slides.length} pages ready instantly (${parts.join(' + ')})`);
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Could not parse one of the selected PDF/image files.'
      );
    } finally {
      setIsScanning(false);
    }
  };

  const exactTargetMs = buildLocalTimestamp(dateStr, hour12, minute, meridiem);
  const previewStartMs =
    startPreset === 'INSTANT_NOW' ? nowMs : exactTargetMs ?? nowMs;
  const msUntilScheduledOpen =
    startPreset === 'EXACT_CLOCK' && exactTargetMs !== null
      ? exactTargetMs - nowMs
      : 0;
  const isScheduledTimeInPast =
    startPreset === 'EXACT_CLOCK' &&
    (exactTargetMs === null || exactTargetMs <= nowMs + 3000);

  const slideCount = Math.max(pendingSlides.length, 1);
  const minRunSec = slideCount * baseSeconds;
  const maxEmergencyAllowanceSec = slideCount * emergencySeconds;
  const previewHardCloseMs =
    previewStartMs + (minRunSec + maxEmergencyAllowanceSec) * 1000;

  const todayYmd = formatLocalDateYMD(new Date(nowMs));
  const tomorrowYmd = addDaysToYMD(1);
  const dayAfterYmd = addDaysToYMD(2);

  const handlePublishAndLock = async () => {
    setErrorMsg('');
    if (pendingSlides.length === 0) {
      setErrorMsg('Upload a chapter PDF or folder of note images first.');
      return;
    }

    const freshNow = Date.now();
    let finalStartMs = freshNow;

    if (startPreset === 'EXACT_CLOCK') {
      const computed = buildLocalTimestamp(dateStr, hour12, minute, meridiem);
      if (computed === null) {
        setErrorMsg('Select a valid calendar date and exact opening time.');
        return;
      }
      if (computed <= freshNow + 3000) {
        setConfirmLockStep(false);
        setErrorMsg(
          `Selected lock time (${formatFullDateClock(
            computed
          )}) has already passed. Pick a future minute, check AM/PM, or switch to Tomorrow.`
        );
        return;
      }
      finalStartMs = computed;
    }

    if (!confirmLockStep) {
      setConfirmLockStep(true);
      return;
    }

    setIsSaving(true);
    try {
      const lockMoment = Date.now();
      // Re-verify right at commit so a scheduled class NEVER slips into instant live
      if (startPreset === 'EXACT_CLOCK' && finalStartMs <= lockMoment + 1000) {
        setConfirmLockStep(false);
        setIsSaving(false);
        setErrorMsg(
          'The selected clock minute just passed! Choose at least the next upcoming minute to time-lock.'
        );
        return;
      }

      const effectiveStartMs =
        startPreset === 'INSTANT_NOW' ? lockMoment : finalStartMs;
      const hardCloseMs =
        effectiveStartMs +
        pendingSlides.length * (baseSeconds + emergencySeconds) * 1000;
      const cleanChapter = chapterName.trim() || `${subject} Chapter`;

      const session: LiveSession = {
        id: `live_${lockMoment}_${Math.random().toString(36).slice(2, 8)}`,
        title: cleanChapter,
        subject,
        chapterName: cleanChapter,
        scheduledStartMs: effectiveStartMs,
        baseSecondsPerSlide: Math.max(50, baseSeconds),
        emergencySecondsPerSlide: Math.max(45, emergencySeconds),
        hardCloseMs,
        defaultOrientation: orientation,
        slides: pendingSlides,
        lockedAtMs: lockMoment,
        category: SessionCategory.PRIMARY_CHAPTER,
        emergencyUsedBySlide: {},
        attendedSlides: [],
        lateMissedSlides: [],
        starredSlideIndices: [],
        presenceChecksPassed: 0,
        presenceChecksMissed: 0,
        tabSwitchCount: 0,
        recordedReplaysCount: 0,
      };

      await createLockedSession(session);
      onSessionLocked(session, startPreset === 'INSTANT_NOW');
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Failed to lock live broadcast.'
      );
      setIsSaving(false);
    }
  };

  const panelBg = isNightMode
    ? 'bg-[#18181B] border-white/15 text-zinc-100'
    : 'bg-white border-slate-200 text-slate-900';
  const subText = isNightMode ? 'text-zinc-400' : 'text-slate-500';
  const inputBg = isNightMode
    ? 'bg-[#0F0F12] border-white/15 text-white'
    : 'bg-white border-slate-300 text-slate-900';
  const cardMutedBg = isNightMode
    ? 'bg-[#0F0F12] border-white/10'
    : 'bg-slate-50 border-slate-200';

  return (
    <div className="fixed inset-0 z-40 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div
        className={`border rounded-xl w-full max-w-2xl overflow-hidden my-auto ${panelBg}`}
      >
        {/* Header */}
        <div
          className={`flex items-center justify-between px-5 sm:px-6 py-4 border-b ${
            isNightMode ? 'border-white/10' : 'border-slate-200'
          }`}
        >
          <div>
            <h2 className="text-base sm:text-lg font-bold">
              Time-Lock Chapter Broadcast
            </h2>
            <p className={`text-xs mt-0.5 ${subText}`}>
              Current Clock:{' '}
              <span className="font-mono font-semibold">
                {new Date(nowMs).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })}
              </span>{' '}
              · Sealed until exact scheduled time.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`p-2 rounded-lg transition-colors cursor-pointer ${
              isNightMode
                ? 'text-zinc-400 hover:text-white hover:bg-white/10'
                : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
            }`}
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 sm:p-6 space-y-5 max-h-[78vh] overflow-y-auto">
          {/* Step 1: Upload PDF / Folder */}
          <div>
            <label className="block text-xs font-semibold mb-2">
              1. Select Chapter Notes (Zero-Lag PDF / Image Folder)
            </label>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,image/png,image/jpeg,image/webp"
              onChange={(e) => ingestSelectedFiles(e.target.files)}
              className="hidden"
            />
            <input
              ref={(el) => {
                folderInputRef.current = el;
                if (el) {
                  el.setAttribute('webkitdirectory', '');
                  el.setAttribute('directory', '');
                }
              }}
              type="file"
              multiple
              onChange={(e) => ingestSelectedFiles(e.target.files)}
              className="hidden"
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className={`flex items-center justify-center gap-2 px-4 py-3 border border-dashed rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  isNightMode
                    ? 'border-white/20 hover:border-red-500 hover:bg-white/5 text-zinc-100'
                    : 'border-slate-300 hover:border-red-600 hover:bg-red-50/30 text-slate-800'
                }`}
              >
                <Upload className="w-4 h-4 text-red-500 shrink-0" />
                <span>Select Chapter PDF / Images</span>
              </button>

              <button
                type="button"
                onClick={() => folderInputRef.current?.click()}
                className={`flex items-center justify-center gap-2 px-4 py-3 border border-dashed rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  isNightMode
                    ? 'border-white/20 hover:border-red-500 hover:bg-white/5 text-zinc-100'
                    : 'border-slate-300 hover:border-red-600 hover:bg-red-50/30 text-slate-800'
                }`}
              >
                <FolderOpen className="w-4 h-4 text-red-500 shrink-0" />
                <span>Select Chapter Folder</span>
              </button>
            </div>

            {isScanning && (
              <p className="text-xs font-mono text-amber-500 mt-2.5">
                Indexing PDF header...
              </p>
            )}

            {!isScanning && scanSummary && (
              <div
                className={`mt-2.5 flex items-center justify-between px-3.5 py-2.5 border rounded-lg text-xs ${cardMutedBg}`}
              >
                <div className="flex items-center gap-2 font-medium text-emerald-500">
                  {pendingSlides[0]?.sourceType === SlideSourceType.PDF_PAGE ? (
                    <FileText className="w-4 h-4 shrink-0" />
                  ) : (
                    <ImageIcon className="w-4 h-4 shrink-0" />
                  )}
                  <span>{scanSummary}</span>
                </div>
              </div>
            )}
          </div>

          {/* Step 2: Subject & Chapter Name */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1.5">Subject</label>
              <div
                className={`flex p-1 rounded-lg ${
                  isNightMode ? 'bg-[#0F0F12]' : 'bg-slate-100'
                }`}
              >
                {([Subject.PHYSICS, Subject.CHEMISTRY, Subject.MATHEMATICS] as const).map(
                  (subj) => (
                    <button
                      key={subj}
                      type="button"
                      onClick={() => setSubject(subj)}
                      className={`flex-1 py-1.5 px-2 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                        subject === subj
                          ? isNightMode
                            ? 'bg-zinc-800 text-white'
                            : 'bg-white text-slate-900 shadow-xs'
                          : subText
                      }`}
                    >
                      {subj === Subject.MATHEMATICS ? 'Maths' : subj}
                    </button>
                  )
                )}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1.5">
                Chapter Name
              </label>
              <input
                type="text"
                value={chapterName}
                onChange={(e) => setChapterName(e.target.value)}
                placeholder="e.g. Current Electricity"
                className={`w-full px-3 py-2 text-xs border rounded-lg focus:outline-none focus:border-red-500 ${inputBg}`}
              />
            </div>
          </div>

          {/* Step 3: Exact Time-Lock Mode vs Instant Live */}
          <div className="space-y-3">
            <label className="block text-xs font-semibold">
              2. Choose Broadcast Opening Lock
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setStartPreset('EXACT_CLOCK');
                  setConfirmLockStep(false);
                  setErrorMsg('');
                }}
                className={`flex items-center justify-between p-3 rounded-lg border text-left transition-colors cursor-pointer ${
                  startPreset === 'EXACT_CLOCK'
                    ? 'border-red-600 bg-red-600/15'
                    : isNightMode
                    ? 'border-white/15 hover:border-white/30'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Lock className="w-4 h-4 text-red-500 shrink-0" />
                  <div>
                    <div className="text-xs font-bold">
                      Schedule Specific Time Lock
                    </div>
                    <div className={`text-[11px] ${subText}`}>
                      Sealed until exact date &amp; clock minute
                    </div>
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setStartPreset('INSTANT_NOW');
                  setConfirmLockStep(false);
                  setErrorMsg('');
                }}
                className={`flex items-center justify-between p-3 rounded-lg border text-left transition-colors cursor-pointer ${
                  startPreset === 'INSTANT_NOW'
                    ? 'border-amber-500 bg-amber-500/15'
                    : isNightMode
                    ? 'border-white/15 hover:border-white/30'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Play className="w-4 h-4 text-amber-500 shrink-0" />
                  <div>
                    <div className="text-xs font-bold">Start Instant Live Now</div>
                    <div className={`text-[11px] ${subText}`}>
                      Opens fullscreen stream immediately
                    </div>
                  </div>
                </div>
              </button>
            </div>

            {/* SPECIFIC DATE + EXACT 12-HOUR CLOCK PICKER */}
            {startPreset === 'EXACT_CLOCK' && (
              <div className={`p-4 rounded-xl border space-y-3.5 ${cardMutedBg}`}>
                {/* Quick Presets */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={`text-[11px] font-medium mr-1 ${subText}`}>
                    Quick Lock:
                  </span>
                  {[
                    { label: '+2 Min', fn: () => applyQuickOffsetMinutes(2) },
                    { label: '+10 Min', fn: () => applyQuickOffsetMinutes(10) },
                    { label: '+30 Min', fn: () => applyQuickOffsetMinutes(30) },
                    { label: '+1 Hour', fn: () => applyQuickOffsetMinutes(60) },
                    { label: 'Tomorrow 6:00 AM', fn: applyTomorrow6Am },
                  ].map((q) => (
                    <button
                      key={q.label}
                      type="button"
                      onClick={q.fn}
                      className={`px-2.5 py-1 text-[11px] font-mono font-semibold rounded border cursor-pointer transition-colors ${
                        isNightMode
                          ? 'bg-zinc-900 hover:bg-zinc-800 border-white/15 text-zinc-200'
                          : 'bg-white hover:bg-slate-100 border-slate-300 text-slate-800'
                      }`}
                    >
                      {q.label}
                    </button>
                  ))}
                </div>

                {/* Date Selection Row */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="flex items-center gap-1.5 text-xs font-semibold">
                      <Calendar className="w-3.5 h-3.5 text-red-500" />
                      <span>Lock Date</span>
                    </label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {[
                        { label: 'Today', ymd: todayYmd },
                        { label: 'Tomorrow', ymd: tomorrowYmd },
                        { label: '+2 Days', ymd: dayAfterYmd },
                      ].map((dOpt) => (
                        <button
                          key={dOpt.label}
                          type="button"
                          onClick={() => {
                            setDateStr(dOpt.ymd);
                            setConfirmLockStep(false);
                            setErrorMsg('');
                          }}
                          className={`py-1.5 text-xs font-semibold rounded-lg border cursor-pointer ${
                            dateStr === dOpt.ymd
                              ? 'border-red-600 bg-red-600 text-white'
                              : isNightMode
                              ? 'border-white/15 text-zinc-300'
                              : 'border-slate-300 text-slate-700'
                          }`}
                        >
                          {dOpt.label}
                        </button>
                      ))}
                    </div>
                    <input
                      type="date"
                      min={todayYmd}
                      value={dateStr}
                      onChange={(e) => {
                        setDateStr(e.target.value);
                        setConfirmLockStep(false);
                        setErrorMsg('');
                      }}
                      className={`w-full px-3 py-1.5 text-xs font-mono border rounded-lg focus:outline-none focus:border-red-500 ${inputBg}`}
                    />
                  </div>

                  {/* Exact Clock Hour : Minute + AM/PM */}
                  <div className="space-y-1.5">
                    <label className="flex items-center gap-1.5 text-xs font-semibold">
                      <Clock className="w-3.5 h-3.5 text-red-500" />
                      <span>Exact Opening Clock</span>
                    </label>

                    <div className="flex items-center gap-1.5">
                      {/* Hour 1..12 */}
                      <select
                        aria-label="Opening Hour"
                        value={hour12}
                        onChange={(e) => {
                          setHour12(Number(e.target.value));
                          setConfirmLockStep(false);
                          setErrorMsg('');
                        }}
                        className={`flex-1 px-2.5 py-2 text-sm font-mono font-bold border rounded-lg focus:outline-none focus:border-red-500 cursor-pointer ${inputBg}`}
                      >
                        {HOURS_12.map((h) => (
                          <option key={h} value={h}>
                            {String(h).padStart(2, '0')}
                          </option>
                        ))}
                      </select>

                      <span className="font-mono font-bold text-base">:</span>

                      {/* Minute 00..59 */}
                      <select
                        aria-label="Opening Minute"
                        value={minute}
                        onChange={(e) => {
                          setMinute(Number(e.target.value));
                          setConfirmLockStep(false);
                          setErrorMsg('');
                        }}
                        className={`flex-1 px-2.5 py-2 text-sm font-mono font-bold border rounded-lg focus:outline-none focus:border-red-500 cursor-pointer ${inputBg}`}
                      >
                        {MINUTES_60.map((m) => (
                          <option key={m} value={m}>
                            {String(m).padStart(2, '0')}
                          </option>
                        ))}
                      </select>

                      {/* AM / PM */}
                      <div
                        className={`flex p-0.5 rounded-lg border ${
                          isNightMode
                            ? 'bg-zinc-900 border-white/15'
                            : 'bg-slate-100 border-slate-300'
                        }`}
                      >
                        {(['AM', 'PM'] as const).map((mer) => (
                          <button
                            key={mer}
                            type="button"
                            onClick={() => {
                              setMeridiem(mer);
                              setConfirmLockStep(false);
                              setErrorMsg('');
                            }}
                            className={`px-2.5 py-1.5 text-xs font-mono font-bold rounded-md cursor-pointer ${
                              meridiem === mer
                                ? 'bg-red-600 text-white'
                                : subText
                            }`}
                          >
                            {mer}
                          </button>
                        ))}
                      </div>
                    </div>

                    <p className={`text-[11px] ${subText}`}>
                      Exact second 00 lock — class stays sealed until this minute arrives.
                    </p>
                  </div>
                </div>

                {/* Live Time-Lock Seal Status Banner */}
                {isScheduledTimeInPast ? (
                  <div className="p-3 rounded-lg bg-amber-500/15 border border-amber-500/40 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="text-amber-400 font-medium">
                      This clock time has already passed today.
                    </span>
                    <div className="flex items-center gap-2">
                      {dateStr === todayYmd && (
                        <button
                          type="button"
                          onClick={() => {
                            setDateStr(tomorrowYmd);
                            setConfirmLockStep(false);
                            setErrorMsg('');
                          }}
                          className="px-2.5 py-1 bg-amber-500 text-zinc-950 font-semibold rounded cursor-pointer"
                        >
                          Lock for Tomorrow
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => applyQuickOffsetMinutes(5)}
                        className="px-2.5 py-1 bg-red-600 text-white font-semibold rounded cursor-pointer"
                      >
                        Set +5 Min
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2 font-semibold text-emerald-400">
                      <Lock className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        LOCKED UNTIL: {formatFullDateClock(previewStartMs)}
                      </span>
                    </div>
                    <span className="font-mono font-bold tabular-nums text-emerald-400">
                      Opens in {formatHMSCountdown(msUntilScheduledOpen)}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Step 4: Screen Mode & Slide Timers */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="block text-xs font-semibold">
                3. Default Live Screen Mode
              </label>
              <button
                type="button"
                onClick={() => setOrientation(BroadcastOrientation.LANDSCAPE)}
                className={`w-full flex items-center gap-2.5 p-2.5 rounded-lg border text-left transition-colors cursor-pointer ${
                  orientation === BroadcastOrientation.LANDSCAPE
                    ? 'border-red-600 bg-red-600/10'
                    : isNightMode
                    ? 'border-white/15 hover:border-white/30'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <Monitor className="w-4 h-4 text-red-500 shrink-0" />
                <div>
                  <div className="text-xs font-semibold">YouTube 16:9 Live</div>
                  <div className={`text-[11px] ${subText}`}>Fullscreen wide stream</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setOrientation(BroadcastOrientation.VERTICAL)}
                className={`w-full flex items-center gap-2.5 p-2.5 rounded-lg border text-left transition-colors cursor-pointer ${
                  orientation === BroadcastOrientation.VERTICAL
                    ? 'border-red-600 bg-red-600/10'
                    : isNightMode
                    ? 'border-white/15 hover:border-white/30'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <Smartphone className="w-4 h-4 text-red-500 shrink-0" />
                <div>
                  <div className="text-xs font-semibold">Vertical Frame Live</div>
                  <div className={`text-[11px] ${subText}`}>Flipkart / Shorts live</div>
                </div>
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="flex items-center justify-between text-xs font-semibold mb-1.5">
                  <span>Seconds Per Slide (Min 50s)</span>
                  <span className="font-mono tabular-nums text-red-500">
                    {baseSeconds}s
                  </span>
                </label>
                <div className="grid grid-cols-4 gap-1.5">
                  {[50, 60, 75, 90].map((sec) => (
                    <button
                      key={sec}
                      type="button"
                      onClick={() => {
                        setBaseSeconds(sec);
                        setConfirmLockStep(false);
                      }}
                      className={`py-1.5 text-xs font-mono font-semibold rounded-lg border cursor-pointer ${
                        baseSeconds === sec
                          ? 'border-red-600 bg-red-600 text-white'
                          : isNightMode
                          ? 'border-white/15 text-zinc-300'
                          : 'border-slate-200 text-slate-700'
                      }`}
                    >
                      {sec}s
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="flex items-center justify-between text-xs font-semibold mb-1.5">
                  <span>Emergency Break (Min 45s)</span>
                  <span className="font-mono tabular-nums text-amber-500">
                    +{emergencySeconds}s
                  </span>
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {[45, 55, 60].map((sec) => (
                    <button
                      key={sec}
                      type="button"
                      onClick={() => {
                        setEmergencySeconds(sec);
                        setConfirmLockStep(false);
                      }}
                      className={`py-1.5 text-xs font-mono font-semibold rounded-lg border cursor-pointer ${
                        emergencySeconds === sec
                          ? 'border-amber-500 bg-amber-500 text-zinc-950'
                          : isNightMode
                          ? 'border-white/15 text-zinc-300'
                          : 'border-slate-200 text-slate-700'
                      }`}
                    >
                      +{sec}s
                    </button>
                  ))}
                </div>
              </div>

              <div className={`p-2.5 border rounded-lg text-xs space-y-1 ${cardMutedBg}`}>
                <div className="flex items-center justify-between">
                  <span className={subText}>Shutter Closes:</span>
                  <span className="font-mono tabular-nums font-semibold text-red-500">
                    {formatFullDateClock(previewHardCloseMs)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {errorMsg && (
            <div className="p-3 bg-red-500/15 border border-red-500/40 rounded-lg text-xs text-red-400 font-medium">
              {errorMsg}
            </div>
          )}

          {confirmLockStep && (
            <div className="p-3.5 bg-amber-500/15 border border-amber-500/40 rounded-lg flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
              <div className="text-xs space-y-1">
                <p className="font-semibold text-amber-500">
                  {startPreset === 'EXACT_CLOCK'
                    ? `Confirm Strict Time-Lock for ${formatFullDateClock(previewStartMs)}`
                    : 'Confirm Instant Live Broadcast'}
                </p>
                <p className={subText}>
                  {startPreset === 'EXACT_CLOCK'
                    ? `This chapter will remain 100% SEALED & PADLOCKED in Upcoming Live and automatically go LIVE at exact ${formatFullDateClock(
                        previewStartMs
                      )}. Schedule cannot be edited or cancelled.`
                    : `Slides advance automatically every ${baseSeconds}s (+${emergencySeconds}s emergency hold).`}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className={`px-5 sm:px-6 py-4 border-t flex items-center justify-between gap-4 ${
            isNightMode
              ? 'bg-[#0F0F12] border-white/10'
              : 'bg-slate-50 border-slate-200'
          }`}
        >
          <button
            type="button"
            onClick={onClose}
            className={`px-4 py-2 text-xs font-medium rounded-lg cursor-pointer ${subText}`}
          >
            Cancel
          </button>

          <button
            type="button"
            disabled={isScanning || isSaving}
            onClick={handlePublishAndLock}
            className="flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
          >
            <Lock className="w-3.5 h-3.5" />
            <span>
              {isSaving
                ? 'Sealing Lock...'
                : confirmLockStep
                ? startPreset === 'EXACT_CLOCK'
                  ? 'Confirm & Seal Time-Lock'
                  : 'Confirm Instant Live'
                : startPreset === 'EXACT_CLOCK'
                ? 'Seal Chapter Time-Lock'
                : 'Go Live Now'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
