import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { audio } from '../audio/engine';
import type { Profile } from '../auth/auth';
import { Avatar } from '../components/Avatar';
import { Icon } from '../components/Icon';
import { buildQuestions, GameError } from '../game/build';
import { filterLabel } from '../game/catalog';
import { MODES, modeTitle } from '../game/modes';
import { roundPoints } from '../game/scoring';
import type { Filter, Outcome, PlayMode, Question } from '../game/types';
import { isUrbanoFilter } from '../game/urbano';
import { fmtInt, isAbort } from '../lib/util';
import { packGame, unpackGame, type PackedGame } from '../online/pack';
import { COUNTDOWN_MS, MAX_PLAYERS, newRoomCode, REVEAL_MS, ROUND_MS, useRoom, validCode, type Player } from '../online/room';
import type { Settings } from '../settings';
import { Round } from './Rounds';

interface Props {
  me: Profile | null;
  filter: Filter;
  settings: Settings;
  /** Código que venía en el enlace (?sala=XXXXX) */
  initialCode?: string;
  onBack: () => void;
  onLogin: () => void;
}

export function Online({ me, filter, settings, initialCode, onBack, onLogin }: Props) {
  const [room, setRoom] = useState<{ code: string; host: boolean } | null>(null);
  const [code, setCode] = useState(initialCode ?? '');
  const clean = code.trim().toUpperCase();

  return (
    <main className="screen online">
      <header className="game-head">
        <button className="btn-square" onClick={room ? () => setRoom(null) : onBack} aria-label={room ? 'Salir de la sala' : 'Volver al inicio'}>
          <Icon name="back" size={20} />
        </button>
        <div className="game-title">
          <span className="game-mode">Jugar con amigos</span>
          <span className="game-sub">{room ? `Sala ${room.code}` : 'Salas en directo, hasta 8'}</span>
        </div>
        <span className="head-spacer" />
      </header>

      {!me && (
        <section className="stage state-card">
          <Icon name="users" size={28} />
          <p className="state-title">Entra con tu cuenta</p>
          <p className="muted center">Para jugar en una sala, los demás tienen que ver tu nombre.</p>
          <button className="btn-primary" onClick={onLogin}>
            Entrar
          </button>
        </section>
      )}

      {me && !room && (
        <>
          <section className="stage online-card">
            <span className="eyebrow accent">Crear sala</span>
            <p className="muted center">
              Jugaréis con tu filtro: <strong>{filterLabel(filter)}</strong>
            </p>
            <button
              className="btn-primary big"
              onClick={() => {
                audio.unlock();
                setRoom({ code: newRoomCode(), host: true });
              }}
            >
              <Icon name="plus" /> Crear sala
            </button>
          </section>
          <section className="stage online-card">
            <span className="eyebrow">Unirse con un código</span>
            <form
              className="answer-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (!validCode(clean)) return;
                audio.unlock();
                setRoom({ code: clean, host: false });
              }}
            >
              <label className="field">
                <span className="sr-only">Código de la sala</span>
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 5))}
                  placeholder="ABCDE"
                  className="code-input"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  enterKeyHint="go"
                />
              </label>
              <button type="submit" className="btn-square btn-cyan" aria-label="Unirse" disabled={!validCode(clean)}>
                <Icon name="arrow" size={20} />
              </button>
            </form>
          </section>
        </>
      )}

      {me && room && (
        <Room key={room.code} code={room.code} host={room.host} me={me} filter={filter} settings={settings} onLeave={() => setRoom(null)} />
      )}
    </main>
  );
}

type Phase = 'lobby' | 'preparing' | 'countdown' | 'play' | 'podium';

interface Answer {
  points: number;
  correct: boolean;
}

