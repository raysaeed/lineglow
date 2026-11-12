// Everything is stored in localStorage, so scripts and settings never leave the device.

export interface Script {
  id: string;
  title: string;
  text: string;
  updatedAt: number;
}

export interface Settings {
  /** 1–30. Scroll rate is proportional to line height, so it feels the same at any font size. */
  speed: number;
  /** Font size in CSS pixels. */
  fontSize: number;
  mirror: boolean;
  line: boolean;
  /** Seconds to count down before scrolling starts. 0 disables it. */
  countdown: number;
}

const SCRIPTS_KEY = 'lineglow.scripts.v1';
const SETTINGS_KEY = 'lineglow.settings.v1';

export const LIMITS = {
  speed: { min: 1, max: 30, step: 1 },
  fontSize: { min: 20, max: 120, step: 4 },
} as const;

const SAMPLE_TEXT = `Welcome to LineGlow.

This is a sample script. Tap play and read along as the text moves past the glowing line.

Tap the screen at any time to bring the controls back. From there you can pause, change the speed, or make the text bigger.

You can also drag the text up or down to find your place.

When you are ready, go back, make a new script, and paste in your own words.

Good luck with your recording.`;

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage is full or blocked. The app keeps working for this visit.
  }
}

function newId(): string {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// ---- Scripts ----

let scripts: Script[] = (() => {
  const saved = read<Script[]>(SCRIPTS_KEY);
  if (Array.isArray(saved)) return saved;
  // First visit: start with a sample so there is something to try.
  const sample: Script[] = [
    { id: newId(), title: 'Welcome to LineGlow', text: SAMPLE_TEXT, updatedAt: Date.now() },
  ];
  write(SCRIPTS_KEY, sample);
  return sample;
})();

export function listScripts(): Script[] {
  return [...scripts].sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getScript(id: string): Script | undefined {
  return scripts.find((s) => s.id === id);
}

export function createScript(): Script {
  const script: Script = { id: newId(), title: '', text: '', updatedAt: Date.now() };
  scripts.push(script);
  write(SCRIPTS_KEY, scripts);
  return script;
}

export function updateScript(id: string, patch: Partial<Pick<Script, 'title' | 'text'>>): void {
  const script = getScript(id);
  if (!script) return;
  Object.assign(script, patch, { updatedAt: Date.now() });
  write(SCRIPTS_KEY, scripts);
}

export function deleteScript(id: string): void {
  scripts = scripts.filter((s) => s.id !== id);
  write(SCRIPTS_KEY, scripts);
}

/** The title to show for a script: its own title, or its first line of text. */
export function displayTitle(script: Script): string {
  const title = script.title.trim();
  if (title) return title;
  const firstLine = script.text.trim().split('\n')[0]?.trim() ?? '';
  return firstLine ? firstLine.slice(0, 60) : 'Untitled script';
}

// ---- Settings ----

function defaultFontSize(): number {
  // About a tenth of the screen width reads well at arm's length on a phone.
  const size = Math.round(window.innerWidth / 10 / 4) * 4;
  return Math.min(64, Math.max(32, size));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function sanitize(input: Partial<Settings>): Settings {
  const num = (v: unknown, fallback: number) => (typeof v === 'number' && isFinite(v) ? v : fallback);
  return {
    speed: clamp(Math.round(num(input.speed, 8)), LIMITS.speed.min, LIMITS.speed.max),
    fontSize: clamp(Math.round(num(input.fontSize, defaultFontSize())), LIMITS.fontSize.min, LIMITS.fontSize.max),
    mirror: input.mirror === true,
    line: input.line !== false,
    countdown: clamp(Math.round(num(input.countdown, 3)), 0, 30),
  };
}

let settings: Settings = sanitize(read<Partial<Settings>>(SETTINGS_KEY) ?? {});
const listeners = new Set<(s: Settings) => void>();

export function getSettings(): Settings {
  return settings;
}

export function updateSettings(patch: Partial<Settings>): void {
  settings = sanitize({ ...settings, ...patch });
  write(SETTINGS_KEY, settings);
  listeners.forEach((fn) => fn(settings));
}

export function onSettingsChange(fn: (s: Settings) => void): void {
  listeners.add(fn);
}
