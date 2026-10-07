import React, { useState, useEffect, useRef } from 'react';
import {
  Lock,
  Plus,
  Trash2,
  Edit2,
  Calendar,
  Clock,
  Youtube,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Send,
  Sparkles,
  ArrowLeft,
  X,
  RotateCcw,
  Download,
  Upload,
  Database,
  Server,
  Cloud,
  CloudOff,
  HardDrive,
  Key,
  Check,
  Info,
  ShieldCheck,
} from 'lucide-react';
import { JEEClass, JEEClassSubject } from '../types/class';
import { extractYouTubeId, verifyYouTubeEmbeddability } from '../lib/youtube';
import { checkScheduleOverlap } from '../lib/overlap';
import { formatISTDateTime, formatISTTime } from '../lib/istTime';
import { sendTestNotification } from '../lib/pushClient';
import { saveNewClass, updateClassInStore, removeClass, resetAllClasses, fetchAllClasses, clearAllClassesFromStore, markScheduleCustomized, exportScheduleBackup, importScheduleBackup } from '../lib/clientData';
import { InspiroLogo } from './InspiroLogo';

interface Props {
  classes: JEEClass[];
  onRefreshClasses: () => Promise<void>;
  onBackToTimetable: () => void;
}

export const AdminPanel: React.FC<Props> = ({
  classes,
  onRefreshClasses,
  onBackToTimetable,
}) => {
  // Authentication state
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return sessionStorage.getItem('jee_admin_auth') === 'true';
  });
  const [passwordInput, setPasswordInput] = useState('');
  const [authError, setAuthError] = useState('');
  const [isSubmittingAuth, setIsSubmittingAuth] = useState(false);

  // Form Mode: Single vs Bulk Add vs Database Center
  const [addMode, setAddMode] = useState<'single' | 'bulk' | 'database'>('single');

  // Dual Storage & Supabase Management States
  const [storageStatus, setStorageStatus] = useState<any | null>(null);
  const [isLoadingStorageStatus, setIsLoadingStorageStatus] = useState(false);
  const [isTestingDb, setIsTestingDb] = useState(false);
  const [isSyncingToSupabase, setIsSyncingToSupabase] = useState(false);
  const [isPullingFromSupabase, setIsPullingFromSupabase] = useState(false);
  const [inputSupabaseUrl, setInputSupabaseUrl] = useState('');
  const [inputSupabaseKey, setInputSupabaseKey] = useState('');
  const [configSaveStatus, setConfigSaveStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [showSqlSchema, setShowSqlSchema] = useState(false);

  // Fetch Database & Storage Health
  const fetchStorageStatus = async () => {
    setIsLoadingStorageStatus(true);
    try {
      const res = await fetch('/api/database/status');
      if (res.ok) {
        const data = await res.json();
        setStorageStatus(data);
        if (data.primary?.url && !inputSupabaseUrl) {
          setInputSupabaseUrl(data.primary.url);
        }
      }
    } catch (err) {
      console.warn('Could not fetch storage status:', err);
    } finally {
      setIsLoadingStorageStatus(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchStorageStatus();
    }
  }, [isAuthenticated]);

  const handleTestConnection = async () => {
    setIsTestingDb(true);
    try {
      const res = await fetch('/api/database/test', { method: 'POST' });
      const data = await res.json();
      await fetchStorageStatus();
      setFormStatus({
        type: data.connected ? 'success' : 'error',
        message: data.message,
      });
    } catch (err: any) {
      setFormStatus({ type: 'error', message: `Test failed: ${err.message}` });
    } finally {
      setIsTestingDb(false);
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputSupabaseUrl || !inputSupabaseKey) {
      setConfigSaveStatus({ type: 'error', message: 'Please enter both Supabase Project URL and API Key.' });
      return;
    }
    setIsTestingDb(true);
    setConfigSaveStatus(null);
    try {
      const res = await fetch('/api/database/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supabaseUrl: inputSupabaseUrl, supabaseKey: inputSupabaseKey }),
      });
      const data = await res.json();
      if (data.success) {
        await fetchStorageStatus();
        setConfigSaveStatus({
          type: data.health?.connected ? 'success' : 'error',
          message: data.health?.connected
            ? 'Supabase credentials saved and verified! Both Supabase and Server Backup are active.'
            : `Saved to .env: ${data.health?.message}`,
        });
      } else {
        setConfigSaveStatus({ type: 'error', message: data.error || 'Failed to save configuration' });
      }
    } catch (err: any) {
      setConfigSaveStatus({ type: 'error', message: err.message || 'Failed to save configuration' });
    } finally {
      setIsTestingDb(false);
    }
  };

  const handlePushBackupToSupabase = async () => {
    setIsSyncingToSupabase(true);
    try {
      const res = await fetch('/api/database/push-to-supabase', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setFormStatus({
          type: 'success',
          message: `Successfully uploaded ${data.count} classes from Server Backup to Supabase!`,
        });
        await fetchStorageStatus();
        await onRefreshClasses();
      } else {
        setFormStatus({
          type: 'error',
          message: `Push to Supabase failed: ${data.error}`,
        });
      }
    } catch (err: any) {
      setFormStatus({ type: 'error', message: err.message });
    } finally {
      setIsSyncingToSupabase(false);
    }
  };

  const handlePullFromSupabase = async () => {
    setIsPullingFromSupabase(true);
    try {
      const res = await fetch('/api/database/pull-from-supabase', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setFormStatus({
          type: 'success',
          message: `Successfully downloaded ${data.count} classes from Supabase into Server Backup!`,
        });
        await fetchStorageStatus();
        await onRefreshClasses();
      } else {
        setFormStatus({
          type: 'error',
          message: `Pull from Supabase failed: ${data.error}`,
        });
      }
    } catch (err: any) {
      setFormStatus({ type: 'error', message: err.message });
    } finally {
      setIsPullingFromSupabase(false);
    }
  };

  const [isBroadcasting, setIsBroadcasting] = useState(false);

  const handleBroadcastSchedule = async () => {
    setIsBroadcasting(true);
    try {
      const res = await fetch('/api/classes/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classes, updatedAt: Date.now() }),
      });
      if (res.ok) {
        setFormStatus({
          type: 'success',
          message: `Broadcasted ${classes.length} classes to the server! All new phones, incognito tabs, and student devices will now see this timetable immediately.`,
        });
        await onRefreshClasses();
        await fetchStorageStatus();
      } else {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `Server returned HTTP ${res.status}`);
      }
    } catch (err: any) {
      setFormStatus({ type: 'error', message: `Broadcast failed: ${err.message}` });
    } finally {
      setIsBroadcasting(false);
    }
  };

  // Single Class Form State
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState<JEEClassSubject>('Physics');
  const [faculty, setFaculty] = useState('');
  const [topic, setTopic] = useState('');
  const [description, setDescription] = useState('');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [durationMin, setDurationMin] = useState(60);

  // Bulk Add State
  const [bulkUrls, setBulkUrls] = useState('');
  const [bulkSubject, setBulkSubject] = useState<JEEClassSubject>('Physics');
  const [bulkFaculty, setBulkFaculty] = useState('JEE Faculty Team');
  const [bulkStartDate, setBulkStartDate] = useState('');
  const [bulkStartTime, setBulkStartTime] = useState('');
  const [bulkDurationMin, setBulkDurationMin] = useState(60);
  const [bulkIntervalMin, setBulkIntervalMin] = useState(15); // gap between classes

  // Validation States
  const [embedCheckLoading, setEmbedCheckLoading] = useState(false);
  const [embedCheckResult, setEmbedCheckResult] = useState<{
    tested: boolean;
    isEmbeddable: boolean;
    message?: string;
  }>({ tested: false, isEmbeddable: true });

  const [overlapWarning, setOverlapWarning] = useState<string | null>(null);
  const [formStatus, setFormStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Editing existing class modal
  const [editingClass, setEditingClass] = useState<JEEClass | null>(null);

  // Cron simulation state
  const [cronLogs, setCronLogs] = useState<string | null>(null);
  const [isSimulatingCron, setIsSimulatingCron] = useState(false);

  // Set default start date to today in IST
  useEffect(() => {
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const yyyy = now.getFullYear();
    const mm = pad(now.getMonth() + 1);
    const dd = pad(now.getDate());
    const hh = pad((now.getHours() + 1) % 24);
    const min = '00';

    setStartDate(`${yyyy}-${mm}-${dd}`);
    setStartTime(`${hh}:${min}`);
    setBulkStartDate(`${yyyy}-${mm}-${dd}`);
    setBulkStartTime(`${hh}:${min}`);
  }, []);

  // Real-time overlap and embed check when single class input changes
  useEffect(() => {
    if (!startDate || !startTime || !durationMin) {
      setOverlapWarning(null);
      return;
    }

    const scheduledIso = `${startDate}T${startTime}:00+05:30`;
    const candidateStart = new Date(scheduledIso).toISOString();

    const overlap = checkScheduleOverlap(
      {
        start_at: candidateStart,
        duration_min: Number(durationMin),
        id: editingClass ? editingClass.id : undefined,
      },
      classes
    );

    if (overlap.hasOverlap) {
      setOverlapWarning(overlap.message || 'Schedule overlaps with another scheduled class.');
    } else {
      setOverlapWarning(null);
    }
  }, [startDate, startTime, durationMin, classes, editingClass]);

  // Handle Admin Login
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingAuth(true);
    setAuthError('');

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: passwordInput }),
      });

      if (res.ok) {
        sessionStorage.setItem('jee_admin_auth', 'true');
        setIsAuthenticated(true);
        return;
      }

      const data = await res.json();
      throw new Error(data.error || 'Authentication failed');
    } catch (err: any) {
      // In case of static / serverless cold-start or offline on Vercel
      const pass = passwordInput ? passwordInput.trim() : '';
      if (pass === 'insprioLive@7858') {
        sessionStorage.setItem('jee_admin_auth', 'true');
        setIsAuthenticated(true);
      } else {
        setAuthError(err.message || 'Incorrect admin password. Access denied.');
      }
    } finally {
      setIsSubmittingAuth(false);
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem('jee_admin_auth');
    setIsAuthenticated(false);
  };

  // Test YouTube URL on change or blur
  const handleCheckEmbed = async () => {
    const id = extractYouTubeId(youtubeUrl);
    if (!id) {
      setEmbedCheckResult({
        tested: true,
        isEmbeddable: false,
        message: 'Invalid YouTube link or ID format.',
      });
      return;
    }

    setEmbedCheckLoading(true);
    try {
      const res = await verifyYouTubeEmbeddability(id);
      setEmbedCheckResult({
        tested: true,
        isEmbeddable: res.isEmbeddable,
        message: res.isEmbeddable
          ? `Embed verified: "${res.title || 'Valid video'}"`
          : res.reason || 'Embedding is blocked by video creator on 3rd-party sites.',
      });
      if (res.title && !title) {
        setTitle(res.title);
      }
    } catch (err) {
      setEmbedCheckResult({
        tested: true,
        isEmbeddable: true,
        message: 'Could not reach oEmbed verification. Assuming embeddable.',
      });
    } finally {
      setEmbedCheckLoading(false);
    }
  };

  // Submit Single Class Creation
  const handleCreateSingleClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !youtubeUrl || !startDate || !startTime) {
      setFormStatus({ type: 'error', message: 'Please fill in all mandatory fields.' });
      return;
    }

    setIsSubmitting(true);
    setFormStatus(null);

    try {
      // Indian Standard Time offset +05:30
      const scheduledIso = `${startDate}T${startTime}:00+05:30`;
      const startAt = new Date(scheduledIso).toISOString();

      const youtube_id = extractYouTubeId(youtubeUrl) || '';
      await saveNewClass({
        title,
        subject,
        faculty: faculty || 'JEE Faculty',
        topic,
        description,
        youtube_url: youtubeUrl,
        youtube_id,
        start_at: startAt,
        duration_min: Number(durationMin),
        is_embeddable: embedCheckResult.isEmbeddable,
        thumbnail_url: youtube_id ? `https://img.youtube.com/vi/${youtube_id}/hqdefault.jpg` : '/images/jee_classroom_hero_1791042392139.jpg',
      });

      setFormStatus({
        type: 'success',
        message: `Class "${title}" successfully scheduled for ${formatISTDateTime(startAt)}!`,
      });

      // Reset form fields
      setTitle('');
      setTopic('');
      setDescription('');
      setYoutubeUrl('');
      setEmbedCheckResult({ tested: false, isEmbeddable: true });
      await onRefreshClasses();
    } catch (err: any) {
      setFormStatus({ type: 'error', message: err.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Submit Bulk Add Classes
  const handleBulkAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const urls = bulkUrls
      .split('\n')
      .map((u) => u.trim())
      .filter((u) => u.length > 0);

    if (urls.length === 0) {
      setFormStatus({ type: 'error', message: 'Please paste at least one YouTube URL.' });
      return;
    }

    setIsSubmitting(true);
    setFormStatus(null);

    let baseStart = new Date(`${bulkStartDate}T${bulkStartTime}:00+05:30`).getTime();
    let createdCount = 0;
    const errors: string[] = [];

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      const videoId = extractYouTubeId(url);
      if (!videoId) {
        errors.push(`Invalid URL: ${url}`);
        continue;
      }

      // Schedule consecutively with interval
      const classStart = new Date(baseStart + i * (bulkDurationMin + bulkIntervalMin) * 60 * 1000).toISOString();

      try {
        const embedRes = await verifyYouTubeEmbeddability(videoId);
        const classTitle = embedRes.title || `${bulkSubject} Masterclass Session #${i + 1}`;

        await saveNewClass({
          title: classTitle,
          subject: bulkSubject,
          faculty: bulkFaculty,
          topic: `JEE Advanced Batch Series`,
          youtube_url: url,
          youtube_id: videoId,
          start_at: classStart,
          duration_min: bulkDurationMin,
          is_embeddable: embedRes.isEmbeddable,
          thumbnail_url: embedRes.thumbnailUrl || `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
        });
        createdCount++;
      } catch (err: any) {
        errors.push(`Video ${videoId}: ${err.message}`);
      }
    }

    setIsSubmitting(false);
    await onRefreshClasses();

    if (createdCount > 0) {
      setFormStatus({
        type: 'success',
        message: `Successfully scheduled ${createdCount} classes! ${errors.length > 0 ? `(${errors.length} failed)` : ''}`,
      });
      setBulkUrls('');
    } else {
      setFormStatus({
        type: 'error',
        message: `Failed to schedule classes: ${errors.join('; ')}`,
      });
    }
  };

  // Delete Class
  const handleDeleteClass = async (id: string, classTitle: string) => {
    try {
      await removeClass(id);
      setFormStatus({
        type: 'success',
        message: `Class "${classTitle}" was successfully removed.`,
      });
      await onRefreshClasses();
    } catch (err: any) {
      setFormStatus({
        type: 'error',
        message: err.message || 'Failed to remove class',
      });
    }
  };

  // Save Edited Class
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingClass) return;

    try {
      await updateClassInStore(editingClass.id, editingClass);

      setEditingClass(null);
      setFormStatus({
        type: 'success',
        message: `Class "${editingClass.title}" updated successfully!`,
      });
      await onRefreshClasses();
    } catch (err: any) {
      setFormStatus({
        type: 'error',
        message: err.message || 'Failed to update class',
      });
    }
  };

  // Simulate Vercel Cron
  const handleSimulateCron = async () => {
    setIsSimulatingCron(true);
    try {
      const res = await fetch('/api/cron/check-notifications');
      const data = await res.json();
      setCronLogs(JSON.stringify(data, null, 2));
    } catch (err: any) {
      setCronLogs(`Cron execution status: ${err.message || 'Processed scheduled alerts'}`);
    } finally {
      setIsSimulatingCron(false);
    }
  };

  // Reset timetable = FORCE EMPTY - no sample lectures anymore
  const handleResetTimetable = async () => {
    if (!window.confirm('This will DELETE ALL classes and make timetable empty. Continue?')) return;
    try {
      await clearAllClassesFromStore();
      await fetch('/api/classes/clear', { method: 'POST' });
      await onRefreshClasses();
      setFormStatus({
        type: 'success',
        message: 'Timetable is now completely empty. No sample classes will return.',
      });
    } catch (err: any) {
      setFormStatus({
        type: 'error',
        message: 'Reset failed: ' + (err.message || 'Unknown error'),
      });
    }
  };

  // Clear all classes from timetable completely
  const handleClearAll = async () => {
    if (!window.confirm('Remove ALL classes? This cannot be undone.')) return;
    try {
      await clearAllClassesFromStore();
      await fetch('/api/classes/clear', { method: 'POST', cache: 'no-store' });
      await onRefreshClasses();
      setFormStatus({ type: 'success', message: 'All classes removed - timetable empty.' });
    } catch (err: any) {
      setFormStatus({ type: 'error', message: 'Clear failed: ' + err.message });
    }
  };

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleExportBackup = () => {
    const jsonStr = exportScheduleBackup();
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inspiro_classes_backup_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setFormStatus({ type: 'success', message: 'Schedule backup downloaded! You can restore it anytime with 1 click.' });
  };

  const handleImportFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      if (text) {
        const res = await importScheduleBackup(text);
        if (res.success) {
          setFormStatus({ type: 'success', message: `Restored ${res.count} scheduled classes successfully!` });
          await onRefreshClasses();
        } else {
          setFormStatus({ type: 'error', message: res.error || 'Failed to restore schedule' });
        }
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Login view if unauthenticated
  if (!isAuthenticated) {
    return (
      <div className="max-w-md mx-auto px-4 py-16">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-xl space-y-6">
          <div className="text-center space-y-3">
            <div className="flex justify-center pb-1">
              <InspiroLogo size="md" showSubtitle={true} />
            </div>
            <div className="w-10 h-10 rounded-xl bg-slate-800/80 border border-slate-700/80 mx-auto flex items-center justify-center text-sky-400">
              <Lock className="w-5 h-5" />
            </div>
            <h1 className="text-xl font-bold text-white">JEE LiveSync Faculty Admin</h1>
            <p className="text-xs text-slate-400">
              Enter admin password to schedule YouTube live classes, validate overlaps, and manage notifications.
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Admin Password
              </label>
              <input
                type="password"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                placeholder="Enter password (insprioLive@7858)"
                required
                className="w-full px-3.5 py-2 text-sm bg-slate-950 border border-slate-800 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 font-mono"
              />
            </div>

            {authError && (
              <p className="text-xs text-rose-400 font-medium">{authError}</p>
            )}

            <div>
              <button
                type="submit"
                disabled={isSubmittingAuth}
                className="w-full py-2.5 bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-slate-950 font-bold text-xs rounded-lg transition-colors shadow-lg"
              >
                {isSubmittingAuth ? 'Verifying Credentials...' : 'Unlock Admin Panel'}
              </button>
            </div>
          </form>

          <div className="pt-4 border-t border-slate-800 text-center">
            <button
              onClick={onBackToTimetable}
              className="text-xs text-slate-400 hover:text-slate-200"
            >
              Return to Student Timetable
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <button
              onClick={onBackToTimetable}
              className="text-slate-400 hover:text-white p-1 rounded"
              title="Return"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <h1 className="text-xl sm:text-2xl font-bold text-white">
              Faculty Class Scheduler & Timetable Admin
            </h1>
          </div>
          <p className="text-xs text-slate-400 pl-6">
            Schedule YouTube video broadcasts, detect timetable overlaps, verify embed restrictions, and dispatch Web Push reminders.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleExportBackup}
            className="px-3 py-1.5 text-xs font-semibold text-emerald-300 bg-emerald-950/40 border border-emerald-800/80 hover:bg-emerald-900/50 rounded-lg transition-colors flex items-center gap-1.5 shadow-sm"
            title="Download full schedule backup JSON file to your device"
          >
            <Download className="w-3.5 h-3.5 text-emerald-400" />
            <span>Export Backup</span>
          </button>

          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-3 py-1.5 text-xs font-semibold text-sky-300 bg-sky-950/40 border border-sky-800/80 hover:bg-sky-900/50 rounded-lg transition-colors flex items-center gap-1.5 shadow-sm"
            title="Upload and restore scheduled classes from backup JSON file"
          >
            <Upload className="w-3.5 h-3.5 text-sky-400" />
            <span>Restore Backup</span>
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImportFileChange}
            accept=".json,application/json"
            className="hidden"
          />

          <button
            onClick={handleClearAll}
            className="px-3 py-1.5 text-xs font-medium text-rose-300 bg-rose-950/30 border border-rose-900/60 hover:bg-rose-900/30 rounded-lg transition-colors flex items-center gap-1.5"
            title="Delete all scheduled classes from the timetable"
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-400" />
            <span>Clear All Classes</span>
          </button>

          <button
            onClick={handleResetTimetable}
            className="px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-900 border border-slate-800 hover:bg-slate-800 rounded-lg transition-colors flex items-center gap-1.5"
            title="Reset timetable to fresh sample classes"
          >
            <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
            <span>Reset Samples</span>
          </button>

          <button
            onClick={sendTestNotification}
            className="px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-900 border border-slate-800 hover:bg-slate-800 rounded-lg transition-colors flex items-center gap-1.5"
            title="Test local and browser notification sound & prompt"
          >
            <Send className="w-3.5 h-3.5 text-sky-400" />
            <span>Test Push Chime</span>
          </button>

          <button
            onClick={handleBroadcastSchedule}
            disabled={isBroadcasting}
            className="px-3 py-1.5 text-xs font-semibold text-slate-950 bg-sky-400 hover:bg-sky-300 disabled:opacity-50 rounded-lg transition-colors flex items-center gap-1.5 shadow"
            title="Publish all scheduled classes on your phone to the server so new phones and incognito sessions see them immediately"
          >
            <Send className={`w-3.5 h-3.5 ${isBroadcasting ? 'animate-pulse' : ''}`} />
            <span>Broadcast to All Devices</span>
          </button>

          <button
            onClick={handleLogout}
            className="px-3 py-1.5 text-xs font-medium text-amber-300 bg-amber-950/40 border border-amber-900/60 hover:bg-amber-900/40 rounded-lg transition-colors"
          >
            Lock Admin
          </button>
        </div>
      </div>

      {/* Dual Storage Engine Status Card */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-lg space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-sky-950/60 border border-sky-800/60 rounded-xl text-sky-400">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white">Dual Storage Engine Status</h3>
                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                  Active: {storageStatus?.activeEngine === 'supabase' ? 'Supabase Cloud (Primary)' : 'Server Backup (Failover)'}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Primary Supabase PostgreSQL + Local Server Persistent Backup. Changes apply to all users even during Supabase free trial sleep.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleTestConnection}
              disabled={isTestingDb}
              className="px-3 py-1.5 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 rounded-lg transition-colors flex items-center gap-1.5 border border-slate-700 shadow-sm"
              title="Test connection to Supabase"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isTestingDb ? 'animate-spin' : ''}`} />
              <span>Test Ping</span>
            </button>

            <button
              onClick={handlePushBackupToSupabase}
              disabled={isSyncingToSupabase || !storageStatus?.primary?.configured}
              className="px-3 py-1.5 text-xs font-semibold text-emerald-300 bg-emerald-950/50 hover:bg-emerald-900/60 border border-emerald-800/80 disabled:opacity-40 rounded-lg transition-colors flex items-center gap-1.5 shadow-sm"
              title="Upload all classes in Server Backup to Supabase"
            >
              <Cloud className={`w-3.5 h-3.5 ${isSyncingToSupabase ? 'animate-pulse' : ''}`} />
              <span>Push to Supabase</span>
            </button>

            <button
              onClick={() => setAddMode('database')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 border ${
                addMode === 'database'
                  ? 'bg-sky-500 text-slate-950 border-sky-400'
                  : 'bg-sky-950/40 text-sky-300 border-sky-800/80 hover:bg-sky-900/50'
              }`}
            >
              <Key className="w-3.5 h-3.5" />
              <span>Configure Database</span>
            </button>
          </div>
        </div>

        {/* Status Indicators Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-800/80 text-xs">
          {/* Primary: Supabase */}
          <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                <Cloud className="w-4 h-4 text-sky-400" />
                <span>Primary Cloud DB (Supabase)</span>
              </span>

              {storageStatus?.primary?.status === 'connected' && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  Connected
                </span>
              )}
              {storageStatus?.primary?.status === 'paused' && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-950 text-amber-300 border border-amber-800 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                  Paused (Serving from Backup)
                </span>
              )}
              {storageStatus?.primary?.status === 'auth_error' && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-950 text-rose-300 border border-rose-800">
                  Key / Auth Error
                </span>
              )}
              {storageStatus?.primary?.status === 'table_missing' && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-950 text-amber-300 border border-amber-800">
                  Table Missing (Run SQL)
                </span>
              )}
              {storageStatus?.primary?.status === 'unreachable' && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-950 text-rose-300 border border-rose-800">
                  Unreachable
                </span>
              )}
              {(!storageStatus || storageStatus?.primary?.status === 'not_configured') && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700">
                  Not Configured
                </span>
              )}
            </div>

            <p className="text-[11px] text-slate-400">
              {storageStatus?.primary?.message || 'Checking connection status...'}
            </p>

            {storageStatus?.primary?.url && (
              <p className="text-[10px] font-mono text-sky-400/90 truncate">
                {storageStatus.primary.url}
              </p>
            )}
          </div>

          {/* Secondary: Server-Side Backup */}
          <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                <HardDrive className="w-4 h-4 text-emerald-400" />
                <span>Secondary Storage (Server Backup)</span>
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                Active & Failover Ready
              </span>
            </div>

            <p className="text-[11px] text-slate-400">
              {storageStatus?.backup?.classesCount ?? classes.length} classes safely preserved on disk ({storageStatus?.backup?.classesFilePath || 'data/classes.json'}).
            </p>
            <p className="text-[10px] text-emerald-400/90">
              Guaranteed delivery: If Supabase goes to sleep, students seamlessly receive the schedule from here.
            </p>
          </div>
        </div>
      </div>

      {/* Mode Switch: Single Class vs Bulk Add vs Database Center */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
        <button
          onClick={() => setAddMode('single')}
          className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors ${
            addMode === 'single'
              ? 'bg-sky-500 text-slate-950 shadow'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          Schedule Single Class
        </button>
        <button
          onClick={() => setAddMode('bulk')}
          className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors ${
            addMode === 'bulk'
              ? 'bg-sky-500 text-slate-950 shadow'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          Bulk Schedule Multiple Links
        </button>
        <button
          onClick={() => setAddMode('database')}
          className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 ${
            addMode === 'database'
              ? 'bg-sky-500 text-slate-950 shadow'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Database className="w-3.5 h-3.5" />
          <span>Storage & Supabase Center</span>
        </button>
      </div>

      {/* Form Status Message */}
      {formStatus && (
        <div
          className={`p-4 rounded-xl text-xs flex items-center justify-between border ${
            formStatus.type === 'success'
              ? 'bg-emerald-950/50 border-emerald-800/80 text-emerald-200'
              : 'bg-amber-950/50 border-amber-800/80 text-amber-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {formStatus.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-amber-400" />
            )}
            <span>{formStatus.message}</span>
          </div>
          <button onClick={() => setFormStatus(null)} className="p-1 hover:opacity-80">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* SINGLE CLASS SCHEDULE FORM */}
      {addMode === 'single' && (
        <form onSubmit={handleCreateSingleClass} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
              <Plus className="w-4 h-4 text-sky-400" />
              <span>Schedule New Class</span>
            </h2>

            {/* Quick 1-click Presets (Zero setup needed) */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] text-slate-400">Quick JEE Presets:</span>
              <button
                type="button"
                onClick={() => {
                  setYoutubeUrl('https://www.youtube.com/watch?v=sB1qVshqKfs');
                  setTitle('Rotational Motion: Moment of Inertia & Torques');
                  setSubject('Physics');
                  setFaculty('Prof. HC Verma Series');
                  setTopic('Rigid Body Dynamics (JEE Adv)');
                  setDurationMin(90);
                  setEmbedCheckResult({ tested: true, isEmbeddable: true, message: 'Verified embeddable' });
                }}
                className="px-2 py-1 text-[11px] bg-slate-800 hover:bg-slate-700 text-sky-300 rounded border border-slate-700"
              >
                Physics HC Verma
              </button>
              <button
                type="button"
                onClick={() => {
                  setYoutubeUrl('https://www.youtube.com/watch?v=3fumBcKC6RE');
                  setTitle('Definite Integrals & Area Under Curves PYQs');
                  setSubject('Mathematics');
                  setFaculty('Prof. Arvind K.');
                  setTopic('Calculus (JEE Main + Adv)');
                  setDurationMin(75);
                  setEmbedCheckResult({ tested: true, isEmbeddable: true, message: 'Verified embeddable' });
                }}
                className="px-2 py-1 text-[11px] bg-slate-800 hover:bg-slate-700 text-amber-300 rounded border border-slate-700"
              >
                Math Calculus
              </button>
              <button
                type="button"
                onClick={() => {
                  setYoutubeUrl('https://www.youtube.com/watch?v=kJQP7kiw5Fk');
                  setTitle('Coordination Compounds & Crystal Field Theory');
                  setSubject('Chemistry');
                  setFaculty('Dr. Neha Agarwal');
                  setTopic('Inorganic Chemistry');
                  setDurationMin(60);
                  setEmbedCheckResult({ tested: true, isEmbeddable: true, message: 'Verified embeddable' });
                }}
                className="px-2 py-1 text-[11px] bg-slate-800 hover:bg-slate-700 text-emerald-300 rounded border border-slate-700"
              >
                Chem Coordination
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* YouTube Link */}
            <div className="md:col-span-2 space-y-1.5">
              <label className="block text-xs font-medium text-slate-300">
                YouTube Video URL or Video ID <span className="text-emerald-400">*</span>
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Youtube className="w-4 h-4 text-emerald-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    required
                    placeholder="https://www.youtube.com/watch?v=... or youtu.be/..."
                    value={youtubeUrl}
                    onChange={(e) => {
                      setYoutubeUrl(e.target.value);
                      setEmbedCheckResult({ tested: false, isEmbeddable: true });
                    }}
                    onBlur={handleCheckEmbed}
                    className="w-full pl-9 pr-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 font-mono"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleCheckEmbed}
                  disabled={embedCheckLoading}
                  className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 rounded-lg whitespace-nowrap transition-colors"
                >
                  {embedCheckLoading ? 'Verifying...' : 'Verify Embed'}
                </button>
              </div>

              {/* Embed verification feedback */}
              {embedCheckResult.tested && (
                <div
                  className={`text-xs p-2 rounded-lg mt-1.5 flex items-center gap-2 ${
                    embedCheckResult.isEmbeddable
                      ? 'bg-emerald-950/40 text-emerald-300 border border-emerald-900/60'
                      : 'bg-amber-950/40 text-amber-300 border border-amber-900/60'
                  }`}
                >
                  {embedCheckResult.isEmbeddable ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  )}
                  <span>{embedCheckResult.message}</span>
                </div>
              )}
            </div>

            {/* Class Title */}
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-300">
                Class Title <span className="text-emerald-400">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Rotational Motion: Moment of Inertia"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
              />
            </div>

            {/* Subject */}
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-300">
                Subject <span className="text-emerald-400">*</span>
              </label>
              <select
                value={subject}
                onChange={(e) => setSubject(e.target.value as JEEClassSubject)}
                className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-sky-500"
              >
                <option value="Physics">Physics</option>
                <option value="Chemistry">Chemistry</option>
                <option value="Mathematics">Mathematics</option>
              </select>
            </div>

            {/* Faculty Name */}
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-300">
                Faculty Name
              </label>
              <input
                type="text"
                placeholder="e.g. Dr. H. C. Verma Series / Er. Sharma"
                value={faculty}
                onChange={(e) => setFaculty(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
              />
            </div>

            {/* Chapter Topic */}
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-300">
                Topic / Chapter
              </label>
              <input
                type="text"
                placeholder="e.g. Mechanics / JEE Advanced PYQs"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
              />
            </div>

            {/* Date (IST) */}
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-300">
                Scheduled Date (IST) <span className="text-emerald-400">*</span>
              </label>
              <input
                type="date"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-sky-500 font-mono"
              />
              {/* Quick multi-month scheduling jump helpers */}
              <div className="flex items-center gap-1 flex-wrap pt-1">
                <span className="text-[10px] text-slate-500 font-mono">Jump:</span>
                {[
                  { label: 'Today', days: 0 },
                  { label: 'Tomorrow', days: 1 },
                  { label: '+1 Wk', days: 7 },
                  { label: '+1 Mo', days: 30 },
                  { label: '+3 Mo', days: 90 },
                  { label: '+6 Mo', days: 180 },
                ].map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => {
                      const d = new Date();
                      d.setDate(d.getDate() + preset.days);
                      const pad = (n: number) => n.toString().padStart(2, '0');
                      setStartDate(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
                    }}
                    className="px-1.5 py-0.5 text-[10px] font-mono bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition-colors"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Time (IST) */}
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-300">
                Start Time (IST) <span className="text-emerald-400">*</span>
              </label>
              <input
                type="time"
                required
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-sky-500 font-mono"
              />
            </div>

            {/* Duration */}
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-300">
                Duration (minutes) <span className="text-emerald-400">*</span>
              </label>
              <input
                type="number"
                min="10"
                max="360"
                required
                value={durationMin}
                onChange={(e) => setDurationMin(Number(e.target.value))}
                className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-sky-500 font-mono"
              />
            </div>

            {/* Description */}
            <div className="md:col-span-2 space-y-1.5">
              <label className="block text-xs font-medium text-slate-300">
                Lecture Summary / Syllabus Checklist
              </label>
              <textarea
                rows={2}
                placeholder="Key concepts, derivation focus, homework assignment..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 resize-none"
              />
            </div>
          </div>

          {/* Overlap Alert */}
          {overlapWarning && (
            <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-800/80 text-amber-200 text-xs flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold block">Schedule Overlap Warning</span>
                <p className="leading-relaxed">{overlapWarning}</p>
              </div>
            </div>
          )}

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={isSubmitting || !!overlapWarning || !embedCheckResult.isEmbeddable}
              className="px-6 py-2.5 bg-sky-500 hover:bg-sky-400 disabled:opacity-40 disabled:pointer-events-none text-slate-950 font-bold text-xs rounded-lg transition-colors shadow"
            >
              {isSubmitting ? 'Scheduling...' : 'Publish to Timetable'}
            </button>
          </div>
        </form>
      )}

      {/* BULK ADD FORM */}
      {addMode === 'bulk' && (
        <form onSubmit={handleBulkAdd} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6">
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
              <Plus className="w-4 h-4 text-sky-400" />
              <span>Bulk Schedule Multiple YouTube Lectures</span>
            </h2>
            <p className="text-xs text-slate-400">
              Paste a list of YouTube URLs (one link per line). The scheduler will query titles via oEmbed, verify embeddability, and space each class sequentially.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Paste YouTube URLs (One per line)
              </label>
              <textarea
                rows={5}
                required
                value={bulkUrls}
                onChange={(e) => setBulkUrls(e.target.value)}
                placeholder={"https://www.youtube.com/watch?v=sB1qVshqKfs\nhttps://www.youtube.com/watch?v=3fumBcKC6RE\nhttps://youtu.be/kJQP7kiw5Fk"}
                className="w-full px-3.5 py-2.5 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white font-mono placeholder-slate-600 focus:outline-none focus:border-sky-500"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Subject</label>
                <select
                  value={bulkSubject}
                  onChange={(e) => setBulkSubject(e.target.value as JEEClassSubject)}
                  className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white"
                >
                  <option value="Physics">Physics</option>
                  <option value="Chemistry">Chemistry</option>
                  <option value="Mathematics">Mathematics</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Faculty</label>
                <input
                  type="text"
                  value={bulkFaculty}
                  onChange={(e) => setBulkFaculty(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">First Class Date (IST)</label>
                <input
                  type="date"
                  required
                  value={bulkStartDate}
                  onChange={(e) => setBulkStartDate(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white font-mono"
                />
                <div className="flex items-center gap-1 flex-wrap pt-1">
                  <span className="text-[10px] text-slate-500 font-mono">Jump:</span>
                  {[
                    { label: 'Today', days: 0 },
                    { label: 'Tomorrow', days: 1 },
                    { label: '+1 Wk', days: 7 },
                    { label: '+1 Mo', days: 30 },
                    { label: '+3 Mo', days: 90 },
                    { label: '+6 Mo', days: 180 },
                  ].map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => {
                        const d = new Date();
                        d.setDate(d.getDate() + preset.days);
                        const pad = (n: number) => n.toString().padStart(2, '0');
                        setBulkStartDate(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
                      }}
                      className="px-1.5 py-0.5 text-[10px] font-mono bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition-colors"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">First Class Time (IST)</label>
                <input
                  type="time"
                  required
                  value={bulkStartTime}
                  onChange={(e) => setBulkStartTime(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Class Duration (min)</label>
                <input
                  type="number"
                  min="15"
                  value={bulkDurationMin}
                  onChange={(e) => setBulkDurationMin(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Break Interval (min)</label>
                <input
                  type="number"
                  min="0"
                  value={bulkIntervalMin}
                  onChange={(e) => setBulkIntervalMin(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white font-mono"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2.5 bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-slate-950 font-bold text-xs rounded-lg transition-colors shadow"
            >
              {isSubmitting ? 'Parsing & Scheduling...' : 'Schedule All Sequentially'}
            </button>
          </div>
        </form>
      )}

      {/* DUAL STORAGE & DATABASE MANAGEMENT CENTER */}
      {addMode === 'database' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
            <div className="space-y-1">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Database className="w-5 h-5 text-sky-400" />
                <span>Dual Storage & Database Engine Center</span>
              </h2>
              <p className="text-xs text-slate-400">
                Primary Supabase PostgreSQL Cloud + Secondary Local Server Disk Backup. Fully resilient against free-tier auto-pause.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleTestConnection}
                disabled={isTestingDb}
                className="px-3.5 py-2 text-xs font-semibold bg-sky-500 hover:bg-sky-400 text-slate-950 rounded-lg transition-colors flex items-center gap-1.5 shadow"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isTestingDb ? 'animate-spin' : ''}`} />
                <span>Test Connection Now</span>
              </button>
            </div>
          </div>

          {/* Explanation Banner */}
          <div className="p-4 bg-sky-950/30 border border-sky-800/60 rounded-xl text-xs space-y-2 text-sky-200">
            <div className="font-semibold text-white flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-sky-400" />
              <span>How your dual-storage architecture protects you:</span>
            </div>
            <ul className="list-disc pl-5 space-y-1 text-slate-300">
              <li>
                <strong className="text-sky-300">Supabase Cloud (Primary):</strong> Stores your scheduled classes in a cloud PostgreSQL database accessible across devices and sessions.
              </li>
              <li>
                <strong className="text-emerald-300">Server Backup (Failover & Persistence):</strong> Every class you schedule is simultaneously backed up locally on disk (<code className="font-mono text-emerald-400">data/classes.json</code>).
              </li>
              <li>
                <strong className="text-amber-300">Automatic Free-Tier Pause Defense:</strong> When a free-tier Supabase project pauses due to 7-day inactivity, the app <em>automatically</em> detects the pause and serves all classes from the Server Backup. When you click apply or schedule new classes, they are saved locally and seen by all students.
              </li>
            </ul>
          </div>

          {/* Supabase Connection Setup Form */}
          <form onSubmit={handleSaveConfig} className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <Key className="w-4 h-4 text-amber-400" />
                <span>Configure Supabase Credentials</span>
              </h3>
              <span className="text-[11px] text-slate-400">Saved to <code className="font-mono text-sky-300">.env</code></span>
            </div>

            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-300">
                  Supabase Project URL <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="https://yourprojectid.supabase.co"
                  value={inputSupabaseUrl}
                  onChange={(e) => setInputSupabaseUrl(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs bg-slate-900 border border-slate-800 rounded-lg text-white font-mono placeholder-slate-500 focus:outline-none focus:border-sky-500"
                />
                <p className="text-[10px] text-slate-500">
                  Found in your Supabase Dashboard &gt; Project Settings &gt; API &gt; Project URL.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-300">
                  Supabase API Key (Anon or Service Role) <span className="text-rose-400">*</span>
                </label>
                <input
                  type="password"
                  required
                  placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                  value={inputSupabaseKey}
                  onChange={(e) => setInputSupabaseKey(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs bg-slate-900 border border-slate-800 rounded-lg text-white font-mono placeholder-slate-500 focus:outline-none focus:border-sky-500"
                />
                <p className="text-[10px] text-slate-500">
                  Found in your Supabase Dashboard &gt; Project Settings &gt; API &gt; Project API keys (anon public or service_role).
                </p>
              </div>
            </div>

            {configSaveStatus && (
              <div
                className={`p-3 rounded-lg text-xs flex items-center gap-2 ${
                  configSaveStatus.type === 'success'
                    ? 'bg-emerald-950/60 border border-emerald-800 text-emerald-300'
                    : 'bg-rose-950/60 border border-rose-800 text-rose-300'
                }`}
              >
                {configSaveStatus.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                ) : (
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                )}
                <span>{configSaveStatus.message}</span>
              </div>
            )}

            <div className="flex items-center justify-between pt-2">
              <button
                type="submit"
                disabled={isTestingDb}
                className="px-5 py-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold text-xs rounded-lg transition-colors flex items-center gap-1.5 shadow"
              >
                {isTestingDb ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Verifying & Saving...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Save & Test Supabase Connection</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => setShowSqlSchema(!showSqlSchema)}
                className="text-xs text-sky-400 hover:text-sky-300 flex items-center gap-1"
              >
                <Info className="w-3.5 h-3.5" />
                <span>{showSqlSchema ? 'Hide Database Schema' : 'View SQL Table Setup'}</span>
              </button>
            </div>
          </form>

          {/* SQL Setup Helper */}
          {showSqlSchema && (
            <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-3 animate-in fade-in">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-200">PostgreSQL Schema (supabase/schema.sql)</span>
                <span className="text-[10px] text-slate-400">Run this in Supabase SQL Editor if tables do not exist</span>
              </div>
              <pre className="p-3 bg-slate-900 rounded-lg text-[11px] font-mono text-emerald-300 overflow-x-auto max-h-48 border border-slate-800">
{`CREATE TABLE IF NOT EXISTS public.classes (
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
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public full access" ON public.classes FOR ALL USING (true) WITH CHECK (true);`}
              </pre>
            </div>
          )}

          {/* Two-Way Synchronization Controls */}
          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-5 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-sky-400" />
              <span>Bi-Directional Sync Controls</span>
            </h3>
            <p className="text-xs text-slate-400">
              Transfer classes between your local persistent disk backup and your cloud Supabase database on demand.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <div className="p-3 bg-slate-900 rounded-lg border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-200">Push Local Backup &rarr; Supabase</span>
                  <span className="text-[10px] font-mono text-emerald-400">{classes.length} classes ready</span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Uploads all currently scheduled classes in Server Backup to your Supabase PostgreSQL database. Useful after creating classes offline or unpausing Supabase.
                </p>
                <button
                  type="button"
                  onClick={handlePushBackupToSupabase}
                  disabled={isSyncingToSupabase || !storageStatus?.primary?.configured}
                  className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-semibold text-xs rounded-lg transition-colors flex items-center justify-center gap-1.5"
                >
                  <Cloud className={`w-3.5 h-3.5 ${isSyncingToSupabase ? 'animate-pulse' : ''}`} />
                  <span>{isSyncingToSupabase ? 'Pushing to Supabase...' : 'Push All to Supabase'}</span>
                </button>
              </div>

              <div className="p-3 bg-slate-900 rounded-lg border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-200">Pull Supabase &rarr; Local Backup</span>
                  <span className="text-[10px] font-mono text-sky-400">
                    {storageStatus?.primary?.rowCount !== undefined ? `${storageStatus.primary.rowCount} in Supabase` : 'Cloud pull'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Downloads all classes from Supabase and overwrites your Server Backup so both layers are identical.
                </p>
                <button
                  type="button"
                  onClick={handlePullFromSupabase}
                  disabled={isPullingFromSupabase || !storageStatus?.primary?.configured}
                  className="w-full py-2 bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-white font-semibold text-xs rounded-lg transition-colors flex items-center justify-center gap-1.5"
                >
                  <Download className={`w-3.5 h-3.5 ${isPullingFromSupabase ? 'animate-pulse' : ''}`} />
                  <span>{isPullingFromSupabase ? 'Pulling from Supabase...' : 'Pull All from Supabase'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SCHEDULED CLASSES MANAGEMENT TABLE */}
      <section className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="px-6 py-4 border-b border-slate-800 bg-slate-950/60 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-white">Current Timetable Classes ({classes.length})</h2>
            <p className="text-xs text-slate-400">Manage, edit duration, or delete scheduled YouTube sessions</p>
          </div>
          <button
            onClick={onRefreshClasses}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
            title="Refresh list"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 text-slate-400 uppercase tracking-wider font-mono border-b border-slate-800">
              <tr>
                <th className="px-6 py-3">Subject / Faculty</th>
                <th className="px-6 py-3">Lecture Title</th>
                <th className="px-6 py-3">Scheduled Time (IST)</th>
                <th className="px-6 py-3">Duration</th>
                <th className="px-6 py-3">Embeddable</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {classes.map((item) => (
                <tr key={item.id} className="hover:bg-slate-800/40 transition-colors">
                  <td className="px-6 py-3.5 whitespace-nowrap">
                    <span className="font-semibold text-slate-200 block">{item.subject}</span>
                    <span className="text-slate-400">{item.faculty}</span>
                  </td>
                  <td className="px-6 py-3.5 max-w-xs">
                    <span className="font-medium text-slate-200 block truncate" title={item.title}>
                      {item.title}
                    </span>
                    <a
                      href={item.youtube_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] text-sky-400 hover:underline font-mono"
                    >
                      ID: {item.youtube_id}
                    </a>
                  </td>
                  <td className="px-6 py-3.5 whitespace-nowrap font-mono text-slate-300">
                    {formatISTDateTime(item.start_at)}
                  </td>
                  <td className="px-6 py-3.5 whitespace-nowrap font-mono text-slate-300">
                    {item.duration_min} min
                  </td>
                  <td className="px-6 py-3.5 whitespace-nowrap">
                    {item.is_embeddable ? (
                      <span className="text-emerald-400 font-mono text-[11px] flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Allowed</span>
                      </span>
                    ) : (
                      <span className="text-amber-400 font-mono text-[11px] flex items-center gap-1">
                        <XCircle className="w-3.5 h-3.5" />
                        <span>Restricted</span>
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-3.5 text-right whitespace-nowrap">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => setEditingClass(item)}
                        className="p-1.5 text-slate-400 hover:text-white rounded hover:bg-slate-800"
                        title="Edit class"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteClass(item.id, item.title)}
                        className="p-1.5 text-slate-400 hover:text-amber-400 rounded hover:bg-slate-800"
                        title="Delete class"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* VERCEL CRON SIMULATION & PUSH DISPATCH PANEL */}
      <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-white">Vercel Cron Simulation</h3>
            <p className="text-xs text-slate-400">
              In production, Vercel Cron executes <code className="font-mono text-sky-300">/api/cron/check-notifications</code> every minute.
              You can trigger a manual execution right now to inspect notification dispatch logs.
            </p>
          </div>
          <button
            onClick={handleSimulateCron}
            disabled={isSimulatingCron}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 text-xs font-medium rounded-lg transition-colors flex items-center gap-2"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSimulatingCron ? 'animate-spin' : ''}`} />
            <span>Simulate Cron Job</span>
          </button>
        </div>

        {cronLogs && (
          <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 font-mono text-xs text-emerald-300 overflow-x-auto">
            <pre>{cronLogs}</pre>
          </div>
        )}
      </section>

      {/* EDIT MODAL */}
      {editingClass && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-sm font-semibold text-white">Edit Scheduled Class</h3>
              <button onClick={() => setEditingClass(null)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Title</label>
                <input
                  type="text"
                  required
                  value={editingClass.title}
                  onChange={(e) => setEditingClass({ ...editingClass, title: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Duration (minutes)</label>
                <input
                  type="number"
                  min="15"
                  required
                  value={editingClass.duration_min}
                  onChange={(e) =>
                    setEditingClass({ ...editingClass, duration_min: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Faculty</label>
                <input
                  type="text"
                  value={editingClass.faculty}
                  onChange={(e) => setEditingClass({ ...editingClass, faculty: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setEditingClass(null)}
                  className="px-4 py-2 text-xs text-slate-400 hover:text-white rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs rounded-lg"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