function Room({
  code,
  host,
  me,
  filter,
  settings,
  onLeave,
}: {
  code: string;
  host: boolean;
  me: Profile;
  filter: Filter;
  settings: Settings;
  onLeave: () => void;
}) {
  const { players, status, send, on, setPlaying } = useRoom(code, me, host);
  const [mode, setMode] = useState<PlayMode>('mezcla');
  const [label, setLabel] = useState(filterLabel(filter));
  const [phase, setPhase] = useState<Phase>('lobby');
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [index, setIndex] = useState(-1);
  const [answers, setAnswers] = useState<Record<string, Record<number, Answer>>>({});
  const [mine, setMine] = useState<Outcome | null>(null);
  const [copied, setCopied] = useState(false);

  const hostPlayer = players.find((p) => p.host);
  const ids = useMemo(() => players.slice(0, MAX_PLAYERS).map((p) => p.id), [players]);
  const lateJoin = !host && phase === 'lobby' && !!hostPlayer?.playing;
  const abort = useRef<AbortController | null>(null);
  const timers = useRef<number[]>([]);
  const ready = useRef(new Set<string>());
  const firstRound = useRef(false);
  const state = useRef({ index, questions, answers, mine, phase, ids });
  state.current = { index, questions, answers, mine, phase, ids };

  const later = (fn: () => void, ms: number) => timers.current.push(window.setTimeout(fn, ms));
  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  useEffect(() => () => (clearTimers(), abort.current?.abort(), audio.stop()), []);

  // ---------- Anfitrión ----------

  const startRound = useCallback((i: number) => send('round', { index: i }), [send]);

  const start = async () => {
    audio.unlock();
    setError('');
    setPhase('preparing');
    setPlaying(true);
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    try {
      const qs = await buildQuestions(mode, filter, (p) => setProgress(p.label), ctrl.signal);
      const game = packGame(mode, filterLabel(filter), isUrbanoFilter(filter), qs);
      ready.current = new Set();
      firstRound.current = false;
      send('start', { game });
      // Esperamos a que todos tengan la partida (como mucho 12 s)
      later(() => {
        if (firstRound.current) return;
        firstRound.current = true;
        startRound(0);
      }, 12_000);
    } catch (e) {
      if (isAbort(e)) return;
      setError(e instanceof GameError ? e.message : 'No se ha podido preparar la partida. Inténtalo otra vez.');
      setPhase('lobby');
      setPlaying(false);
    }
  };

  // El anfitrión pasa a la siguiente prueba cuando todos han respondido o se acaba el tiempo
  const advanced = useRef(-1);
  const advance = useCallback(
    (i: number) => {
      if (!host || advanced.current >= i) return;
      advanced.current = i;
      later(() => {
        if (i + 1 >= state.current.questions.length) send('end');
        else startRound(i + 1);
      }, REVEAL_MS);
    },
    [host, send, startRound],
  );

  useEffect(() => {
    if (!host || phase !== 'play' || index < 0) return;
    const all = ids.every((id) => answers[id]?.[index]);
    if (all) advance(index);
  }, [host, phase, index, answers, ids, advance]);

  // ---------- Mensajes ----------

  on('start', async (p) => {
    const game = p.game as PackedGame;
    // El anfitrión conserva su temporizador de "empezar aunque falte alguien"
    if (!host) clearTimers();
    setPhase('preparing');
    setMode(game.mode);
    setLabel(game.label);
    setProgress('Recibiendo la partida…');
    setAnswers({});
    setIndex(-1);
    advanced.current = -1;
    const qs = await unpackGame(game, { refreshAudio: false });
    setQuestions(qs);
    send('ready', { id: me.id });
  });

  on('ready', (p) => {
    if (!host) return;
    ready.current.add(String(p.id));
    if (!firstRound.current && state.current.ids.every((id) => ready.current.has(id))) {
      firstRound.current = true;
      startRound(0);
    }
  });

  on('round', (p) => {
    const i = Number(p.index);
    clearTimers();
    setIndex(i);
    setMine(null);
    setPhase('countdown');
    later(() => setPhase('play'), COUNTDOWN_MS);
    // Se acabó el tiempo: cuenta como fallo
    later(() => {
      if (!state.current.mine && state.current.index === i) answer(i, null);
    }, COUNTDOWN_MS + ROUND_MS);
    // Red de seguridad del anfitrión por si alguien se queda colgado
    if (host) later(() => advance(i), COUNTDOWN_MS + ROUND_MS + 1500);
  });

  on('answer', (p) => {
    const id = String(p.id);
    const i = Number(p.index);
    setAnswers((prev) => ({ ...prev, [id]: { ...prev[id], [i]: { points: Number(p.points) || 0, correct: !!p.correct } } }));
  });

  on('end', () => {
    clearTimers();
    audio.stop();
    setPhase('podium');
    if (host) setPlaying(false);
  });

  on('lobby', () => {
    clearTimers();
    audio.stop();
    setPhase('lobby');
    setQuestions([]);
    setIndex(-1);
    setAnswers({});
  });

  // ---------- Jugador ----------

  const myAnswers = answers[me.id] ?? {};
  const streak = useMemo(() => {
    let s = 0;
    for (let i = index - 1; i >= 0 && myAnswers[i]?.correct; i--) s++;
    return s;
  }, [myAnswers, index]);

  const answer = (i: number, o: Outcome | null) => {
    const q = state.current.questions[i];
    if (!q || state.current.mine) return;
    const outcome: Outcome = o ?? { correct: false, typed: false, factor: 0, short: '—', reveal: 'Se acabó el tiempo' };
    state.current.mine = outcome;
    setMine(outcome);
    audio.sfx(outcome.correct ? 'right' : 'wrong');
    const points = roundPoints(q, outcome, streak);
    send('answer', { id: me.id, index: i, points, correct: outcome.correct });
  };

  const totals = useMemo(() => {
    const t = players.slice(0, MAX_PLAYERS).map((p) => ({
      p,
      score: Object.values(answers[p.id] ?? {}).reduce((a, x) => a + x.points, 0),
      answered: index >= 0 && !!answers[p.id]?.[index],
    }));
    return t.sort((a, b) => b.score - a.score);
  }, [players, answers, index]);

  const shareRoom = async () => {
    const link = `${window.location.href.split(/[?#]/)[0]}?sala=${code}`;
    const text = `¡Únete a mi sala de MusicGuesser! Código ${code}`;
    try {
      if (navigator.share) await navigator.share({ text, url: link });
      else {
        await navigator.clipboard.writeText(`${text}\n${link}`);
        setCopied(true);
      }
    } catch {
      /* cancelado */
    }
  };

  // ---------- Pantallas ----------

  if (status === 'full')
    return <Notice title="Sala llena" text={`Esta sala ya tiene ${MAX_PLAYERS} jugadores.`} onLeave={onLeave} />;
  if (status === 'error') return <Notice title="Sin conexión" text="No hemos podido entrar en la sala. Inténtalo de nuevo." onLeave={onLeave} />;
  if (status === 'connecting') return <Notice title="Entrando en la sala…" />;
  if (lateJoin) return <Notice title="Ya han empezado" text="Espera a que acaben esta partida o pide otro código." onLeave={onLeave} />;
  if (!host && players.length > 0 && !hostPlayer && phase !== 'podium')
    return <Notice title="El anfitrión no está" text="La sala se ha quedado sin anfitrión. Pídele que la vuelva a crear." onLeave={onLeave} />;

  const q = index >= 0 ? questions[index] : null;

  return (
    <>
      {(phase === 'countdown' || phase === 'play' || phase === 'podium') && <Scoreboard totals={totals} meId={me.id} podium={phase === 'podium'} />}

      {phase === 'lobby' && (
        <>
          <section className="stage online-card">
            <span className="eyebrow">Código de la sala</span>
            <strong className="room-code">{code}</strong>
            <button className="btn-ghost" onClick={shareRoom}>
              <Icon name="share" /> {copied ? 'Enlace copiado' : 'Invitar'}
            </button>
          </section>
          <section className="block">
            <div className="block-head">
              <h2>Jugadores</h2>
              <span className="muted">
                {Math.min(players.length, MAX_PLAYERS)}/{MAX_PLAYERS}
              </span>
            </div>
            <ul className="room-players">
              {players.slice(0, MAX_PLAYERS).map((p) => (
                <li key={p.id}>
                  <Avatar id={p.avatar} name={p.name} size={36} />
                  <strong>{p.name}</strong>
                  {p.host && (
                    <span className="tag">
                      <Icon name="crown" size={12} /> Anfitrión
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>
          {host ? (
            <section className="block">
              <div className="block-head">
                <h2>Minijuego</h2>
                <span className="muted">{label}</span>
              </div>
              <div className="chips">
                {(['mezcla', ...MODES.filter((m) => (!m.urbanoOnly || isUrbanoFilter(filter)) && !(m.genresOnly && filter.kind === 'artist')).map((m) => m.id)] as PlayMode[]).map(
                  (m) => (
                    <button key={m} className={m === mode ? 'chip on' : 'chip'} aria-pressed={m === mode} onClick={() => setMode(m)}>
                      {modeTitle(m)}
                    </button>
                  ),
                )}
              </div>
              {error && <p className="form-error">{error}</p>}
              <button className="btn-primary big" onClick={start}>
                <Icon name="play" /> Empezar {players.length < 2 && <span className="muted">(estás solo)</span>}
              </button>
            </section>
          ) : (
            <p className="muted center">Esperando a que {hostPlayer?.name ?? 'el anfitrión'} empiece la partida…</p>
          )}
        </>
      )}

      {phase === 'preparing' && (
        <section className="stage state-card" aria-live="polite">
          <div className="loader-eq" aria-hidden="true">
            {Array.from({ length: 7 }, (_, i) => (
              <span key={i} style={{ animationDelay: `${i * 0.09}s` }} />
            ))}
          </div>
          <p className="state-title">{progress || 'Preparando la partida…'}</p>
          <p className="muted">
            {modeTitle(mode)} · {label}
          </p>
        </section>
      )}

      {phase === 'countdown' && (
        <section className="stage state-card">
          <span className="eyebrow accent">
            Prueba {index + 1} de {questions.length}
          </span>
          <p className="state-title">¡Prepárate!</p>
          <span className="countdown-bar" style={{ animationDuration: `${COUNTDOWN_MS}ms` }} />
        </section>
      )}

      {phase === 'play' && q && (
        <>
          <div className="live-head">
            <span className="eyebrow">
              {mode === 'mezcla' ? `${modeTitle(q.kind)} · ` : ''}Prueba {index + 1} de {questions.length}
            </span>
            {!mine && <span key={index} className="round-timer" style={{ animationDuration: `${ROUND_MS}ms` }} />}
          </div>
          <div className="round" key={index}>
            <Round q={q} answered={!!mine} showOptions={settings.showOptions} onOutcome={(o) => answer(index, o)} />
          </div>
          {mine && (
            <div className={mine.correct ? 'banner ok' : 'banner ko'} role="status">
              <div className="banner-text">
                <strong>{mine.correct ? (mine.typed ? '¡Correcto! ×1,5' : '¡Correcto!') : mine.reveal}</strong>
                <span>
                  {totals.filter((t) => t.answered).length}/{totals.length} han respondido
                </span>
              </div>
              {myAnswers[index]?.points ? <span className="banner-pts">+{fmtInt(myAnswers[index].points)}</span> : null}
            </div>
          )}
        </>
      )}

      {phase === 'podium' && (
        <section className="block">
          {host ? (
            <button className="btn-primary big" onClick={() => send('lobby')}>
              <Icon name="replay" /> Otra partida
            </button>
          ) : (
            <p className="muted center">Esperando a que {hostPlayer?.name ?? 'el anfitrión'} prepare otra…</p>
          )}
          <button className="btn-ghost" onClick={onLeave}>
            Salir de la sala
          </button>
        </section>
      )}
    </>
  );
}

function Scoreboard({ totals, meId, podium }: { totals: { p: Player; score: number; answered: boolean }[]; meId: string; podium: boolean }) {
  return (
    <ol className={podium ? 'scoreboard podium' : 'scoreboard'}>
      {totals.map((t, i) => (
        <li key={t.p.id} className={t.p.id === meId ? 'me' : ''}>
          <span className="sb-pos">{i + 1}</span>
          <Avatar id={t.p.avatar} name={t.p.name} size={podium ? 36 : 26} />
          <span className="sb-name">{t.p.name}</span>
          {!podium && t.answered && <Icon name="check" size={14} />}
          <span className="sb-score">{fmtInt(t.score)}</span>
        </li>
      ))}
    </ol>
  );
}

function Notice({ title, text, onLeave }: { title: string; text?: string; onLeave?: () => void }) {
  return (
    <section className="stage state-card">
      <p className="state-title">{title}</p>
      {text && <p className="muted center">{text}</p>}
      {onLeave && (
        <button className="btn-ghost" onClick={onLeave}>
          Volver
        </button>
      )}
    </section>
  );
}
