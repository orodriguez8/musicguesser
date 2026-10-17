import { useCallback, useEffect, useRef } from 'react';
import { audio, useAudio } from '../audio/engine';
import { HEARDLE_STEPS } from '../game/scoring';
import type { Track } from '../game/types';
import { reportError } from '../lib/errors';
import { Icon } from './Icon';
import { Visualizer } from './Visualizer';

const HEARDLE_START = 0.3;
const PREVIEW_LEN = 30;

interface Props {
  track: Track;
  variant: 'heardle' | 'full' | 'mini';
  step?: number;
  onMore?: () => void;
  answered: boolean;
  autoPlay?: boolean;
  /** Texto del reproductor compacto */
  caption?: string;
}

/** Actualiza una barra de progreso por fotograma sin re-renderizar React. */
function useProgressRef(url: string, total: number, offset = 0) {
  const fill = useRef<HTMLSpanElement>(null);
  const label = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const t = Math.max(0, audio.currentTime(url) - offset);
      const pct = Math.min(100, (t / total) * 100);
      if (fill.current) fill.current.style.width = `${pct}%`;
      if (label.current) label.current.textContent = `0:${String(Math.floor(Math.min(t, total))).padStart(2, '0')}`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [url, total, offset]);
  return { fill, label };
}

export function AudioStage({ track, variant, step = 0, onMore, answered, autoPlay = true, caption }: Props) {
  const { playing, url, failed } = useAudio();
  const mine = url === track.preview;
  const isPlaying = playing && mine;
  const heardle = variant === 'heardle' && !answered;

  const play = useCallback(() => {
    audio.unlock();
    const p = heardle
      ? audio.playRange(track.preview, HEARDLE_START, HEARDLE_START + HEARDLE_STEPS[step])
      : audio.playRange(track.preview, 0);
    p.catch((e) => {
      // Que el navegador bloquee el autoplay es normal; que el audio no cargue, no
      if (e instanceof Error && e.message === 'No se pudo cargar el audio')
        reportError(e, 'audio', { track: track.id, title: track.title, artist: track.artistName });
    });
  }, [heardle, step, track.preview, track.id, track.title, track.artistName]);

  useEffect(() => {
    if (autoPlay) play();
  }, [play, autoPlay]);

  useEffect(() => () => audio.stop(), []);

  const toggle = () => (isPlaying ? audio.pause() : play());
  const heardSeconds = HEARDLE_STEPS[step];
  const nextSeconds = HEARDLE_STEPS[step + 1];

  if (variant === 'mini') {
    return (
      <div className="mini-player">
        <button className="btn-round btn-accent" onClick={toggle} aria-label={isPlaying ? 'Pausar' : 'Reproducir'}>
          <Icon name={isPlaying ? 'pause' : 'play'} size={20} />
        </button>
        <div className="mini-body">
          <span className="mini-caption">{caption ?? 'Fragmento'}</span>
          <FullProgress url={track.preview} />
        </div>
      </div>
    );
  }

  return (
    <div className="stage audio-stage">
      <Visualizer url={track.preview} />
      <button className="play-btn" onClick={toggle} aria-label={isPlaying ? 'Pausar fragmento' : 'Reproducir fragmento'}>
        <Icon name={isPlaying ? 'pause' : 'play'} size={32} />
      </button>
      {heardle ? (
        <div className="heardle">
          <HeardleBar url={track.preview} step={step} />
          <div className="heardle-row">
            <span className="muted-strong">
              Has escuchado {heardSeconds} s de 16
            </span>
            <button className="btn-chip" onClick={onMore} disabled={!nextSeconds}>
              <Icon name="plus" size={16} />
              {nextSeconds ? `${nextSeconds - heardSeconds} s` : 'Máximo'}
            </button>
          </div>
        </div>
      ) : (
        <FullProgress url={track.preview} />
      )}
      {failed && mine && <p className="warn">No se ha podido cargar este fragmento. Puedes responder igualmente.</p>}
    </div>
  );
}

function HeardleBar({ url, step }: { url: string; step: number }) {
  const { fill } = useProgressRef(url, 16, HEARDLE_START);
  return (
    <div className="heardle-bar" aria-hidden="true">
      {HEARDLE_STEPS.map((s, i) => (
        <span
          key={s}
          className={i <= step ? 'seg on' : 'seg'}
          style={{ flexGrow: i === 0 ? 1 : s - HEARDLE_STEPS[i - 1] }}
        />
      ))}
      <span className="heardle-fill" ref={fill} />
    </div>
  );
}

function FullProgress({ url }: { url: string }) {
  const { fill, label } = useProgressRef(url, PREVIEW_LEN);
  return (
    <div className="full-progress">
      <span className="track-line" aria-hidden="true">
        <span className="track-fill" ref={fill} />
      </span>
      <span className="time">
        <span ref={label}>0:00</span> / 0:30
      </span>
    </div>
  );
}
