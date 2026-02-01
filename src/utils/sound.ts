let audioCtx: AudioContext | null = null;
let lastSoundAt = 0;

const SOUND_COOLDOWN_MS = 60;

const ensureContext = () => {
  if (audioCtx) return audioCtx;
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextClass) return null;
  audioCtx = new AudioContextClass();
  return audioCtx;
};

const canPlay = () => {
  if (typeof localStorage === 'undefined') return false;
  const enabled = localStorage.getItem('soundEnabled');
  if (enabled === null) return true;
  return enabled === 'true';
};

const playTone = (frequency: number, durationMs: number, type: OscillatorType, gainValue: number) => {
  if (!canPlay()) return;
  const now = performance.now();
  if (now - lastSoundAt < SOUND_COOLDOWN_MS) return;
  lastSoundAt = now;

  const ctx = ensureContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = frequency;

  const start = ctx.currentTime;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(gainValue, start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + durationMs / 1000);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(start);
  osc.stop(start + durationMs / 1000 + 0.02);
};

export const playTick = () => playTone(1200, 70, 'square', 0.08);
export const playMove = () => playTone(520, 90, 'triangle', 0.1);
export const playCapture = () => playTone(220, 140, 'sawtooth', 0.12);

export const isSoundEnabled = () => canPlay();
