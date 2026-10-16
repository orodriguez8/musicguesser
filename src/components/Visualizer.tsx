import { useEffect, useRef } from 'react';
import { audio } from '../audio/engine';

const ACCENT = '#FF3D9A';
const CYAN = '#3DE3FF';

/** Barras que bailan con el espectro real del fragmento (o con una animación si no hay datos). */
export function Visualizer({ url, bars = 36, height = 72 }: { url: string; bars?: number; height?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const data = new Uint8Array(new ArrayBuffer(128));
    const levels = new Float32Array(bars);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = 0;
    let h = 0;
    let raf = 0;

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      w = Math.max(1, Math.round(r.width * dpr));
      h = Math.max(1, Math.round(r.height * dpr));
      canvas.width = w;
      canvas.height = h;
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    const draw = (t: number) => {
      const playing = audio.isPlaying(url);
      const real = playing && audio.frequency(data);
      for (let i = 0; i < bars; i++) {
        let target: number;
        if (real) {
          // Más resolución en graves y medios, que es donde está la música
          const bin = 1 + Math.floor(Math.pow(i / bars, 1.5) * 80);
          target = Math.pow(data[bin] / 255, 1.3);
        } else if (playing && !reduced) {
          target = 0.25 + 0.5 * Math.abs(Math.sin(t / 240 + i * 1.7) * Math.cos(t / 530 + i * 0.6));
        } else {
          target = 0.07 + (reduced ? 0 : 0.03 * Math.sin(t / 900 + i));
        }
        levels[i] += (target - levels[i]) * 0.28;
      }

      ctx.clearRect(0, 0, w, h);
      const gap = 3 * dpr;
      const bw = Math.max(2, (w - gap * (bars - 1)) / bars);
      for (let i = 0; i < bars; i++) {
        const bh = Math.max(4 * dpr, levels[i] * h * 0.95);
        const x = i * (bw + gap);
        const y = (h - bh) / 2;
        const color = i % 2 ? CYAN : ACCENT;
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = playing ? 10 * dpr : 0;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(x, y, bw, bh, bw / 2);
        else ctx.rect(x, y, bw, bh);
        ctx.fill();
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [url, bars]);

  return <canvas ref={ref} className="viz" style={{ height }} aria-hidden="true" />;
}
