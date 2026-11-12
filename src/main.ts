import './style.css';
import { Prompter, type PrompterState } from './prompter';
import {
  LIMITS,
  createScript,
  deleteScript,
  displayTitle,
  getScript,
  getSettings,
  listScripts,
  onSettingsChange,
  updateScript,
  updateSettings,
  type Settings,
} from './storage';

type Route = { view: 'library' } | { view: 'editor'; id: string } | { view: 'prompter'; id: string };

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const views = {
  library: $('view-library'),
  editor: $('view-editor'),
  prompter: $('view-prompter'),
};

// ---------------------------------------------------------------------------
// Navigation. Each view is a history entry, so the Android back button works.
// ---------------------------------------------------------------------------

let current: Route | null = null;

function go(route: Route): void {
  history.pushState(route, '');
  render(route);
}

function render(route: Route): void {
  if (route.view !== 'library' && !getScript(route.id)) {
    route = { view: 'library' };
    history.replaceState(route, '');
  }
  if (current) leave(current);
  current = route;
  for (const [name, el] of Object.entries(views)) el.hidden = name !== route.view;

  if (route.view === 'library') showLibrary();
  else if (route.view === 'editor') showEditor(route.id);
  else showPrompter(route.id);
}

function leave(route: Route): void {
  if (route.view === 'editor') {
    saveEditor();
    const script = getScript(route.id);
    // Don't keep scripts that were created and left blank.
    if (script && !script.title.trim() && !script.text.trim()) deleteScript(route.id);
  } else if (route.view === 'prompter') {
    prompter.stop();
    clearTimeout(hideTimer);
    releaseWakeLock();
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
  }
}

window.addEventListener('popstate', (e) => render((e.state as Route | null) ?? { view: 'library' }));

// ---------------------------------------------------------------------------
// Library
// ---------------------------------------------------------------------------

const scriptList = $('script-list');
const emptyState = $('empty');
const dateFormat = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });

const ICON_PLAY = '<svg viewBox="0 0 24 24" class="filled" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';
const ICON_TRASH =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13M10 11v6M14 11v6"/></svg>';

function showLibrary(): void {
  const scripts = listScripts();
  emptyState.hidden = scripts.length > 0;
  scriptList.replaceChildren(
    ...scripts.map((script) => {
      const li = document.createElement('li');
      li.className = 'script-card';

      const open = document.createElement('button');
      open.type = 'button';
      open.className = 'script-open';
      const title = document.createElement('span');
      title.className = 'script-title';
      title.textContent = displayTitle(script);
      const meta = document.createElement('span');
      meta.className = 'script-meta';
      meta.textContent = `${dateFormat.format(script.updatedAt)} · ${describeLength(script.text)}`;
      open.append(title, meta);
      open.addEventListener('click', () => go({ view: 'editor', id: script.id }));

      const play = document.createElement('button');
      play.type = 'button';
      play.className = 'icon-btn accent';
      play.setAttribute('aria-label', `Start prompting ${displayTitle(script)}`);
      play.innerHTML = ICON_PLAY;
      play.disabled = !script.text.trim();
      play.addEventListener('click', () => {
        // Put the editor underneath so Back and Esc lead to editing.
        history.pushState({ view: 'editor', id: script.id } satisfies Route, '');
        go({ view: 'prompter', id: script.id });
      });

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'icon-btn';
      remove.setAttribute('aria-label', `Delete ${displayTitle(script)}`);
      remove.innerHTML = ICON_TRASH;
      remove.addEventListener('click', () => {
        if (confirm(`Delete "${displayTitle(script)}"? This cannot be undone.`)) {
          deleteScript(script.id);
          showLibrary();
        }
      });

      li.append(open, play, remove);
      return li;
    }),
  );
}

