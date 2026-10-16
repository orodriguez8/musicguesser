import { useSyncExternalStore } from 'react';

interface Snapshot {
  url: string;
  playing: boolean;
  failed: boolean;
}

/**
 * Un único reproductor para toda la app. Usa Web Audio (AnalyserNode) para que el
 * visualizador reaccione a la música de verdad; si el audio no admite CORS, cae a
 * un <audio> normal y el visualizador se anima solo.
 */
class AudioEngine {
  private el: HTMLAudioElement;
  private plain: HTMLAudioElement | null = null;
  private usingPlain = false;
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private stopAt: number | null = null;
  private raf = 0;
  private token = 0;
  private volume = 0.8;
  private listeners = new Set<() => void>();
  private snap: Snapshot = { url: '', playing: false, failed: false };
  private url = '';
  private failed = false;

  private stopTimer = 0;

  constructor() {
    this.el = this.makeElement(true);
    // iOS "interrumpe" el AudioContext al cambiar de app: al volver hay que reanudarlo
    // o el audio (que pasa por él) sonaría mudo.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') this.resumeContext();
    });
  }

  private resumeContext() {
    if (this.ctx && this.ctx.state !== 'running') void this.ctx.resume().catch(() => {});
  }

  private makeElement(cors: boolean): HTMLAudioElement {
    const el = new Audio();
    if (cors) el.crossOrigin = 'anonymous';
    el.preload = 'auto';
    el.volume = this.volume;
    for (const ev of ['play', 'playing', 'pause', 'ended', 'emptied']) el.addEventListener(ev, () => this.emit());
    return el;
  }

  private get cur(): HTMLAudioElement {
    return this.usingPlain && this.plain ? this.plain : this.el;
  }

  /** Llamar dentro de un gesto del usuario (clic): crea el AudioContext y desbloquea el audio en móvil. */
  unlock(): void {
    try {
      if (!this.ctx) {
        const Ctx =
          window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctx) return;
        this.ctx = new Ctx();
        const source = this.ctx.createMediaElementSource(this.el);
        this.analyser = this.ctx.createAnalyser();
        this.analyser.fftSize = 256;
        this.analyser.smoothingTimeConstant = 0.78;
        source.connect(this.analyser);
        this.analyser.connect(this.ctx.destination);
      }
      this.resumeContext();
    } catch {
      /* sin Web Audio: sonará igual, solo sin visualizador real */
    }
  }

  private ready(el: HTMLAudioElement): Promise<void> {
    if (el.readyState >= 2 && !el.error) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const done = (ok: boolean) => {
        clearTimeout(timer);
        el.removeEventListener('canplay', onOk);
        el.removeEventListener('loadeddata', onOk);
        el.removeEventListener('error', onErr);
        if (ok) resolve();
        else reject(new Error('No se pudo cargar el audio'));
      };
      const onOk = () => done(true);
      const onErr = () => done(false);
      const timer = setTimeout(() => done(false), 12000);
      el.addEventListener('canplay', onOk);
      el.addEventListener('loadeddata', onOk);
      el.addEventListener('error', onErr);
    });
  }

  /** Reproduce `url` desde `start` hasta `end` (segundos). */
  async playRange(url: string, start = 0, end?: number): Promise<void> {
    const token = ++this.token;
    this.stopAt = end ?? null;
    if (this.url !== url) {
      this.cur.pause();
      this.url = url;
      this.failed = false;
      this.usingPlain = false;
      this.el.src = url;
      this.el.load();
      this.emit();
    }
    let el = this.cur;
    try {
      await this.ready(el);
    } catch {
      if (token !== this.token) return;
      // Reintento sin CORS (sin visualizador real)
      if (!this.plain) this.plain = this.makeElement(false);
      this.usingPlain = true;
      this.plain.src = url;
      this.plain.load();
      el = this.plain;
      try {
        await this.ready(el);
      } catch {
        this.failed = true;
        this.emit();
        throw new Error('No se pudo cargar el audio');
      }
    }
    if (token !== this.token) return;
    this.resumeContext();
    try {
      el.currentTime = start;
    } catch {
      /* algunos navegadores no dejan buscar antes de tiempo */
    }
    await el.play();
    this.loop();
    // Respaldo del corte por segundos: requestAnimationFrame se congela con la pestaña en
    // segundo plano y se podría escuchar más de lo desbloqueado. El temporizador no.
    clearTimeout(this.stopTimer);
    if (end != null) {
      this.stopTimer = window.setTimeout(() => {
        if (token === this.token && this.stopAt != null) {
          this.cur.pause();
          this.stopAt = null;
          this.emit();
        }
      }, (end - start) * 1000 + 120);
    }
  }

  private loop() {
    cancelAnimationFrame(this.raf);
    const tick = () => {
      const el = this.cur;
      if (this.stopAt != null && el.currentTime >= this.stopAt) {
        el.pause();
        this.stopAt = null;
        this.emit();
        return;
      }
      if (!el.paused) this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  pause(): void {
    this.token++;
    this.cur.pause();
    this.stopAt = null;
    clearTimeout(this.stopTimer);
  }

  /** Para del todo y olvida el fragmento actual. */
  stop(): void {
    this.pause();
    this.emit();
  }

  isPlaying(url?: string): boolean {
    return !this.cur.paused && (url == null || url === this.url);
  }

  currentTime(url?: string): number {
    return url == null || url === this.url ? this.cur.currentTime : 0;
  }

  /** Rellena `out` con el espectro actual. Devuelve false si no hay datos reales. */
  frequency(out: Uint8Array<ArrayBuffer>): boolean {
    if (!this.analyser || this.usingPlain || this.cur.paused) return false;
    this.analyser.getByteFrequencyData(out);
    return true;
  }

  /** Pequeño efecto de acierto/fallo sintetizado (sin archivos). */
  sfx(kind: 'right' | 'wrong'): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running' || this.volume === 0) return;
    const now = ctx.currentTime;
    const peak = 0.16 * this.volume;
    const notes: Array<[number, number]> = kind === 'right' ? [[880, 0], [1318.5, 0.09]] : [[233, 0], [174.6, 0.13]];
    for (const [freq, at] of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = kind === 'right' ? 'sine' : 'triangle';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, now + at);
      gain.gain.linearRampToValueAtTime(peak, now + at + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + at + 0.24);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + at);
      osc.stop(now + at + 0.26);
    }
  }

  setVolume(v: number): void {
    this.volume = v;
    this.el.volume = v;
    if (this.plain) this.plain.volume = v;
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  getSnapshot = (): Snapshot => this.snap;

  private emit() {
    const next = { url: this.url, playing: !this.cur.paused, failed: this.failed };
    if (next.url !== this.snap.url || next.playing !== this.snap.playing || next.failed !== this.snap.failed) {
      this.snap = next;
      this.listeners.forEach((fn) => fn());
    }
  }
}

export const audio = new AudioEngine();

export function useAudio(): Snapshot {
  return useSyncExternalStore(audio.subscribe, audio.getSnapshot);
}
