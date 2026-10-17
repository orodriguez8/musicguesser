import { useEffect, useState } from 'react';
import { audio, useAudio } from '../audio/engine';
import { Icon } from '../components/Icon';
import { RankingStatus } from '../components/RankingStatus';
import { ReportButton } from '../components/ReportButton';
import { SafeImg } from '../components/SafeImg';
import { questionTrack } from '../game/build';
import { modeTitle } from '../game/modes';
import { grade } from '../game/scoring';
import type { Filter, RoundResult, Summary } from '../game/types';
import { isUrbanoFilter } from '../game/urbano';
import { onlineEnabled } from '../lib/supabase';
import { fmtDecimal, fmtInt } from '../lib/util';
import { challengeLink, createChallenge } from '../online/challenges';

interface Props {
  summary: Summary;
  filter: Filter;
  isRecord: boolean;
  loggedIn: boolean;
  onReplay: () => void;
  onHome: () => void;
  onLogin?: () => void;
  onOpenRanking?: () => void;
}

function avg(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

function thirdStat(s: Summary): { value: string; label: string } {
  const ok = s.results.filter((r) => r.outcome.correct);
  if (s.mode === 'cancion') return { value: `${fmtDecimal(avg(ok.map((r) => r.outcome.seconds ?? 0)))} s`, label: 'Segundos de media' };
  if (s.mode === 'anio') return { value: `±${fmtDecimal(avg(s.results.map((r) => r.outcome.yearDiff ?? 0)))}`, label: 'Años de error' };
  return { value: ok.length ? `${fmtDecimal(avg(ok.map((r) => r.outcome.seconds ?? 0)))} s` : '—', label: 'Tiempo medio' };
}

function detail(r: RoundResult, mezcla: boolean): string {
  const q = r.question;
  let d: string;
  if (q.kind === 'anio') {
    const diff = r.outcome.yearDiff ?? 0;
    d = `${q.year} · ${diff === 0 ? '¡exacto!' : `te fuiste ${diff} ${diff === 1 ? 'año' : 'años'}`}`;
  } else if (q.kind === 'subgenero') d = q.options[q.answer].label;
  else if (q.kind === 'intruso') d = `intruso entre ${q.host.name}`;
  else if (q.kind === 'infiltrado') d = `infiltrado en «${q.rule}»`;
  else d = questionTrack(q).albumTitle;
  return mezcla ? `${modeTitle(q.kind)} · ${d}` : d;
}

export function Results({ summary, filter, isRecord, loggedIn, onReplay, onHome, onLogin, onOpenRanking }: Props) {
  const g = grade(summary.correct);
  const total = summary.results.length;
  const third = thirdStat(summary);
  const { url, playing } = useAudio();
  const [copied, setCopied] = useState(false);

  useEffect(() => () => audio.stop(), []);

  const share = async () => {
    const squares = summary.results.map((r) => (r.outcome.correct ? '🟦' : '🟥')).join('');
    const text = `MusicGuesser · ${modeTitle(summary.mode)} (${summary.filterLabel})\n${g.letter} · ${fmtInt(summary.score)} puntos · ${summary.correct}/${total}\n${squares}`;
    const link = window.location.href.split('#')[0];
    try {
      if (navigator.share) {
        await navigator.share({ title: 'MusicGuesser', text, url: link });
        return;
      }
      await navigator.clipboard.writeText(`${text}\n${link}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      /* el usuario canceló */
    }
  };

  return (
    <main className="screen results">
      <header className="game-head">
        <button className="btn-square" onClick={onHome} aria-label="Cerrar y volver al inicio">
          <Icon name="x" size={20} />
        </button>
        <div className="game-title">
          <span className="game-mode">Resultado</span>
          <span className="game-sub">{modeTitle(summary.mode)}</span>
        </div>
        <span className="head-spacer" />
      </header>

      <section className="grade-block">
        <div className="grade-ring">
          <span>{g.letter}</span>
        </div>
        {isRecord && (
          <span className="record-chip">
            <Icon name="sparkle" size={14} /> ¡Nuevo récord!
          </span>
        )}
        <h1 className="grade-title">{g.title}</h1>
        <p className="grade-score">
          {fmtInt(summary.score)} <small>puntos</small>
        </p>
        <p className="muted center">
          {modeTitle(summary.mode)} · {summary.filterLabel}
        </p>
      </section>

      <RankingStatus summary={summary} filter={filter} loggedIn={loggedIn} onLogin={onLogin} onOpenRanking={onOpenRanking} />

      {onlineEnabled && summary.results.length === 10 && <ChallengeButton summary={summary} filter={filter} loggedIn={loggedIn} onLogin={onLogin} />}

      <div className="stats">
        <div className="stat">
          <strong>
            {summary.correct}/{total}
          </strong>
          <span>Aciertos</span>
        </div>
        <div className="stat">
          <strong>{summary.bestStreak}</strong>
          <span>Mejor racha</span>
        </div>
        <div className="stat">
          <strong>{third.value}</strong>
          <span>{third.label}</span>
        </div>
      </div>

      <section className="block">
        <span className="eyebrow">Prueba a prueba</span>
        <div className="strip" style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` }}>
          {summary.results.map((r, i) => (
            <span key={i} className={r.outcome.correct ? 'strip-cell ok' : 'strip-cell ko'} title={`Prueba ${i + 1}`}>
              {r.outcome.short}
            </span>
          ))}
        </div>
      </section>

      <section className="block">
        <div className="block-head">
          <h2>Lo que ha sonado</h2>
        </div>
        <ul className="played">
          {summary.results.map((r, i) => {
            const t = questionTrack(r.question);
            const on = playing && url === t.preview;
            return (
              <li key={i} className="played-item">
                <button
                  className="played-cover"
                  onClick={() => {
                    if (on) return audio.pause();
                    audio.unlock();
                    audio.playRange(t.preview, 0, 20).catch(() => {});
                  }}
                  aria-label={`${on ? 'Pausar' : 'Escuchar'} ${t.title}`}
                >
                  <SafeImg src={t.coverSmall} alt="" width={48} height={48} loading="lazy" />
                  <span className="played-icon">
                    <Icon name={on ? 'pause' : 'play'} size={18} />
                  </span>
                </button>
                <div className="played-text">
                  <strong>{t.title}</strong>
                  <span>
                    {t.artistName} · {detail(r, summary.mode === 'mezcla')}
                  </span>
                </div>
                <span className={r.outcome.correct ? 'played-pts ok' : 'played-pts ko'}>
                  {r.points ? `+${fmtInt(r.points)}` : 'Fallada'}
                </span>
                <ReportButton
                  compact
                  what={{ mode: r.question.kind, trackId: t.id, albumId: t.albumId, title: t.title, artist: t.artistName, album: t.albumTitle }}
                />
                <a className="btn-square sm" href={t.link} target="_blank" rel="noreferrer" aria-label={`Abrir ${t.title} en Deezer`}>
                  <Icon name="external" size={16} />
                </a>
              </li>
            );
          })}
        </ul>
      </section>

      <div className="row-actions bottom">
        <button className="btn-primary grow" onClick={share}>
          <Icon name="share" /> {copied ? '¡Copiado!' : 'Compartir'}
        </button>
        <button className="btn-ghost grow" onClick={onReplay}>
          <Icon name="replay" /> Otra partida
        </button>
      </div>
    </main>
  );
}

/** Reto a un amigo: guarda estas 10 pruebas y comparte el enlace. */
function ChallengeButton({ summary, filter, loggedIn, onLogin }: { summary: Summary; filter: Filter; loggedIn: boolean; onLogin?: () => void }) {
  const [state, setState] = useState<{ k: 'idle' } | { k: 'busy' } | { k: 'done'; id: string; copied: boolean } | { k: 'error'; msg: string }>({ k: 'idle' });

  const shareLink = async (id: string) => {
    const link = challengeLink(id);
    const text = `Te reto en MusicGuesser: ${modeTitle(summary.mode)} (${summary.filterLabel}). Yo he sacado ${fmtInt(summary.score)} puntos. ¿Me superas?`;
    try {
      if (navigator.share) await navigator.share({ text, url: link });
      else {
        await navigator.clipboard.writeText(`${text}\n${link}`);
        setState({ k: 'done', id, copied: true });
      }
    } catch {
      /* compartir cancelado */
    }
  };

  const create = async () => {
    if (!loggedIn) return onLogin?.();
    setState({ k: 'busy' });
    try {
      const id = await createChallenge(summary, isUrbanoFilter(filter));
      setState({ k: 'done', id, copied: false });
      await shareLink(id);
    } catch (e) {
      setState({ k: 'error', msg: e instanceof Error ? e.message : 'No se ha podido crear el reto.' });
    }
  };

  return (
    <section className="challenge-cta">
      <div>
        <strong>Reta a un amigo</strong>
        <span className="muted small">Jugará estas mismas 10 pruebas y compararéis puntos.</span>
        {state.k === 'error' && <span className="form-error">{state.msg}</span>}
        {state.k === 'done' && <span className="muted small">Código del reto: <strong>{state.id}</strong>{state.copied ? ' · enlace copiado' : ''}</span>}
      </div>
      <button className="btn-light" onClick={state.k === 'done' ? () => shareLink(state.id) : create} disabled={state.k === 'busy'}>
        <Icon name="users" size={16} /> {state.k === 'busy' ? 'Creando…' : state.k === 'done' ? 'Compartir' : loggedIn ? 'Retar' : 'Entrar y retar'}
      </button>
    </section>
  );
}
