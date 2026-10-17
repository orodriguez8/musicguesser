import { useCallback, useEffect, useMemo, useRef, useState, type Ref } from 'react';
import { audio } from '../audio/engine';
import { Icon } from '../components/Icon';
import { SafeImg } from '../components/SafeImg';
import { buildQuestions, GameError, questionTrack } from '../game/build';
import { filterLabel } from '../game/catalog';
import { modeTitle } from '../game/modes';
import { ROUNDS, roundPoints, streakMultiplier } from '../game/scoring';
import type { Filter, Outcome, PlayMode, Progress, Question, RoundResult, Summary } from '../game/types';
import { isNetworkError, reportError } from '../lib/errors';
import { fmtDecimal, fmtInt, isAbort } from '../lib/util';
import type { Settings } from '../settings';
import { Round } from './Rounds';

type Phase =
  | { k: 'loading'; p: Progress }
  | { k: 'error'; msg: string }
  | { k: 'ready' }
  | { k: 'play' };

interface Props {
  mode: PlayMode;
  filter: Filter;
  settings: Settings;
  onExit: () => void;
  onFinish: (s: Summary) => void;
  /** Pruebas ya hechas (reto de un amigo): no se genera nada */
  preset?: Question[];
  /** Etiqueta del filtro (en los retos, la de quien lo creó) */
  label?: string;
}

const MODE_RULES: Record<PlayMode, string> = {
  mezcla: 'Diez pruebas de todos los minijuegos, mezcladas.',
  cancion: 'Empiezas con 1 segundo. Pide más si lo necesitas, pero cada ampliación vale menos.',
  artista: 'Escucha el fragmento y di quién canta. Cuanto antes, más puntos.',
  completa: 'Lee los versos y adivina cuál viene después.',
  misteriosa: 'Solo tienes la letra. ¿De qué canción es?',
  anio: 'Escucha y acierta el año de lanzamiento. A ±2 años cuenta como acierto.',
  portada: 'La portada empieza pixelada. Pide más nitidez si la necesitas, pero cada paso vale menos.',
  intruso: 'Tres fragmentos son del mismo artista. Encuentra el que no.',
  subgenero: 'Escucha y adivina el subgénero. Para entendidos.',
  infiltrado: 'Cuatro artistas y una condición. Todos la cumplen menos uno: encuéntralo.',
  albumlink: 'Te damos los artistas invitados de un disco. ¿Qué disco es?',
};

const TYPING_MODES = new Set<PlayMode>(['mezcla', 'cancion', 'artista', 'completa', 'misteriosa', 'portada', 'albumlink']);

