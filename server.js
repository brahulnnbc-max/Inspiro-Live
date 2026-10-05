// server.ts
import express2 from "express";
import { createServer as createViteServer } from "vite";
import path2 from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

// src/server/api.ts
import express from "express";
import webpush from "web-push";

// src/server/db.ts
import fs from "fs";
import path from "path";
function generateInitialClasses() {
  const now = Date.now();
  return [
    {
      id: "class-physics-rotational",
      title: "Rotational Motion: Moment of Inertia & Pure Rolling",
      subject: "Physics",
      faculty: "Er. R. Sharma (Ex-IIT Delhi)",
      topic: "Mechanics (JEE Advanced Level)",
      description: "Rigid body dynamics, theorem of parallel & perpendicular axes, and instantaneous center of rotation with previous year question breakdowns.",
      youtube_url: "https://www.youtube.com/watch?v=x0_z2_t6a_w",
      youtube_id: "x0_z2_t6a_w",
      // Started 15 minutes ago, lasts 90 minutes -> currently LIVE!
      start_at: new Date(now - 15 * 60 * 1e3).toISOString(),
      duration_min: 90,
      is_embeddable: true,
      thumbnail_url: "/images/jee_physics_thumb_1791042406423.jpg",
      created_at: new Date(now - 864e5).toISOString()
    },
    {
      id: "class-math-calculus",
      title: "Definite Integration & Area Under Curves (PYQs)",
      subject: "Mathematics",
      faculty: "Prof. A. N. Murthy (IIT Madras Alumni)",
      topic: "Integral Calculus (JEE Main + Adv)",
      description: "Properties of definite integrals, Leibniz rule of differentiation, and graphical symmetry methods for high-speed problem solving.",
      youtube_url: "https://www.youtube.com/watch?v=3fumBcKC6RE",
      youtube_id: "3fumBcKC6RE",
      // Starts in 20 minutes
      start_at: new Date(now + 20 * 60 * 1e3).toISOString(),
      duration_min: 75,
      is_embeddable: true,
      thumbnail_url: "/images/jee_math_thumb_1791042443540.jpg",
      created_at: new Date(now - 432e5).toISOString()
    },
    {
      id: "class-chem-coordination",
      title: "Coordination Chemistry & Crystal Field Theory",
      subject: "Chemistry",
      faculty: "Dr. Neha Agarwal (Ph.D. Chemistry)",
      topic: "Inorganic Chemistry",
      description: "Spectrochemical series, isomerism in coordination complexes, high spin vs low spin splitting and magnetic moment calculations.",
      youtube_url: "https://www.youtube.com/watch?v=kJQP7kiw5Fk",
      youtube_id: "kJQP7kiw5Fk",
      // Tomorrow at 10:00 AM IST
      start_at: new Date(now + 18 * 60 * 60 * 1e3).toISOString(),
      duration_min: 60,
      is_embeddable: true,
      thumbnail_url: "/images/jee_chemistry_thumb_1791042430591.jpg",
      created_at: new Date(now - 2e7).toISOString()
    },
    {
      id: "class-physics-electrostatics",
      title: "Electrostatics & Gauss Law: Advanced Applications",
      subject: "Physics",
      faculty: "Er. R. Sharma (Ex-IIT Delhi)",
      topic: "Electromagnetism",
      description: "Electric flux calculation through closed surfaces, conducting shells, self-energy of charge distribution, and electrostatic shielding.",
      youtube_url: "https://www.youtube.com/watch?v=hB9pZ3v9sW8",
      youtube_id: "hB9pZ3v9sW8",
      // Completed 3 hours ago -> REPLAY
      start_at: new Date(now - 4 * 60 * 60 * 1e3).toISOString(),
      duration_min: 90,
      is_embeddable: true,
      thumbnail_url: "/images/jee_classroom_hero_1791042392139.jpg",
      created_at: new Date(now - 1728e5).toISOString()
    }
  ];
}
var DATA_DIR = path.resolve(process.cwd(), "data");
var CLASSES_FILE = path.join(DATA_DIR, "classes.json");
if (!fs.existsSync(DATA_DIR)) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (e) {
  }
}
function loadPersistedClasses() {
  try {
    if (fs.existsSync(CLASSES_FILE)) {
      const raw = fs.readFileSync(CLASSES_FILE, "utf8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn("Failed to read classes.json:", e);
  }
  return [];
}
function persistClasses() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(CLASSES_FILE, JSON.stringify(classesStore, null, 2), "utf8");
  } catch (e) {
    console.error("Failed to write classes.json:", e);
  }
}
var classesStore = loadPersistedClasses();
var subscriptionsStore = [];
async function getAllClasses() {
  return [...classesStore].sort(
    (a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime()
  );
}
async function getClassById(id) {
  const found = classesStore.find((c) => c.id === id);
  return found || null;
}
async function createClass(data) {
  const newClass = {
    ...data,
    id: `class-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    created_at: (/* @__PURE__ */ new Date()).toISOString()
  };
  classesStore.push(newClass);
  persistClasses();
  return newClass;
}
async function updateClass(id, updates) {
  const index = classesStore.findIndex((c) => c.id === id);
  if (index === -1) return null;
  classesStore[index] = {
    ...classesStore[index],
    ...updates
  };
  persistClasses();
  return classesStore[index];
}
async function deleteClass(id) {
  const initialLength = classesStore.length;
  classesStore = classesStore.filter((c) => c.id !== id);
  const deleted = classesStore.length < initialLength;
  if (deleted) {
    persistClasses();
  }
  return deleted;
}
async function clearAllClasses() {
  classesStore = [];
  persistClasses();
}
async function resetClasses() {
  classesStore = generateInitialClasses();
  persistClasses();
  return getAllClasses();
}
async function savePushSubscription(sub) {
  const exists = subscriptionsStore.find((s) => s.endpoint === sub.endpoint);
  if (!exists) {
    subscriptionsStore.push(sub);
  }
}
async function getPushSubscriptions() {
  return [...subscriptionsStore];
}
var BOOKMARKS_FILE = path.join(DATA_DIR, "bookmarks.json");
function loadPersistedBookmarks() {
  try {
    if (fs.existsSync(BOOKMARKS_FILE)) {
      const raw = fs.readFileSync(BOOKMARKS_FILE, "utf8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.warn("Failed to read bookmarks.json:", e);
  }
  return [];
}
var bookmarksStore = loadPersistedBookmarks();
function persistBookmarks() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(BOOKMARKS_FILE, JSON.stringify(bookmarksStore, null, 2), "utf8");
  } catch (e) {
    console.error("Failed to write bookmarks.json:", e);
  }
}
async function getAllServerBookmarks() {
  return [...bookmarksStore];
}
async function addServerBookmark(bm) {
  bookmarksStore.push(bm);
  persistBookmarks();
  return bm;
}
async function deleteServerBookmark(id) {
  const initialLength = bookmarksStore.length;
  bookmarksStore = bookmarksStore.filter((b) => b.id !== id);
  if (bookmarksStore.length < initialLength) {
    persistBookmarks();
    return true;
  }
  return false;
}
var STUDY_HOURS_FILE = path.join(DATA_DIR, "studyHours.json");
function loadPersistedStudyRecords() {
  try {
    if (fs.existsSync(STUDY_HOURS_FILE)) {
      const raw = fs.readFileSync(STUDY_HOURS_FILE, "utf8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.warn("Failed to read studyHours.json:", e);
  }
  return [];
}
var studyRecordsStore = loadPersistedStudyRecords();
function persistStudyRecords() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(STUDY_HOURS_FILE, JSON.stringify(studyRecordsStore, null, 2), "utf8");
  } catch (e) {
    console.error("Failed to write studyHours.json:", e);
  }
}
async function getAllServerStudyRecords() {
  return [...studyRecordsStore];
}
async function saveServerStudyRecords(records) {
  studyRecordsStore = records;
  persistStudyRecords();
}
var ATTENDANCE_FILE = path.join(DATA_DIR, "attendance.json");
function loadPersistedAttendance() {
  try {
    if (fs.existsSync(ATTENDANCE_FILE)) {
      const raw = fs.readFileSync(ATTENDANCE_FILE, "utf8");
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") return parsed;
    }
  } catch (e) {
    console.warn("Failed to read attendance.json:", e);
  }
  return {};
}
var attendanceStore = loadPersistedAttendance();
function persistAttendance() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(ATTENDANCE_FILE, JSON.stringify(attendanceStore, null, 2), "utf8");
  } catch (e) {
    console.error("Failed to write attendance.json:", e);
  }
}
async function getServerAttendance() {
  return { ...attendanceStore };
}
async function saveServerAttendance(map) {
  attendanceStore = { ...attendanceStore, ...map };
  persistAttendance();
}

// src/lib/youtube.ts
function extractYouTubeId(urlOrId) {
  if (!urlOrId) return null;
  const trimmed = urlOrId.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }
  const regExp = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?|live|shorts)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
  const match = trimmed.match(regExp);
  return match && match[1] ? match[1] : null;
}
async function verifyYouTubeEmbeddability(videoIdOrUrl) {
  const videoId = extractYouTubeId(videoIdOrUrl);
  if (!videoId) {
    return {
      isEmbeddable: false,
      reason: "Invalid YouTube link or Video ID provided."
    };
  }
  const oEmbedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
  try {
    const res = await fetch(oEmbedUrl);
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        return {
          isEmbeddable: false,
          reason: "Video embedding is disabled by the creator or restricted to YouTube.com."
        };
      }
      if (res.status === 404) {
        return {
          isEmbeddable: false,
          reason: "Video not found, private, or removed."
        };
      }
      return {
        isEmbeddable: false,
        reason: `YouTube oEmbed returned status ${res.status}`
      };
    }
    const data = await res.json();
    return {
      isEmbeddable: true,
      title: data.title || "JEE Lecture",
      authorName: data.author_name || "Faculty",
      thumbnailUrl: data.thumbnail_url || `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
    };
  } catch (error) {
    console.warn("oEmbed check fallback:", error);
    return {
      isEmbeddable: true,
      title: "Scheduled JEE Lecture",
      thumbnailUrl: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
    };
  }
}