function countWords(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

function describeLength(text: string): string {
  const words = countWords(text);
  if (!words) return 'Empty';
  // Typical speaking pace is about 150 words a minute.
  const minutes = words / 150;
  const time = minutes < 1 ? 'under 1 min' : `about ${Math.round(minutes)} min`;
  return `${words} ${words === 1 ? 'word' : 'words'} · ${time}`;
}

$('new-script').addEventListener('click', () => go({ view: 'editor', id: createScript().id }));

// ---------------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------------

const titleInput = $<HTMLInputElement>('title');
const textInput = $<HTMLTextAreaElement>('text');
const wordCount = $('word-count');
const startButton = $<HTMLButtonElement>('start');
let editingId: string | null = null;
let saveTimer = 0;

function showEditor(id: string): void {
  const script = getScript(id)!;
  editingId = id;
  titleInput.value = script.title;
  textInput.value = script.text;
  refreshEditor();
  if (!script.text) textInput.focus();
}

function refreshEditor(): void {
  wordCount.textContent = describeLength(textInput.value);
  startButton.disabled = !textInput.value.trim();
}

function saveEditor(): void {
  clearTimeout(saveTimer);
  if (!editingId) return;
  const script = getScript(editingId);
  if (script && (script.title !== titleInput.value || script.text !== textInput.value)) {
    updateScript(editingId, { title: titleInput.value, text: textInput.value });
  }
}

function queueSave(): void {
  refreshEditor();
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(saveEditor, 300);
}

function startPrompting(): void {
  if (!editingId || !textInput.value.trim()) return;
  saveEditor();
  go({ view: 'prompter', id: editingId });
}

titleInput.addEventListener('input', queueSave);
textInput.addEventListener('input', queueSave);
startButton.addEventListener('click', startPrompting);
$('editor-back').addEventListener('click', () => history.back());

// Save before the tab is hidden or closed, in case a debounced save is pending.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && current?.view === 'editor') saveEditor();
});
window.addEventListener('pagehide', () => {
  if (current?.view === 'editor') saveEditor();
});

// ---------------------------------------------------------------------------
// Settings controls, shared by the settings sheet and the prompter overlay.
// ---------------------------------------------------------------------------

const settingsDialog = $<HTMLDialogElement>('settings');

function syncSettingsUI(s: Settings): void {
  document.querySelectorAll<HTMLElement>('[data-out]').forEach((el) => {
    el.textContent = String(s[el.dataset.out as 'speed' | 'fontSize']);
  });
  document.querySelectorAll<HTMLButtonElement>('[data-step]').forEach((el) => {
    const key = el.dataset.step as 'speed' | 'fontSize';
    const limit = Number(el.dataset.delta) < 0 ? LIMITS[key].min : LIMITS[key].max;
    el.disabled = s[key] === limit;
  });
  document.querySelectorAll<HTMLElement>('[data-toggle]').forEach((el) => {
    el.setAttribute('aria-pressed', String(s[el.dataset.toggle as 'mirror' | 'line']));
  });
  document.querySelectorAll<HTMLElement>('[data-countdown]').forEach((el) => {
    el.setAttribute('aria-pressed', String(Number(el.dataset.countdown) === s.countdown));
  });
}

function stepSetting(key: 'speed' | 'fontSize', direction: number): void {
  updateSettings({ [key]: getSettings()[key] + direction * LIMITS[key].step });
}

document.addEventListener('click', (e) => {
  const el = (e.target as Element).closest<HTMLElement>('[data-step], [data-toggle], [data-countdown]');
  if (!el) return;
  if (el.dataset.step) {
    stepSetting(el.dataset.step as 'speed' | 'fontSize', Number(el.dataset.delta));
  } else if (el.dataset.toggle) {
    const key = el.dataset.toggle as 'mirror' | 'line';
    updateSettings({ [key]: !getSettings()[key] });
  } else if (el.dataset.countdown) {
    updateSettings({ countdown: Number(el.dataset.countdown) });
  }
});

$('open-settings').addEventListener('click', () => settingsDialog.showModal());
$('close-settings').addEventListener('click', () => settingsDialog.close());
settingsDialog.addEventListener('click', (e) => {
  if (e.target === settingsDialog) settingsDialog.close(); // Tap on the backdrop.
});

onSettingsChange((s) => {
  syncSettingsUI(s);
  if (current?.view === 'prompter') prompter.layout();
});
syncSettingsUI(getSettings());

// ---------------------------------------------------------------------------
// Prompter
// ---------------------------------------------------------------------------

const controls = $('controls');
const playButton = $('play');
const fullscreenButton = $('fullscreen');
const AUTO_HIDE_MS = 3000;
let hideTimer = 0;

