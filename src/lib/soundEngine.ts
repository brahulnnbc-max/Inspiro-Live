let sharedAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!sharedAudioCtx) {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioCtx) {
      sharedAudioCtx = new AudioCtx();
    }
  }
  if (sharedAudioCtx && sharedAudioCtx.state === 'suspended') {
    sharedAudioCtx.resume().catch(() => {});
  }
  return sharedAudioCtx;
}

function playTone(freq: number, durationSec: number, type: OscillatorType = 'sine', gainVal = 0.08, delaySec = 0) {
  const ctx = getAudioContext();
  if (!ctx) return;

  const startTime = ctx.currentTime + delaySec;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(freq, startTime);

  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(gainVal, startTime + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + durationSec);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(startTime);
  osc.stop(startTime + durationSec + 0.02);
}

export function playLiveGateBell(muted: boolean) {
  if (muted) return;
  playTone(659.25, 0.22, 'triangle', 0.1, 0);
  playTone(880, 0.35, 'triangle', 0.12, 0.14);
}

export function playCountdownTick(muted: boolean, isFinalThree: boolean) {
  if (muted) return;
  playTone(isFinalThree ? 980 : 720, 0.06, 'sine', isFinalThree ? 0.09 : 0.045, 0);
}

export function playSlideAdvanceSound(muted: boolean) {
  if (muted) return;
  playTone(523.25, 0.1, 'triangle', 0.08, 0);
  playTone(783.99, 0.16, 'triangle', 0.08, 0.07);
}

export function playEmergencyHoldSound(muted: boolean) {
  if (muted) return;
  playTone(440, 0.14, 'sawtooth', 0.06, 0);
  playTone(554.37, 0.2, 'triangle', 0.08, 0.1);
}

export function playPresenceCheckPing(muted: boolean) {
  if (muted) return;
  playTone(880, 0.12, 'sine', 0.09, 0);
  playTone(1174.66, 0.18, 'sine', 0.09, 0.11);
}

export function playClassroomShutterLock(muted: boolean) {
  if (muted) return;
  playTone(587.33, 0.18, 'triangle', 0.1, 0);
  playTone(440, 0.22, 'triangle', 0.1, 0.15);
  playTone(329.63, 0.38, 'triangle', 0.12, 0.32);
}

let activeAlarmTimer: number | null = null;

export function startRepeatingClassroomAlarm(): () => void {
  stopRepeatingClassroomAlarm();
  getAudioContext();

  let step = 0;
  const playPulse = () => {
    // High-urgency alternating chime: 880Hz -> 1175Hz
    const freq = step % 2 === 0 ? 880 : 1175;
    playTone(freq, 0.18, 'triangle', 0.18, 0);
    playTone(freq * 1.5, 0.12, 'sine', 0.08, 0.05);

    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate([200, 100, 200]);
      } catch {
        // ignore
      }
    }
    step++;
  };

  playPulse();
  activeAlarmTimer = window.setInterval(playPulse, 900);

  return stopRepeatingClassroomAlarm;
}

export function stopRepeatingClassroomAlarm() {
  if (activeAlarmTimer !== null) {
    window.clearInterval(activeAlarmTimer);
    activeAlarmTimer = null;
  }
}
