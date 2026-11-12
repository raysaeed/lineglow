import type { Settings } from './storage';

const LINE_HEIGHT = 1.45;
/** Where the reading line sits, as a fraction of the screen height from the top. */
const ANCHOR = 0.28;
/** Lines per second at speed 1. */
const LINES_PER_SECOND_PER_STEP = 0.08;
/** Finger movement, in pixels, before a touch counts as a drag instead of a tap. */
const DRAG_THRESHOLD = 8;

export type PrompterState = 'paused' | 'countdown' | 'playing';

interface Elements {
  stage: HTMLElement;
  mirror: HTMLElement;
  scroller: HTMLElement;
  text: HTMLElement;
  glow: HTMLElement;
  progressBar: HTMLElement;
  countdown: HTMLElement;
}

interface Callbacks {
  getSettings: () => Settings;
  onStateChange: (state: PrompterState) => void;
  onTap: () => void;
}

export class Prompter {
  state: PrompterState = 'paused';

  private offset = 0;
  private max = 0;
  private lineHeightPx = 0;
  private frame = 0;
  private lastTime = 0;
  private countdownTimer = 0;
  private dragging = false;

  constructor(
    private els: Elements,
    private cb: Callbacks,
  ) {
    this.bindPointer();
    new ResizeObserver(() => this.layout()).observe(els.stage);
  }

  load(text: string): void {
    this.stop();
    this.els.text.textContent = text;
    this.offset = 0;
    this.max = 0;
    this.layout();
  }

  /** Apply settings and re-measure. Keeps the reader at the same place in the script. */
  layout(): void {
    const { stage, mirror, scroller, text, glow } = this.els;
    const s = this.cb.getSettings();
    const stageHeight = stage.clientHeight;
    if (!stageHeight) return; // Not visible yet.

    const progress = this.max > 0 ? this.offset / this.max : 0;

    this.lineHeightPx = s.fontSize * LINE_HEIGHT;
    text.style.fontSize = `${s.fontSize}px`;
    text.style.lineHeight = String(LINE_HEIGHT);
    const anchor = stageHeight * ANCHOR;
    // The first line starts centred on the reading line.
    scroller.style.paddingTop = `${Math.max(0, anchor - this.lineHeightPx / 2)}px`;
    stage.style.setProperty('--anchor', `${anchor}px`);
    stage.style.setProperty('--line-height', `${this.lineHeightPx}px`);
    mirror.classList.toggle('mirrored', s.mirror);
    glow.hidden = !s.line;

    this.max = text.offsetHeight;
    this.offset = progress * this.max;
    this.apply();
  }

  toggle(): void {
    if (this.state === 'paused') this.play();
    else this.pause();
  }

  play(): void {
    if (this.state !== 'paused') return;
    if (this.offset >= this.max) this.offset = 0; // Finished: play again from the top.
    const seconds = this.cb.getSettings().countdown;
    if (this.offset < 1 && seconds > 0) this.startCountdown(seconds);
    else this.run();
    this.apply();
  }

  pause(): void {
    if (this.state === 'paused') return;
    this.stop();
    this.cb.onStateChange(this.state);
  }

  restart(): void {
    this.stop();
    this.offset = 0;
    this.apply();
    this.cb.onStateChange(this.state);
  }

  /** Stop everything without notifying. Used when leaving the prompter. */
  stop(): void {
    cancelAnimationFrame(this.frame);
    clearTimeout(this.countdownTimer);
    this.els.countdown.hidden = true;
    this.state = 'paused';
  }

  private startCountdown(seconds: number): void {
    this.state = 'countdown';
    this.cb.onStateChange(this.state);
    const { countdown } = this.els;
    countdown.hidden = false;
    const tick = (remaining: number) => {
      if (remaining <= 0) {
        countdown.hidden = true;
        this.run();
        return;
      }
      countdown.textContent = String(remaining);
      // Restart the pulse animation for each number.
      countdown.classList.remove('pulse');
      void countdown.offsetWidth;
      countdown.classList.add('pulse');
      this.countdownTimer = window.setTimeout(() => tick(remaining - 1), 1000);
    };
    tick(seconds);
  }

  private run(): void {
    this.state = 'playing';
    this.cb.onStateChange(this.state);
    this.lastTime = performance.now();
    const step = (now: number) => {
      // Cap the time step so a stalled tab does not jump ahead when it resumes.
      const dt = Math.min(now - this.lastTime, 100) / 1000;
      this.lastTime = now;
      if (!this.dragging) {
        const pxPerSecond = this.lineHeightPx * this.cb.getSettings().speed * LINES_PER_SECOND_PER_STEP;
        this.offset += pxPerSecond * dt;
      }
      if (this.offset >= this.max) {
        this.offset = this.max;
        this.apply();
        this.pause();
        return;
      }
      this.apply();
      this.frame = requestAnimationFrame(step);
    };
    this.frame = requestAnimationFrame(step);
  }

  private apply(): void {
    this.offset = Math.min(this.max, Math.max(0, this.offset));
    this.els.scroller.style.transform = `translate3d(0, ${-this.offset}px, 0)`;
    const progress = this.max > 0 ? this.offset / this.max : 0;
    this.els.progressBar.style.transform = `scaleX(${progress})`;
  }

  /** Tap shows or hides the controls. Dragging or using the wheel moves through the script. */
  private bindPointer(): void {
    const { stage } = this.els;
    let pointerId: number | null = null;
    let startY = 0;
    let lastY = 0;

    stage.addEventListener('pointerdown', (e) => {
      if (pointerId !== null || (e.pointerType === 'mouse' && e.button !== 0)) return;
      pointerId = e.pointerId;
      startY = lastY = e.clientY;
    });

    stage.addEventListener('pointermove', (e) => {
      if (e.pointerId !== pointerId) return;
      if (!this.dragging && Math.abs(e.clientY - startY) > DRAG_THRESHOLD) {
        this.dragging = true;
        stage.setPointerCapture(e.pointerId);
      }
      if (this.dragging) {
        this.offset -= e.clientY - lastY;
        this.apply();
      }
      lastY = e.clientY;
    });

    const end = (e: PointerEvent, cancelled: boolean) => {
      if (e.pointerId !== pointerId) return;
      pointerId = null;
      const wasDragging = this.dragging;
      this.dragging = false;
      if (!wasDragging && !cancelled) {
        if (this.state === 'countdown') this.pause();
        else this.cb.onTap();
      }
    };
    stage.addEventListener('pointerup', (e) => end(e, false));
    stage.addEventListener('pointercancel', (e) => end(e, true));

    stage.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.offset += e.deltaY;
        this.apply();
      },
      { passive: false },
    );
  }
}