export function Game({ mode, filter, settings, onExit, onFinish, preset, label }: Props) {
  const tagLabel = label ?? filterLabel(filter);
  const [phase, setPhase] = useState<Phase>({ k: 'loading', p: { label: 'Preparando…' } });
  const [questions, setQuestions] = useState<Question[]>([]);
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<RoundResult[]>([]);
  const [current, setCurrent] = useState<RoundResult | null>(null);
  const [attempt, setAttempt] = useState(0);
  const bannerRef = useRef<HTMLDivElement>(null);
  const currentRef = useRef<RoundResult | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    setPhase({ k: 'loading', p: { label: 'Preparando…' } });
    (preset ? Promise.resolve(preset) : buildQuestions(mode, filter, (p) => !ctrl.signal.aborted && setPhase({ k: 'loading', p }), ctrl.signal))
      .then((qs) => {
        setQuestions(qs);
        setIndex(0);
        setResults([]);
        setCurrent(null);
        currentRef.current = null;
        setPhase({ k: 'ready' });
      })
      .catch((e) => {
        if (isAbort(e)) return;
        // Los GameError traen un mensaje pensado para el jugador; el resto, mensaje genérico
        if (!(e instanceof GameError) && !isNetworkError(e)) reportError(e, `partida:${mode}`, { filter });
        setPhase({
          k: 'error',
          msg: e instanceof GameError ? e.message : 'Algo ha fallado preparando la partida. Vuelve a intentarlo en un momento.',
        });
      });
    return () => ctrl.abort();
  }, [mode, filter, attempt, preset]);

  useEffect(() => () => audio.stop(), []);

  const streak = useMemo(() => {
    let s = 0;
    for (let i = results.length - 1; i >= 0 && results[i].outcome.correct; i--) s++;
    return s;
  }, [results]);
  const shownStreak = current ? (current.outcome.correct ? streak + 1 : 0) : streak;
  const score = results.reduce((a, r) => a + r.points, 0) + (current?.points ?? 0);

  const onOutcome = useCallback(
    (o: Outcome) => {
      if (currentRef.current) return;
      const q = questions[index];
      const r = { question: q, outcome: o, points: roundPoints(q, o, streak) };
      currentRef.current = r;
      audio.sfx(o.correct ? 'right' : 'wrong');
      setCurrent(r);
    },
    [questions, index, streak],
  );

  useEffect(() => {
    if (current) bannerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [current]);

  const next = () => {
    if (!current) return;
    const all = [...results, current];
    setResults(all);
    setCurrent(null);
    currentRef.current = null;
    if (index + 1 >= questions.length) {
      audio.stop();
      let best = 0;
      let run = 0;
      for (const r of all) {
        run = r.outcome.correct ? run + 1 : 0;
        best = Math.max(best, run);
      }
      onFinish({
        mode,
        filterLabel: tagLabel,
        results: all,
        score: all.reduce((a, r) => a + r.points, 0),
        correct: all.filter((r) => r.outcome.correct).length,
        bestStreak: best,
      });
    } else {
      setIndex(index + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const exit = () => {
    if (phase.k === 'play' && results.length > 0 && !window.confirm('¿Salir de la partida? Se perderá el progreso.')) return;
    audio.stop();
    onExit();
  };

  const q = questions[index];
  const roundMode = q ? (q.kind as PlayMode) : mode;
  const total = questions.length || 10;

  return (
    <main className="screen game">
      <header className="game-head">
        <button className="btn-square" onClick={exit} aria-label="Salir al inicio">
          <Icon name="back" size={20} />
        </button>
        <div className="game-title">
          <span className="game-mode">{modeTitle(mode)}</span>
          <span className="game-sub">
            {phase.k === 'play'
              ? `${mode === 'mezcla' ? `${modeTitle(roundMode)} · ` : ''}Prueba ${index + 1} de ${total}`
              : tagLabel}
          </span>
        </div>
        <div className={shownStreak >= 2 ? 'streak hot' : 'streak'} aria-label={`Racha de ${shownStreak} aciertos`}>
          <Icon name="flame" size={16} />×{fmtDecimal(streakMultiplier(shownStreak))}
        </div>
      </header>

      <div className="dots" aria-hidden="true">
        {Array.from({ length: total }, (_, i) => {
          const r = i < results.length ? results[i] : i === index ? current : null;
          const cls = r ? (r.outcome.correct ? 'dot ok' : 'dot ko') : i === index && phase.k === 'play' ? 'dot now' : 'dot';
          return <span key={i} className={cls} />;
        })}
      </div>

      <div className="tag-row">
        <span className="tag">{tagLabel}</span>
        <span className="score">
          {fmtInt(score)} <small>pts</small>
        </span>
      </div>

      {phase.k === 'loading' && (
        <section className="stage state-card" aria-live="polite">
          <div className="loader-eq" aria-hidden="true">
            {Array.from({ length: 7 }, (_, i) => (
              <span key={i} style={{ animationDelay: `${i * 0.09}s` }} />
            ))}
          </div>
          <p className="state-title">{phase.p.label}</p>
          {phase.p.total ? (
            <div className="loader-bar">
              <span style={{ width: `${((phase.p.done ?? 0) / phase.p.total) * 100}%` }} />
            </div>
          ) : null}
          <p className="muted">Los fragmentos llegan en directo desde Deezer.</p>
        </section>
      )}

      {phase.k === 'error' && (
        <section className="stage state-card">
          <p className="state-title">Vaya…</p>
          <p className="muted center">{phase.msg}</p>
          <div className="row-actions">
            <button className="btn-ghost" onClick={exit}>
              Volver
            </button>
            <button className="btn-primary" onClick={() => setAttempt((a) => a + 1)}>
              <Icon name="replay" /> Reintentar
            </button>
          </div>
        </section>
      )}

      {phase.k === 'ready' && (
        <section className="stage state-card ready">
          <span className="ready-count">{questions.length}</span>
          <p className="state-title">pruebas listas</p>
          <p className="muted center">{MODE_RULES[mode]}</p>
          {!preset && questions.length < ROUNDS && (
            <p className="short-note">
              Esta vez solo hemos podido preparar {questions.length} pruebas (Deezer o las letras no han dado para más). Solo
              las partidas de {ROUNDS} puntúan en el ranking.
            </p>
          )}
          {TYPING_MODES.has(mode) && !settings.showOptions && (
            <p className="muted center small">Escribir la respuesta vale ×1,5 frente a elegirla entre las opciones.</p>
          )}
          <button
            className="btn-primary big"
            onClick={() => {
              audio.unlock();
              setPhase({ k: 'play' });
            }}
            autoFocus
          >
            <Icon name="play" size={20} /> Empezar
          </button>
        </section>
      )}

      {phase.k === 'play' && q && (
        <div className="round" key={index}>
          <Round q={q} answered={!!current} showOptions={settings.showOptions} onOutcome={onOutcome} />
        </div>
      )}

      {phase.k === 'play' && current && (
        <Banner
          ref={bannerRef}
          result={current}
          last={index + 1 >= questions.length}
          onNext={next}
        />
      )}
    </main>
  );
}

function Banner({
  result,
  last,
  onNext,
  ref,
}: {
  result: RoundResult;
  last: boolean;
  onNext: () => void;
  ref: Ref<HTMLDivElement>;
}) {
  const { outcome, points, question } = result;
  const t = questionTrack(question);
  let title: string;
  if (question.kind === 'anio') title = outcome.yearDiff === 0 ? '¡Exacto!' : outcome.correct ? '¡Muy cerca!' : outcome.reveal;
  else title = outcome.correct ? (outcome.typed ? '¡Correcto! ×1,5' : '¡Correcto!') : outcome.reveal;
  const sub = title.includes(t.title) ? t.artistName : `${t.title} · ${t.artistName}`;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !(e.target instanceof HTMLInputElement)) {
        e.preventDefault();
        onNext();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onNext]);

  return (
    <div ref={ref} className={outcome.correct ? 'banner ok' : 'banner ko'} role="status">
      <SafeImg src={t.coverSmall} alt="" width={48} height={48} />
      <div className="banner-text">
        <strong>{title}</strong>
        <span>{sub}</span>
      </div>
      {points > 0 && <span className="banner-pts">+{fmtInt(points)}</span>}
      <button className="btn-light" onClick={onNext} autoFocus>
        {last ? 'Resultado' : 'Siguiente'}
        <Icon name="next" size={16} />
      </button>
    </div>
  );
}