// src/lib/istTime.ts
function formatISTDateTime(isoString) {
  const d = new Date(isoString);
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
    hour12: true
  }).format(d);
}

// src/lib/overlap.ts
function checkScheduleOverlap(candidate, existingClasses) {
  const candidateStart = new Date(candidate.start_at).getTime();
  if (isNaN(candidateStart)) {
    return { hasOverlap: false };
  }
  const candidateEnd = candidateStart + candidate.duration_min * 60 * 1e3;
  for (const existing of existingClasses) {
    if (candidate.id && existing.id === candidate.id) {
      continue;
    }
    const existingStart = new Date(existing.start_at).getTime();
    const existingEnd = existingStart + existing.duration_min * 60 * 1e3;
    const isOverlapping = candidateStart < existingEnd && existingStart < candidateEnd;
    if (isOverlapping) {
      const conflictStartIST = formatISTDateTime(existing.start_at);
      return {
        hasOverlap: true,
        conflictingClass: existing,
        message: `Schedule conflict with "${existing.title}" (${existing.subject}), scheduled at ${conflictStartIST} for ${existing.duration_min} mins.`
      };
    }
  }
  return { hasOverlap: false };
}

// src/server/api.ts
var { Router } = express;
var apiRouter = Router();
var VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "";
var VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
var VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:admin@jeelivesync.edu";
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  try {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  } catch (err) {
    console.warn("VAPID setup warning:", err);
  }
}
apiRouter.get("/classes", async (req, res) => {
  try {
    const classes = await getAllClasses();
    res.json({ classes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
apiRouter.get("/classes/:id", async (req, res) => {
  try {
    const cls = await getClassById(req.params.id);
    if (!cls) {
      return res.status(404).json({ error: "Class not found" });
    }
    res.json({ class: cls });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
apiRouter.post("/classes/reset", async (req, res) => {
  try {
    const classes = await resetClasses();
    res.json({ success: true, classes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
apiRouter.post("/classes/clear", async (req, res) => {
  try {
    await clearAllClasses();
    res.json({ success: true, classes: [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
apiRouter.post("/admin/login", (req, res) => {
  const { password } = req.body;
  const configuredPassword = process.env.ADMIN_PASSWORD || "insprioLive@7858";
  if (password && password.trim() === configuredPassword.trim()) {
    const token = Buffer.from(`admin:${Date.now()}`).toString("base64");
    return res.json({ success: true, token });
  }
  return res.status(401).json({ error: "Invalid admin credentials. Please enter the authorized administrator password." });
});
apiRouter.post("/check-embeddability", async (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: "URL is required" });
  }
  const result = await verifyYouTubeEmbeddability(url);
  res.json(result);
});
apiRouter.post("/classes", async (req, res) => {
  try {
    const { title, subject, faculty, topic, description, youtube_url, start_at, duration_min } = req.body;
    if (!title || !youtube_url || !start_at || !duration_min) {
      return res.status(400).json({ error: "Missing required class fields" });
    }
    const youtube_id = extractYouTubeId(youtube_url);
    if (!youtube_id) {
      return res.status(400).json({ error: "Invalid YouTube URL or ID" });
    }
    const existingClasses = await getAllClasses();
    const overlap = checkScheduleOverlap(
      {
        start_at,
        duration_min: Number(duration_min)
      },
      existingClasses
    );
    if (overlap.hasOverlap) {
      return res.status(409).json({
        error: "Overlap Conflict",
        message: overlap.message,
        conflictingClass: overlap.conflictingClass
      });
    }
    const embedResult = await verifyYouTubeEmbeddability(youtube_id);
    const newClass = await createClass({
      title: title.trim(),
      subject: subject || "Physics",
      faculty: faculty ? faculty.trim() : "JEE Faculty",
      topic: topic ? topic.trim() : void 0,
      description: description ? description.trim() : void 0,
      youtube_url,
      youtube_id,
      start_at: new Date(start_at).toISOString(),
      duration_min: Number(duration_min),
      is_embeddable: embedResult.isEmbeddable,
      thumbnail_url: embedResult.thumbnailUrl || `https://img.youtube.com/vi/${youtube_id}/hqdefault.jpg`
    });
    res.status(201).json({ class: newClass, warning: embedResult.isEmbeddable ? null : embedResult.reason });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
apiRouter.put("/classes/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    if (updates.youtube_url) {
      const extracted = extractYouTubeId(updates.youtube_url);
      if (extracted) {
        updates.youtube_id = extracted;
      }
    }
    if (updates.start_at || updates.duration_min) {
      const existingClasses = await getAllClasses();
      const current = await getClassById(id);
      if (!current) return res.status(404).json({ error: "Class not found" });
      const overlap = checkScheduleOverlap(
        {
          id,
          start_at: updates.start_at || current.start_at,
          duration_min: Number(updates.duration_min || current.duration_min)
        },
        existingClasses
      );
      if (overlap.hasOverlap) {
        return res.status(409).json({
          error: "Overlap Conflict",
          message: overlap.message,
          conflictingClass: overlap.conflictingClass
        });
      }
    }
    const updated = await updateClass(id, updates);
    if (!updated) {
      return res.status(404).json({ error: "Class not found" });
    }
    res.json({ class: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
apiRouter.delete("/classes/:id", async (req, res) => {
  try {
    const success = await deleteClass(req.params.id);
    if (!success) {
      return res.status(404).json({ error: "Class not found" });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
apiRouter.post("/push/subscribe", async (req, res) => {
  try {
    const { subscription, userAgent } = req.body;
    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ error: "Invalid subscription object" });
    }
    await savePushSubscription({
      endpoint: subscription.endpoint,
      keys: subscription.keys,
      userAgent
    });
    res.json({ success: true, message: "Subscription saved" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
apiRouter.get("/cron/check-notifications", async (req, res) => {
  try {
    const now = Date.now();
    const classes = await getAllClasses();
    const subscriptions = await getPushSubscriptions();
    const notificationsDispatched = [];
    for (const cls of classes) {
      const startTime = new Date(cls.start_at).getTime();
      const diffMs = startTime - now;
      const diffMin = Math.round(diffMs / 6e4);
      if (diffMin <= 15 && diffMin > 0 && !cls.notification_15m_sent) {
        cls.notification_15m_sent = true;
        notificationsDispatched.push({
          classId: cls.id,
          title: `Starts in ${diffMin}m: ${cls.title}`,
          type: "15m_reminder"
        });
        const payload = JSON.stringify({
          title: `JEE Live in ${diffMin} mins`,
          body: `${cls.subject}: ${cls.title} with ${cls.faculty}. Tap to prepare your notebook.`,
          url: `/classroom/${cls.id}`,
          classId: cls.id
        });
        for (const sub of subscriptions) {
          try {
            if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
              await webpush.sendNotification(sub, payload);
            }
          } catch (e) {
            console.warn("Failed push send to subscriber:", e);
          }
        }
      }
      if (diffMin <= 0 && diffMin >= -5 && !cls.notification_live_sent) {
        cls.notification_live_sent = true;
        notificationsDispatched.push({
          classId: cls.id,
          title: `Live Now: ${cls.title}`,
          type: "live_now"
        });
        const payload = JSON.stringify({
          title: `\u{1F534} Class is Live Now!`,
          body: `${cls.subject}: ${cls.title}. Clock-locked stream has started. Join now!`,
          url: `/classroom/${cls.id}`,
          classId: cls.id
        });
        for (const sub of subscriptions) {
          try {
            if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
              await webpush.sendNotification(sub, payload);
            }
          } catch (e) {
            console.warn("Failed push send to subscriber:", e);
          }
        }
      }
    }
    res.json({
      success: true,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      activeSubscribers: subscriptions.length,
      dispatchedCount: notificationsDispatched.length,
      notificationsDispatched
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
apiRouter.get("/bookmarks", async (req, res) => {
  try {
    const list = await getAllServerBookmarks();
    res.json({ bookmarks: list });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
apiRouter.post("/bookmarks", async (req, res) => {
  try {
    const bm = req.body;
    if (!bm || !bm.classId || typeof bm.seconds !== "number") {
      return res.status(400).json({ error: "Missing required bookmark parameters" });
    }
    const saved = await addServerBookmark(bm);
    res.status(201).json({ success: true, bookmark: saved });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
apiRouter.delete("/bookmarks/:id", async (req, res) => {
  try {
    const deleted = await deleteServerBookmark(req.params.id);
    res.json({ success: deleted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
apiRouter.get("/study-records", async (req, res) => {
  try {
    const records = await getAllServerStudyRecords();
    res.json({ records });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
apiRouter.post("/study-records", async (req, res) => {
  try {
    const { records } = req.body;
    if (Array.isArray(records)) {
      await saveServerStudyRecords(records);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
apiRouter.get("/attendance", async (req, res) => {
  try {
    const map = await getServerAttendance();
    res.json({ attendance: map });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
apiRouter.post("/attendance", async (req, res) => {
  try {
    const { attendance } = req.body;
    if (attendance && typeof attendance === "object") {
      await saveServerAttendance(attendance);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// server.ts
dotenv.config();
var __filename = fileURLToPath(import.meta.url);
var __dirname = path2.dirname(__filename);
async function startServer() {
  const app = express2();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3e3;
  app.use(express2.json());
  app.get("/healthz", (_req, res) => {
    res.status(200).send("OK");
  });
  app.use("/api", apiRouter);
  const isDev = process.env.NODE_ENV === "development" || process.env.NODE_ENV !== "production" && !process.env.PORT;
  if (isDev) {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== "true",
        watch: process.env.DISABLE_HMR === "true" ? null : {}
      },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path2.resolve(__dirname, "dist");
    app.use(express2.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path2.resolve(distPath, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`JEE LiveSync Server running at http://0.0.0.0:${PORT}`);
  });
}
startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
