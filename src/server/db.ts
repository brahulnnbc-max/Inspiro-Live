import type { JEEClass, PushSubscriptionData } from '../types/class.ts';

// Default seeded classes relative to current time so there is always a LIVE class, an UPCOMING class, and a REPLAY class
function generateInitialClasses(): JEEClass[] {
  const now = Date.now();

  return [
    {
      id: 'class-physics-rotational',
      title: 'Rotational Motion: Moment of Inertia & Pure Rolling',
      subject: 'Physics',
      faculty: 'Er. R. Sharma (Ex-IIT Delhi)',
      topic: 'Mechanics (JEE Advanced Level)',
      description: 'Rigid body dynamics, theorem of parallel & perpendicular axes, and instantaneous center of rotation with previous year question breakdowns.',
      youtube_url: 'https://www.youtube.com/watch?v=x0_z2_t6a_w',
      youtube_id: 'x0_z2_t6a_w',
      // Started 15 minutes ago, lasts 90 minutes -> currently LIVE!
      start_at: new Date(now - 15 * 60 * 1000).toISOString(),
      duration_min: 90,
      is_embeddable: true,
      thumbnail_url: '/images/jee_physics_thumb_1791042406423.jpg',
      created_at: new Date(now - 86400000).toISOString(),
    },
    {
      id: 'class-math-calculus',
      title: 'Definite Integration & Area Under Curves (PYQs)',
      subject: 'Mathematics',
      faculty: 'Prof. A. N. Murthy (IIT Madras Alumni)',
      topic: 'Integral Calculus (JEE Main + Adv)',
      description: 'Properties of definite integrals, Leibniz rule of differentiation, and graphical symmetry methods for high-speed problem solving.',
      youtube_url: 'https://www.youtube.com/watch?v=3fumBcKC6RE',
      youtube_id: '3fumBcKC6RE',
      // Starts in 20 minutes
      start_at: new Date(now + 20 * 60 * 1000).toISOString(),
      duration_min: 75,
      is_embeddable: true,
      thumbnail_url: '/images/jee_math_thumb_1791042443540.jpg',
      created_at: new Date(now - 43200000).toISOString(),
    },
    {
      id: 'class-chem-coordination',
      title: 'Coordination Chemistry & Crystal Field Theory',
      subject: 'Chemistry',
      faculty: 'Dr. Neha Agarwal (Ph.D. Chemistry)',
      topic: 'Inorganic Chemistry',
      description: 'Spectrochemical series, isomerism in coordination complexes, high spin vs low spin splitting and magnetic moment calculations.',
      youtube_url: 'https://www.youtube.com/watch?v=kJQP7kiw5Fk',
      youtube_id: 'kJQP7kiw5Fk',
      // Tomorrow at 10:00 AM IST
      start_at: new Date(now + 18 * 60 * 60 * 1000).toISOString(),
      duration_min: 60,
      is_embeddable: true,
      thumbnail_url: '/images/jee_chemistry_thumb_1791042430591.jpg',
      created_at: new Date(now - 20000000).toISOString(),
    },
    {
      id: 'class-physics-electrostatics',
      title: 'Electrostatics & Gauss Law: Advanced Applications',
      subject: 'Physics',
      faculty: 'Er. R. Sharma (Ex-IIT Delhi)',
      topic: 'Electromagnetism',
      description: 'Electric flux calculation through closed surfaces, conducting shells, self-energy of charge distribution, and electrostatic shielding.',
      youtube_url: 'https://www.youtube.com/watch?v=hB9pZ3v9sW8',
      youtube_id: 'hB9pZ3v9sW8',
      // Completed 3 hours ago -> REPLAY
      start_at: new Date(now - 4 * 60 * 60 * 1000).toISOString(),
      duration_min: 90,
      is_embeddable: true,
      thumbnail_url: '/images/jee_classroom_hero_1791042392139.jpg',
      created_at: new Date(now - 172800000).toISOString(),
    },
  ];
}

// In-memory data cache
let classesStore: JEEClass[] = generateInitialClasses();
let subscriptionsStore: PushSubscriptionData[] = [];

export async function getAllClasses(): Promise<JEEClass[]> {
  // Sort by start_at ascending
  return [...classesStore].sort(
    (a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime()
  );
}

export async function getClassById(id: string): Promise<JEEClass | null> {
  const found = classesStore.find((c) => c.id === id);
  return found || null;
}

export async function createClass(data: Omit<JEEClass, 'id' | 'created_at'>): Promise<JEEClass> {
  const newClass: JEEClass = {
    ...data,
    id: `class-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    created_at: new Date().toISOString(),
  };
  classesStore.push(newClass);
  return newClass;
}

export async function updateClass(id: string, updates: Partial<JEEClass>): Promise<JEEClass | null> {
  const index = classesStore.findIndex((c) => c.id === id);
  if (index === -1) return null;
  classesStore[index] = {
    ...classesStore[index],
    ...updates,
  };
  return classesStore[index];
}

export async function deleteClass(id: string): Promise<boolean> {
  const initialLength = classesStore.length;
  classesStore = classesStore.filter((c) => c.id !== id);
  return classesStore.length < initialLength;
}

export async function resetClasses(): Promise<JEEClass[]> {
  classesStore = generateInitialClasses();
  return getAllClasses();
}

export async function savePushSubscription(sub: PushSubscriptionData): Promise<void> {
  const exists = subscriptionsStore.find((s) => s.endpoint === sub.endpoint);
  if (!exists) {
    subscriptionsStore.push(sub);
  }
}

export async function getPushSubscriptions(): Promise<PushSubscriptionData[]> {
  return [...subscriptionsStore];
}