const prompter = new Prompter(
  {
    stage: $('stage'),
    mirror: $('mirror'),
    scroller: $('scroller'),
    text: $('prompt-text'),
    glow: $('glow'),
    progressBar: $('progress-bar'),
    countdown: $('countdown'),
  },
  {
    getSettings,
    onStateChange: onPrompterState,
    onTap: () => {
      // Controls stay up while paused. While scrolling, a tap shows or hides them.
      if (prompter.state !== 'playing') return;
      setControlsVisible(controls.classList.contains('hidden'));
    },
  },
);

function showPrompter(id: string): void {
  prompter.load(getScript(id)!.text);
  onPrompterState('paused');
  void requestWakeLock();
}

function onPrompterState(state: PrompterState): void {
  playButton.classList.toggle('is-playing', state !== 'paused');
  playButton.setAttribute('aria-label', state === 'paused' ? 'Play' : 'Pause');
  // Get out of the way as soon as prompting starts; come back when it stops.
  setControlsVisible(state === 'paused');
}

function setControlsVisible(visible: boolean): void {
  clearTimeout(hideTimer);
  controls.classList.toggle('hidden', !visible);
  controls.inert = !visible;
  if (visible && prompter.state === 'playing') {
    hideTimer = window.setTimeout(() => setControlsVisible(false), AUTO_HIDE_MS);
  }
}

// Using a control keeps the controls on screen a little longer.
controls.addEventListener('click', () => {
  if (prompter.state === 'playing') setControlsVisible(true);
});

playButton.addEventListener('click', () => prompter.toggle());
$('restart').addEventListener('click', () => prompter.restart());
$('prompter-edit').addEventListener('click', () => history.back());

// ---- Fullscreen ----

function toggleFullscreen(): void {
  if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
  else void document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
}

if (document.fullscreenEnabled) fullscreenButton.addEventListener('click', toggleFullscreen);
else fullscreenButton.hidden = true; // For example Safari on iPhone.

// ---- Screen wake lock ----

let wakeLock: WakeLockSentinel | null = null;

async function requestWakeLock(): Promise<void> {
  if (!('wakeLock' in navigator) || wakeLock) return;
  try {
    const lock = await navigator.wakeLock.request('screen');
    if (current?.view !== 'prompter') {
      void lock.release(); // The user left while the request was pending.
      return;
    }
    wakeLock = lock;
    lock.addEventListener('release', () => {
      if (wakeLock === lock) wakeLock = null;
    });
  } catch {
    // Refused, for example in battery saver mode. Prompting still works.
  }
}

function releaseWakeLock(): void {
  void wakeLock?.release().catch(() => {});
  wakeLock = null;
}

// The browser drops the lock when the page is hidden, so take it again on return.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && current?.view === 'prompter') void requestWakeLock();
});

// ---------------------------------------------------------------------------
// Keyboard
// ---------------------------------------------------------------------------

document.addEventListener('keydown', (e) => {
  if (e.altKey || settingsDialog.open) return;

  if (current?.view === 'editor') {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      startPrompting();
    }
    return;
  }
  if (current?.view !== 'prompter' || e.ctrlKey || e.metaKey) return;

  switch (e.key) {
    case ' ':
      prompter.toggle();
      break;
    case 'ArrowUp':
    case 'ArrowRight':
      stepSetting('speed', 1);
      break;
    case 'ArrowDown':
    case 'ArrowLeft':
      stepSetting('speed', -1);
      break;
    case '+':
    case '=':
      stepSetting('fontSize', 1);
      break;
    case '-':
      stepSetting('fontSize', -1);
      break;
    case 'm':
    case 'M':
      updateSettings({ mirror: !getSettings().mirror });
      break;
    case 'l':
    case 'L':
      updateSettings({ line: !getSettings().line });
      break;
    case 'f':
    case 'F':
      if (document.fullscreenEnabled) toggleFullscreen();
      break;
    case 'Home':
      prompter.restart();
      break;
    case 'Escape':
      history.back();
      break;
    default:
      return;
  }
  e.preventDefault();
});

// ---------------------------------------------------------------------------
// Start on the library.
// ---------------------------------------------------------------------------

history.replaceState({ view: 'library' } satisfies Route, '');
render({ view: 'library' });
