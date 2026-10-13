/** How long music fades in, out, or across when it changes. */
const FADE_MS = 800;
const FADE_STEP_MS = 40;

export interface MusicRequest {
  url: string;
  /** 0–1, before the player's music volume setting. */
  volume: number;
  loop: boolean;
}

export interface AudioVolumes {
  /** 0–1. */
  music: number;
  /** 0–1. */
  sfx: number;
}

/**
 * Plays the story's background music and sound effects with plain <audio>
 * elements (kept inside the player's root, so they go away with it).
 *
 * Music is declarative: the player says which track *should* be playing
 * after every state change, and this reconciles. The same track keeps
 * playing across restarts and rollbacks; a different one crossfades.
 */
export class AudioController {
  private host: HTMLElement;
  private desired: MusicRequest | null = null;
  private current: HTMLAudioElement | null = null;
  private currentUrl = '';
  private volumes: AudioVolumes = { music: 1, sfx: 1 };
  private muted = false;
  /** Music held back while e.g. the title screen is shown. */
  private suspended = false;
  /** Elements whose play() the browser refused before any user interaction. */
  private blocked = new Set<HTMLAudioElement>();
  private fades = new Map<HTMLAudioElement, number>();

  constructor(host: HTMLElement) {
    this.host = host;
  }

  setMusic(request: MusicRequest | null): void {
    this.desired = request;
    this.reconcile();
  }

  playSound(url: string, volume: number): void {
    if (this.muted || this.volumes.sfx <= 0) return;
    const el = document.createElement('audio');
    el.className = 'zn-audio-sfx';
    el.src = url;
    el.volume = clamp(volume * this.volumes.sfx);
    el.addEventListener('ended', () => el.remove());
    this.host.appendChild(el);
    // A sound that can't play right now is dropped rather than played late.
    el.play().catch(() => el.remove());
  }

  setVolumes(volumes: AudioVolumes): void {
    this.volumes = { music: clamp(volumes.music), sfx: clamp(volumes.sfx) };
    this.reconcile();
  }

  getVolumes(): AudioVolumes {
    return { ...this.volumes };
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.reconcile();
  }

  setSuspended(suspended: boolean): void {
    this.suspended = suspended;
    this.reconcile();
  }

  /** Call from a user gesture: retries playback the browser blocked earlier. */
  unlock(): void {
    for (const el of this.blocked) el.play().catch(() => {});
    this.blocked.clear();
  }

  destroy(): void {
    for (const timer of this.fades.values()) window.clearInterval(timer);
    this.fades.clear();
    for (const el of this.host.querySelectorAll('audio')) {
      el.pause();
      el.remove();
    }
    this.current = null;
    this.currentUrl = '';
  }

  // -------------------------------------------------------------------------

  private reconcile() {
    const want = this.muted || this.suspended ? null : this.desired;
    const url = want?.url ?? '';
    const target = want ? clamp(want.volume * this.volumes.music) : 0;

    if (url === this.currentUrl) {
      if (this.current && want) {
        this.current.loop = want.loop;
        this.fadeTo(this.current, target);
      }
      return;
    }

    if (this.current) {
      const old = this.current;
      this.blocked.delete(old);
      this.fadeTo(old, 0, () => {
        old.pause();
        old.remove();
      });
    }
    this.current = null;
    this.currentUrl = url;
    if (!want) return;

    const el = document.createElement('audio');
    el.className = 'zn-audio-music';
    el.src = want.url;
    el.loop = want.loop;
    el.volume = 0;
    this.host.appendChild(el);
    this.current = el;
    el.play().catch(() => this.blocked.add(el));
    this.fadeTo(el, target);
  }

  private fadeTo(el: HTMLAudioElement, target: number, done?: () => void) {
    const running = this.fades.get(el);
    if (running !== undefined) window.clearInterval(running);
    const start = el.volume;
    if (Math.abs(start - target) < 0.001) {
      this.fades.delete(el);
      done?.();
      return;
    }
    const steps = Math.max(1, Math.round(FADE_MS / FADE_STEP_MS));
    let i = 0;
    const timer = window.setInterval(() => {
      i++;
      el.volume = clamp(start + ((target - start) * i) / steps);
      if (i >= steps) {
        window.clearInterval(timer);
        this.fades.delete(el);
        done?.();
      }
    }, FADE_STEP_MS);
    this.fades.set(el, timer);
  }
}

function clamp(v: number): number {
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1;
}
