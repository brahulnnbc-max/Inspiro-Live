export enum Subject {
  PHYSICS = 'Physics',
  CHEMISTRY = 'Chemistry',
  MATHEMATICS = 'Mathematics',
}

export enum BroadcastOrientation {
  VERTICAL = 'VERTICAL',
  LANDSCAPE = 'LANDSCAPE',
}

export enum SlideSourceType {
  PDF_PAGE = 'PDF_PAGE',
  STATIC_PDF_URL = 'STATIC_PDF_URL',
  IMAGE_DATA = 'IMAGE_DATA',
  DEMO_BOARD = 'DEMO_BOARD',
}

export enum PlaybackMode {
  LIVE = 'LIVE',
  RECORDED_REPLAY = 'RECORDED_REPLAY',
  DOUBT_LIVE = 'DOUBT_LIVE',
}

export enum SessionCategory {
  PRIMARY_CHAPTER = 'PRIMARY_CHAPTER',
  SPACED_REVISION = 'SPACED_REVISION',
}

export enum ComputedClassState {
  UPCOMING = 'UPCOMING',
  LOBBY = 'LOBBY',
  LIVE_NOW = 'LIVE_NOW',
  LOCKED_COOLDOWN = 'LOCKED_COOLDOWN',
  RECORDED_READY = 'RECORDED_READY',
}

export interface DemoBoardSpec {
  heading: string;
  subtopic: string;
  subject: Subject;
  formulas: string[];
  examTrap: string;
  keyPoints: string[];
}

export interface SlideDescriptor {
  index: number;
  label: string;
  sourceType: SlideSourceType;
  mediaKey?: string;
  pdfUrl?: string;
  pdfPageNumber?: number;
  demoSpec?: DemoBoardSpec;
  originalSlideIndex?: number;
}

export interface LiveSession {
  id: string;
  title: string;
  subject: Subject;
  chapterName: string;
  scheduledStartMs: number;
  baseSecondsPerSlide: number;
  emergencySecondsPerSlide: number;
  hardCloseMs: number;
  defaultOrientation: BroadcastOrientation;
  slides: SlideDescriptor[];
  lockedAtMs: number;
  isDemo?: boolean;
  moduleCode?: string;
  // Spaced Repetition (6:00 AM Ebbinghaus Pipeline) metadata
  category?: SessionCategory;
  parentChapterId?: string;
  repetitionStage?: number;
  repetitionIntervalDays?: number;
  isDoubtTelecast?: boolean;
  spacedScheduleGenerated?: boolean;
  // Append-only live telemetry (schedule fields above are strictly immutable)
  emergencyUsedBySlide: Record<number, number>;
  attendedSlides: number[];
  lateMissedSlides: number[];
  starredSlideIndices: number[];
  presenceChecksPassed: number;
  presenceChecksMissed: number;
  tabSwitchCount: number;
  firstJoinedLiveAtMs?: number;
  finalizedAfterLive?: boolean;
  missedCooldownUntilMs?: number;
  recordedReplaysCount: number;
}
