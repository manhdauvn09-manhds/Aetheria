// Aetheria — Web Audio synthesized SFX.
//
// Procedural SFX so we don't ship any audio assets. Each function plays
// a short envelope-shaped oscillator (or noise) burst with sensible
// volume, cleaning itself up afterwards. All sounds are lazy: the
// AudioContext is only created on the first call (autoplay policy).
//
// Calls are safe under SSR — `getCtx()` returns null when window is
// undefined; callers no-op in that case. There's a global mute flag
// in localStorage ("aetheria.muted") to silence everything in 1 click.
//
// Volume budget: master 0.4, individual envelope peaks under 0.5 so the
// combined output stays comfortable on headphones.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;

const isMuted = (): boolean => {
  if (typeof localStorage === "undefined") return false;
  try { return localStorage.getItem("aetheria.muted") === "1"; } catch { return false; }
};

export const setMuted = (muted: boolean): void => {
  if (typeof localStorage === "undefined") return;
  try { localStorage.setItem("aetheria.muted", muted ? "1" : "0"); } catch { /* ignore */ }
  if (master) master.gain.value = muted ? 0 : 0.4;
};

const getCtx = (): AudioContext | null => {
  if (typeof window === "undefined") return null;
  if (ctx) return ctx;
  type WindowWithWebkit = Window & { webkitAudioContext?: typeof AudioContext };
  const Ctx = window.AudioContext ?? (window as WindowWithWebkit).webkitAudioContext;
  if (!Ctx) return null;
  ctx = new Ctx();
  master = ctx.createGain();
  master.gain.value = isMuted() ? 0 : 0.4;
  master.connect(ctx.destination);
  return ctx;
};

// Helper: oscillator with ADSR-ish envelope
const blip = (
  freq: number,
  duration: number,
  type: OscillatorType = "sine",
  peak = 0.5,
): void => {
  const c = getCtx();
  if (!c || !master) return;
  // Resume from suspended state if needed (autoplay policy)
  if (c.state === "suspended") void c.resume();
  const now = c.currentTime;
  const osc = c.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  const g = c.createGain();
  g.gain.setValueAtTime(0, now);
  g.gain.linearRampToValueAtTime(peak, now + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, now + duration);
  osc.connect(g);
  g.connect(master);
  osc.start(now);
  osc.stop(now + duration + 0.05);
};

// Helper: short noise burst (for hits / impacts)
const noiseBurst = (duration: number, peak = 0.35, highpass = 200): void => {
  const c = getCtx();
  if (!c || !master) return;
  if (c.state === "suspended") void c.resume();
  const now = c.currentTime;
  const bufSize = Math.floor(c.sampleRate * duration);
  const buf = c.createBuffer(1, bufSize, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1);
  const src = c.createBufferSource();
  src.buffer = buf;
  const hp = c.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = highpass;
  const g = c.createGain();
  g.gain.setValueAtTime(peak, now);
  g.gain.exponentialRampToValueAtTime(0.001, now + duration);
  src.connect(hp); hp.connect(g); g.connect(master);
  src.start(now);
};

// ── Public SFX API ────────────────────────────────────────────────────

/** Sharp blade slash — basic melee attack hit. */
export const sfxAttack = (): void => {
  blip(680, 0.06, "sawtooth", 0.4);
  noiseBurst(0.08, 0.25, 1500);
};

/** Heavy crit — emphasized impact. */
export const sfxCrit = (): void => {
  blip(440, 0.08, "square", 0.5);
  blip(880, 0.12, "sawtooth", 0.4);
  noiseBurst(0.12, 0.3, 800);
};

/** Soft chime — defend / buff applied. */
export const sfxBuff = (): void => {
  blip(523.25, 0.12, "triangle", 0.3); // C5
  blip(659.25, 0.14, "triangle", 0.3); // E5
};

/** Healing wisp — gentle rising tone. */
export const sfxHeal = (): void => {
  blip(523.25, 0.08, "sine", 0.25);
  blip(659.25, 0.10, "sine", 0.25);
  blip(783.99, 0.14, "sine", 0.3); // G5
};

/** Power-strike skill use — a bigger arc up. */
export const sfxSkill = (): void => {
  blip(220, 0.05, "square", 0.3);
  blip(440, 0.07, "sawtooth", 0.4);
  blip(880, 0.10, "triangle", 0.35);
};

/** Resonance triggered — distinctive shimmery rise. */
export const sfxResonance = (): void => {
  blip(523.25, 0.10, "triangle", 0.35);
  blip(659.25, 0.12, "triangle", 0.35);
  blip(783.99, 0.14, "triangle", 0.35);
  blip(1046.5, 0.20, "triangle", 0.4); // C6
};

/** Actor defeated — short descending drone. */
export const sfxDefeat = (): void => {
  blip(220, 0.20, "sawtooth", 0.4);
  blip(110, 0.30, "sawtooth", 0.35);
};

/** Victory jingle — quick uplifting 3-note. */
export const sfxVictory = (): void => {
  const c = getCtx();
  if (!c) return;
  const t = c.currentTime;
  // Schedule 3 notes ~120ms apart at increasing pitch
  for (let i = 0; i < 3; i++) {
    setTimeout(() => blip(523.25 * Math.pow(2, i / 6), 0.16, "triangle", 0.4), i * 120);
  }
};

/** Defeat jingle — descending minor. */
export const sfxLoss = (): void => {
  for (let i = 0; i < 3; i++) {
    setTimeout(() => blip(440 * Math.pow(2, -i / 6), 0.20, "sawtooth", 0.4), i * 160);
  }
};

/** Button click feedback (subtle). */
export const sfxClick = (): void => {
  blip(1200, 0.03, "square", 0.18);
};
