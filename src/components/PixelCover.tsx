import { useEffect, useRef, useState } from 'react';
import { PIXEL_LEVELS } from '../game/scoring';

/**
 * Portada pixelada: se dibuja a muy baja resolución y se amplía sin suavizado.
 * No hace falta CORS: el canvas queda "contaminado", pero solo lo mostramos.
 */
export function PixelCover({ src, level }: { src: string; level: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const i = new Image();
    i.onload = () => setImg(i);
    i.onerror = () => setFailed(true);
    i.src = src;
    return () => {
      i.onload = null;
      i.onerror = null;
    };
  }, [src]);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !img) return;
    const size = 600;
    canvas.width = size;
    canvas.height = size;
    const px = PIXEL_LEVELS[Math.min(level, PIXEL_LEVELS.length - 1)];
    if (!px) {
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(img, 0, 0, size, size);
      return;
    }
    const tiny = document.createElement('canvas');
    tiny.width = px;
    tiny.height = px;
    tiny.getContext('2d')!.drawImage(img, 0, 0, px, px);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tiny, 0, 0, size, size);
  }, [img, level]);

  return (
    <div className="pixel-cover">
      <canvas ref={ref} role="img" aria-label="Portada del disco, pixelada" />
      {!img && !failed && <span className="pixel-loading">Cargando portada…</span>}
      {failed && <span className="pixel-loading">No se pudo cargar la portada</span>}
    </div>
  );
}
