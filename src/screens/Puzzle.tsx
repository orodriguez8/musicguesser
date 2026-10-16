import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { dz, type DzTrack } from '../api/deezer';
import { Icon, type IconName } from '../components/Icon';
import { SafeImg } from '../components/SafeImg';
import {
  dailyDone,
  loadDaily,
  loadStats,
  recordDaily,
  saveDaily,
  seededRandom,
  todayKey,
  type PuzzleId,
  type PuzzleResult,
  type PuzzleStats,
} from '../game/daily';
import { displayTitle } from '../game/pool';
import {
  CLASICO_TRIES,
  compareArtists,
  dailyOpts,
  pickAlbumQuiz,
  pickClasico,
  pickPiramide,
  pickWordle,
  PYRAMID_SIZE,
  scoreWord,
  WORDLE_TRIES,
  wordleWord,
  type Hint,
  type LetterState,
  type PuzzleOpts,
} from '../game/puzzles';
import { answerMatches, normText, suggestMatches } from '../game/text';
import type { Filter } from '../game/types';
import { artistPicUrl, coverUrl, isUrbanoFilter, loadUrbano, type UrbanoDB } from '../game/urbano';
import { fmtInt } from '../lib/util';

export const PUZZLES: { id: PuzzleId; title: string; desc: string; icon: IconName; dailyOnly?: boolean }[] = [
  { id: 'clasico', title: 'Clásico', desc: 'Adivina el artista por sus datos', icon: 'mic' },
  { id: 'wordle', title: 'Wordle', desc: 'El nombre del artista, letra a letra', icon: 'grid' },
  { id: 'albumquiz', title: 'Album Quiz', desc: '¿Cuántas canciones del disco recuerdas?', icon: 'lines' },
  { id: 'top10', title: 'Top 10', desc: '¿Conoces el top de hoy?', icon: 'podium', dailyOnly: true },
  { id: 'piramide', title: 'Pirámide', desc: 'Ordena por popularidad', icon: 'layers' },
];

interface Props {
  id: PuzzleId;
  filter: Filter;
  onBack: () => void;
}

/** Lo que recibe cada puzle. makeOpts() da siempre el mismo reto (el del día o el de esta ronda libre). */
interface GameProps<T> {
  db: UrbanoDB;
  makeOpts: () => PuzzleOpts;
  saved?: T;
  onSave: (data: T) => void;
  onFinish: (r: PuzzleResult) => void;
  finished: boolean;
}

export function Puzzle({ id, filter, onBack }: Props) {
  const info = PUZZLES.find((p) => p.id === id)!;
  const [db, setDb] = useState<UrbanoDB | null>(null);
  const [failed, setFailed] = useState(false);
  const [daily, setDaily] = useState(true);
  const [round, setRound] = useState(0);
  const [result, setResult] = useState<PuzzleResult | null>(() => loadDaily(id)?.result ?? null);
  const [stats, setStats] = useState<PuzzleStats>(() => loadStats(id));

  useEffect(() => {
    loadUrbano()
      .then(setDb)
      .catch(() => setFailed(true));
  }, []);

  // Cada llamada crea un generador nuevo desde la semilla: así el reto del día sale igual
  // siempre (aunque React calcule dos veces), y en libre cada "Otro" tiene semilla nueva.
  // Modo libre: los géneros y la dificultad de la pantalla de inicio (si son de urbano).
  const makeOpts = useMemo(() => {
    if (daily) {
      const seed = `${todayKey()}:${id}`;
      return () => dailyOpts(seededRandom(seed));
    }
    const seed = `libre:${round}:${Math.random()}`;
    const urbano = isUrbanoFilter(filter);
    const genres = urbano ? filter.genres : ['reggaeton', 'trap-es'];
    const level = urbano ? (filter.level ?? 'normal') : 'normal';
    const era = urbano ? filter.era : undefined;
    return (): PuzzleOpts => ({ rng: seededRandom(seed), genres, era, level });
  }, [daily, round, id, filter]);

  const saved = daily ? loadDaily<unknown>(id) : null;

  const switchTo = (d: boolean) => {
    setDaily(d);
    setRound((r) => r + 1);
    setResult(d ? (loadDaily(id)?.result ?? null) : null);
  };

  const finish = (r: PuzzleResult) => {
    setResult(r);
    if (daily) setStats(recordDaily(id, r));
  };

  const common = {
    db: db!,
    makeOpts,
    saved: saved?.data,
    onSave: (data: unknown) => daily && saveDaily(id, data, saved?.result),
    onFinish: (r: PuzzleResult) => {
      if (daily) saveDaily(id, loadDaily(id)?.data ?? null, r);
      finish(r);
    },
    finished: !!result,
  };
  const key = `${daily}:${round}`;

  return (
    <main className="screen puzzle">
      <header className="game-head">
        <button className="btn-square" onClick={onBack} aria-label="Volver al inicio">
          <Icon name="back" size={20} />
        </button>
        <div className="game-title">
          <span className="game-mode">{info.title}</span>
          <span className="game-sub">{info.desc}</span>
        </div>
        <span className={stats.streak >= 2 ? 'streak hot' : 'streak'} aria-label={`Racha de ${stats.streak} días`}>
          <Icon name="flame" size={16} />
          {stats.streak}
        </span>
      </header>

      {!info.dailyOnly && (
        <div className="segmented" role="tablist" aria-label="Tipo de reto">
          <button role="tab" aria-selected={daily} className={daily ? 'on' : ''} onClick={() => switchTo(true)}>
            Reto del día
          </button>
          <button role="tab" aria-selected={!daily} className={!daily ? 'on' : ''} onClick={() => switchTo(false)}>
            Libre
          </button>
        </div>
      )}

      {failed && (
        <section className="stage state-card">
          <p className="state-title">No se ha podido cargar</p>
          <p className="muted center">Revisa tu conexión y vuelve a intentarlo.</p>
        </section>
      )}
      {!db && !failed && (
        <section className="stage state-card" aria-busy="true">
          <p className="state-title">Cargando…</p>
        </section>
      )}

      {db && (
        <div className="puzzle-body" key={key}>
          {id === 'clasico' && <Clasico {...(common as GameProps<number[]>)} />}
          {id === 'wordle' && <Wordle {...(common as GameProps<string[]>)} />}
          {id === 'albumquiz' && <AlbumQuiz {...(common as GameProps<AlbumQuizSave>)} />}
          {id === 'top10' && <Top10 {...(common as GameProps<Top10Save>)} />}
          {id === 'piramide' && <Piramide {...(common as GameProps<number[]>)} />}
        </div>
      )}

      {result && (
        <ResultCard
          title={info.title}
          result={result}
          daily={daily}
          stats={stats}
          onAnother={info.dailyOnly ? undefined : () => (daily ? switchTo(false) : (setResult(null), setRound((r) => r + 1)))}
        />
      )}
    </main>
  );
}

function ResultCard({
  title,
  result,
  daily,
  stats,
  onAnother,
}: {
  title: string;
  result: PuzzleResult;
  daily: boolean;
  stats: PuzzleStats;
  onAnother?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    const text = `MusicGuesser · ${title}${daily ? ` · ${todayKey()}` : ''}\n${result.score}\n${result.grid}`;
    const link = window.location.href.split('#')[0];
    try {
      if (navigator.share) await navigator.share({ text, url: link });
      else {
        await navigator.clipboard.writeText(`${text}\n${link}`);
        setCopied(true);
      }
    } catch {
      /* compartir cancelado */
    }
  };
  return (
    <section className={result.won ? 'stage puzzle-result ok' : 'stage puzzle-result ko'} role="status">
      <strong className="puzzle-result-title">{result.won ? '¡Conseguido!' : 'Esta vez no'}</strong>
      <span className="puzzle-result-score">{result.score}</span>
      {daily && (
        <div className="puzzle-stats">
          <span>
            <strong>{stats.played}</strong> jugados
          </span>
          <span>
            <strong>{stats.played ? Math.round((stats.won / stats.played) * 100) : 0} %</strong> ganados
          </span>
          <span>
            <strong>{stats.streak}</strong> racha
          </span>
          <span>
            <strong>{stats.best}</strong> mejor racha
          </span>
        </div>
      )}
      {daily && <p className="muted small center">Mañana a las 00:00 hay reto nuevo.</p>}
      <div className="row-actions">
        <button className="btn-ghost" onClick={share}>
          <Icon name="share" /> {copied ? 'Copiado' : 'Compartir'}
        </button>
        {onAnother && (
          <button className="btn-primary grow" onClick={onAnother}>
            <Icon name="replay" /> {daily ? 'Jugar en libre' : 'Otro'}
          </button>
        )}
      </div>
    </section>
  );
}

// ---------- Caja de texto con autocompletado ----------

function GuessInput({
  items,
  placeholder,
  disabled,
  onGuess,
}: {
  items: readonly string[];
  placeholder: string;
  disabled?: boolean;
  /** Devuelve false si el intento no vale (para sacudir la caja) */
  onGuess: (text: string) => boolean | void;
}) {
  const [value, setValue] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [shake, setShake] = useState(false);
  const listId = useId();
  const matches = useMemo(() => suggestMatches(value, items, 6), [value, items]);
  const show = open && !disabled && matches.length > 0;

  const send = (text: string) => {
    if (!text.trim()) return;
    if (onGuess(text) === false) {
      setShake(true);
      setTimeout(() => setShake(false), 400);
      return;
    }
    setValue('');
    setOpen(false);
    setActive(-1);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    send(show && active >= 0 ? matches[active] : value);
  };

  const onKey = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (!show) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (i + 1) % matches.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (i <= 0 ? matches.length - 1 : i - 1));
    } else if (e.key === 'Escape') setOpen(false);
  };

  return (
    <form className={shake ? 'answer-form guess-form wrong' : 'answer-form guess-form'} onSubmit={submit}>
      <div className="search guess-wrap">
        <label className="field">
          <span className="sr-only">{placeholder}</span>
          <input
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setOpen(true);
              setActive(-1);
            }}
            onKeyDown={onKey}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            role="combobox"
            aria-expanded={show}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={show && active >= 0 ? `${listId}-${active}` : undefined}
            placeholder={placeholder}
            disabled={disabled}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            enterKeyHint="send"
          />
        </label>
        {show && (
          <ul className="search-list" id={listId} role="listbox">
            {matches.map((m, i) => (
              <li
                key={m}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                className={i === active ? 'search-item active' : 'search-item'}
                onMouseDown={(e) => {
                  e.preventDefault();
                  send(m);
                }}
              >
                <span className="search-name">{m}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <button type="submit" className="btn-square btn-cyan" aria-label="Probar" disabled={disabled || !value.trim()}>
        <Icon name="arrow" size={20} />
      </button>
    </form>
  );
}

// ---------- Clásico ----------

const HINT_EMOJI: Record<Hint, string> = { ok: '🟩', 'near-up': '🟨', 'near-down': '🟨', up: '⬛', down: '⬛', no: '⬛' };
const HINT_ARROW: Partial<Record<Hint, string>> = { up: '↑', down: '↓', 'near-up': '↑', 'near-down': '↓' };

function Clasico({ db, makeOpts, saved, onSave, onFinish, finished }: GameProps<number[]>) {
  const target = useMemo(() => pickClasico(db, makeOpts()), [db, makeOpts]);
  const [guesses, setGuesses] = useState<number[]>(() => saved ?? []);
  const names = useMemo(() => db.artists.map((a) => a.n), [db]);
  const won = guesses.includes(target.id);
  const over = won || guesses.length >= CLASICO_TRIES;

  const guess = (text: string) => {
    const a = db.artists.find((x) => normText(x.n) === normText(text));
    if (!a || guesses.includes(a.id)) return false;
    const next = [...guesses, a.id];
    setGuesses(next);
    onSave(next);
    const isWin = a.id === target.id;
    if (isWin || next.length >= CLASICO_TRIES) {
      const grid = next.map((id) => compareArtists(db.artistById.get(id)!, target).map((c) => HINT_EMOJI[c.hint]).join('')).join('\n');
      onFinish({ won: isWin, attempts: next.length, score: `${isWin ? next.length : 'X'}/${CLASICO_TRIES}`, grid });
    }
  };

  return (
    <>
      <p className="muted center small">
        Artista urbano secreto · {CLASICO_TRIES - guesses.length} {CLASICO_TRIES - guesses.length === 1 ? 'intento' : 'intentos'}
      </p>
      {!over && !finished && <GuessInput items={names} placeholder="Escribe un artista…" onGuess={guess} />}
      {over && <Reveal picture={artistPicUrl(target.p)} title={target.n} sub={won ? '¡Era este!' : 'Era este artista'} round />}
      <ol className="clasico-rows">
        {[...guesses].reverse().map((id) => {
          const a = db.artistById.get(id)!;
          const cells = compareArtists(a, target);
          return (
            <li key={id} className={id === target.id ? 'clasico-row win' : 'clasico-row'}>
              <div className="clasico-who">
                <SafeImg src={artistPicUrl(a.p)} alt="" width={36} height={36} />
                <strong>{a.n}</strong>
              </div>
              <div className="clasico-cells">
                {cells.map((c) => (
                  <span key={c.label} className={`clasico-cell h-${c.hint}`}>
                    <span className="clasico-label">{c.label}</span>
                    <span className="clasico-value">
                      {c.value}
                      {HINT_ARROW[c.hint] && <span aria-label={c.hint.endsWith('up') ? 'más' : 'menos'}> {HINT_ARROW[c.hint]}</span>}
                    </span>
                  </span>
                ))}
              </div>
            </li>
          );
        })}
      </ol>
      {!guesses.length && (
        <p className="muted small center">
          Verde: igual · Amarillo: cerca · ↑↓: el secreto tiene más o menos (debut, fans, discos).
        </p>
      )}
    </>
  );
}

function Reveal({ picture, title, sub, round }: { picture: string; title: string; sub: string; round?: boolean }) {
  return (
    <div className="puzzle-reveal">
      <SafeImg src={picture} alt="" width={64} height={64} className={round ? 'round' : undefined} />
      <div>
        <span className="muted small">{sub}</span>
        <strong>{title}</strong>
      </div>
    </div>
  );
}

// ---------- Wordle ----------

const KEY_ROWS = ['QWERTYUIOP', 'ASDFGHJKL', '⏎ZXCVBNM⌫'];
const LETTER_EMOJI: Record<LetterState, string> = { ok: '🟩', near: '🟨', no: '⬛' };

function Wordle({ db, makeOpts, saved, onSave, onFinish, finished }: GameProps<string[]>) {
  const target = useMemo(() => pickWordle(db, makeOpts()), [db, makeOpts]);
  const word = wordleWord(target.n);
  const [guesses, setGuesses] = useState<string[]>(() => saved ?? []);
  const [current, setCurrent] = useState('');
  const [shake, setShake] = useState(false);
  const won = guesses.includes(word);
  const over = won || guesses.length >= WORDLE_TRIES || finished;

  const keyState = useMemo(() => {
    const m = new Map<string, LetterState>();
    const rank = { no: 0, near: 1, ok: 2 };
    for (const g of guesses)
      scoreWord(g, word).forEach((s, i) => {
        const prev = m.get(g[i]);
        if (!prev || rank[s] > rank[prev]) m.set(g[i], s);
      });
    return m;
  }, [guesses, word]);

  const press = (k: string) => {
    if (over) return;
    if (k === '⌫') return setCurrent((c) => c.slice(0, -1));
    if (k === '⏎') {
      if (current.length !== word.length) {
        setShake(true);
        setTimeout(() => setShake(false), 400);
        return;
      }
      const next = [...guesses, current];
      setGuesses(next);
      setCurrent('');
      onSave(next);
      const isWin = current === word;
      if (isWin || next.length >= WORDLE_TRIES) {
        const grid = next.map((g) => scoreWord(g, word).map((s) => LETTER_EMOJI[s]).join('')).join('\n');
        onFinish({ won: isWin, attempts: next.length, score: `${isWin ? next.length : 'X'}/${WORDLE_TRIES}`, grid });
      }
      return;
    }
    if (/^[A-Z]$/.test(k)) setCurrent((c) => (c.length < word.length ? c + k : c));
  };

  // Teclado físico
  const pressRef = useRef(press);
  pressRef.current = press;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'Enter') pressRef.current('⏎');
      else if (e.key === 'Backspace') pressRef.current('⌫');
      else if (/^[a-zñ]$/i.test(e.key)) pressRef.current(normText(e.key).toUpperCase());
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const size = `min(52px, calc((100vw - 48px) / ${word.length} - 6px))`;
  const rows = Array.from({ length: WORDLE_TRIES }, (_, i) => guesses[i] ?? (i === guesses.length && !over ? current : ''));

  return (
    <>
      <p className="muted center small">
        Nombre artístico de {word.length} letras, sin espacios ni tildes
      </p>
      <div className="wordle-grid" style={{ ['--tile' as string]: size }}>
        {rows.map((g, r) => {
          const scored = r < guesses.length ? scoreWord(g, word) : null;
          return (
            <div key={r} className={r === guesses.length && shake ? 'wordle-row shake' : 'wordle-row'}>
              {Array.from({ length: word.length }, (_, i) => (
                <span key={i} className={`wordle-tile ${scored ? scored[i] : g[i] ? 'filled' : ''}`}>
                  {g[i] ?? ''}
                </span>
              ))}
            </div>
          );
        })}
      </div>
      {over && <Reveal picture={artistPicUrl(target.p)} title={target.n} sub={won ? '¡Era este!' : 'Era este artista'} round />}
      {!over && (
        <div className="keyboard">
          {KEY_ROWS.map((row) => (
            <div key={row} className="keyboard-row">
              {[...row].map((k) => (
                <button
                  key={k}
                  type="button"
                  className={`key ${keyState.get(k) ?? ''} ${k === '⏎' || k === '⌫' ? 'wide' : ''}`}
                  onClick={() => press(k)}
                  aria-label={k === '⏎' ? 'Enviar' : k === '⌫' ? 'Borrar' : k}
                >
                  {k === '⏎' ? 'ENVIAR' : k}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ---------- Album Quiz ----------

interface AlbumQuizSave {
  found: number[];
  gaveUp?: boolean;
}

function AlbumQuiz({ db, makeOpts, saved, onSave, onFinish, finished }: GameProps<AlbumQuizSave>) {
  const album = useMemo(() => pickAlbumQuiz(db, makeOpts()), [db, makeOpts]);
  const artist = db.artistById.get(album.a)!;
  const [state, setState] = useState<AlbumQuizSave>(() => saved ?? { found: [] });
  const over = finished || state.gaveUp || state.found.length === album.tr.length;
  // Sugerencias: todas las canciones del artista (no solo las del disco, que eso lo chivaría)
  const items = useMemo(
    () => [...new Set([...db.tracks.filter((t) => t.a === album.a).map((t) => t.t), ...album.tr])].sort((a, b) => a.localeCompare(b, 'es')),
    [db, album],
  );

  const end = (s: AlbumQuizSave) => {
    const n = s.found.length;
    const total = album.tr.length;
    const grid = album.tr.map((_, i) => (s.found.includes(i) ? '🟩' : '⬛')).join('');
    onFinish({ won: n >= Math.ceil(total / 2), attempts: Math.max(1, n), score: `${n}/${total}`, grid });
  };

  const guess = (text: string) => {
    const i = album.tr.findIndex((t, k) => !state.found.includes(k) && answerMatches(text, [t]));
    if (i < 0) return false;
    const next = { ...state, found: [...state.found, i] };
    setState(next);
    onSave(next);
    if (next.found.length === album.tr.length) end(next);
  };

  const giveUp = () => {
    const next = { ...state, gaveUp: true };
    setState(next);
    onSave(next);
    end(next);
  };

  return (
    <>
      <div className="album-head">
        <SafeImg src={coverUrl(album.m, 250)} alt="" width={96} height={96} />
        <div>
          <strong>{album.t}</strong>
          <span>
            {artist.n}
            {album.y ? ` · ${album.y}` : ''}
          </span>
          <span className="muted small">
            {state.found.length} de {album.tr.length} canciones
          </span>
        </div>
      </div>
      {!over && <GuessInput items={items} placeholder="Escribe una canción del disco…" onGuess={guess} />}
      <ol className="slots">
        {album.tr.map((t, i) => {
          const ok = state.found.includes(i);
          return (
            <li key={i} className={ok ? 'slot ok' : over ? 'slot missed' : 'slot'}>
              <span className="slot-num">{i + 1}</span>
              <span className="slot-text">{ok || over ? t : '· · ·'}</span>
            </li>
          );
        })}
      </ol>
      {!over && (
        <button className="btn-ghost" onClick={giveUp}>
          Me rindo
        </button>
      )}
    </>
  );
}

// ---------- Top 10 ----------

interface Top10Save {
  found: number[];
  hints: number[];
  gaveUp?: boolean;
}

interface ChartSong {
  title: string;
  artist: string;
  cover: string;
}

function Top10({ db, saved, onSave, onFinish, finished }: GameProps<Top10Save>) {
  const [chart, setChart] = useState<ChartSong[] | null>(null);
  const [error, setError] = useState(false);
  const [state, setState] = useState<Top10Save>(() => saved ?? { found: [], hints: [] });

  useEffect(() => {
    // Lista de reggaetón de Deezer (la misma para todos hoy)
    dz<{ data?: DzTrack[] }>('/chart/122/tracks?limit=10')
      .then((r) =>
        setChart(
          (r.data ?? []).map((t) => ({ title: displayTitle(t), artist: t.artist.name, cover: t.album?.cover_medium ?? '' })),
        ),
      )
      .catch(() => setError(true));
  }, []);

  const items = useMemo(
    () => [...new Set([...db.tracks.map((t) => t.t), ...(chart ?? []).map((c) => c.title)])].sort((a, b) => a.localeCompare(b, 'es')),
    [db, chart],
  );

  if (error) return <p className="muted center">No se ha podido cargar el top de hoy. Inténtalo en un rato.</p>;
  if (!chart) return <p className="muted center">Cargando el top de hoy…</p>;

  const over = finished || state.gaveUp || state.found.length === chart.length;
  const end = (s: Top10Save) => {
    const n = s.found.length;
    const grid = chart.map((_, i) => (s.found.includes(i) ? (s.hints.includes(i) ? '🟨' : '🟩') : '⬛')).join('');
    onFinish({ won: n >= 5, attempts: Math.max(1, n), score: `${n}/${chart.length}`, grid });
  };
  const update = (s: Top10Save) => {
    setState(s);
    onSave(s);
  };

  const guess = (text: string) => {
    const i = chart.findIndex((c, k) => !state.found.includes(k) && answerMatches(text, [c.title]));
    if (i < 0) return false;
    const next = { ...state, found: [...state.found, i] };
    update(next);
    if (next.found.length === chart.length) end(next);
  };

  return (
    <>
      <p className="muted center small">
        Las 10 más escuchadas hoy en el reggaetón de Deezer. Escríbelas en cualquier orden.
      </p>
      {!over && <GuessInput items={items} placeholder="Escribe una canción…" onGuess={guess} />}
      <ol className="slots">
        {chart.map((c, i) => {
          const ok = state.found.includes(i);
          const hinted = state.hints.includes(i);
          return (
            <li key={i} className={ok ? 'slot ok' : over ? 'slot missed' : 'slot'}>
              <span className="slot-num">{i + 1}</span>
              {ok || over ? <SafeImg src={c.cover} alt="" width={32} height={32} /> : null}
              <span className="slot-text">
                {ok || over ? c.title : '· · ·'}
                {(ok || over || hinted) && <span className="slot-sub">{c.artist}</span>}
              </span>
              {!ok && !over && !hinted && (
                <button className="btn-chip small" onClick={() => update({ ...state, hints: [...state.hints, i] })}>
                  Pista
                </button>
              )}
            </li>
          );
        })}
      </ol>
      {!over && (
        <button
          className="btn-ghost"
          onClick={() => {
            const next = { ...state, gaveUp: true };
            update(next);
            end(next);
          }}
        >
          Me rindo
        </button>
      )}
    </>
  );
}

// ---------- Pirámide ----------

function Piramide({ db, makeOpts, saved, onSave, onFinish, finished }: GameProps<number[]>) {
  const songs = useMemo(() => pickPiramide(db, makeOpts()), [db, makeOpts]);
  const solution = useMemo(() => [...songs].sort((a, b) => b.rank - a.rank).map((s) => s.id), [songs]);
  // slots[i] = id de la canción colocada en el puesto i (0 = la más escuchada)
  const [slots, setSlots] = useState<(number | null)[]>(() =>
    saved && saved.length === PYRAMID_SIZE ? saved : Array.from({ length: PYRAMID_SIZE }, () => null),
  );
  const [checked, setChecked] = useState(() => !!saved && saved.length === PYRAMID_SIZE && saved.every((x) => x != null) && finished);
  const byId = new Map(songs.map((s) => [s.id, s]));
  const placed = new Set(slots.filter((x): x is number => x != null));
  const full = slots.every((x) => x != null);

  if (!songs.length) return <p className="muted center">No hemos podido montar la pirámide. Prueba otra vez.</p>;

  const place = (id: number) => {
    if (checked) return;
    const i = slots.indexOf(null);
    if (i < 0) return;
    setSlots(slots.map((x, k) => (k === i ? id : x)));
  };
  const unplace = (i: number) => !checked && setSlots(slots.map((x, k) => (k === i ? null : x)));

  const check = () => {
    setChecked(true);
    onSave(slots as number[]);
    const ok = slots.map((id, i) => id === solution[i]);
    const n = ok.filter(Boolean).length;
    onFinish({ won: n >= 3, attempts: Math.max(1, n), score: `${n}/${PYRAMID_SIZE}`, grid: ok.map((x) => (x ? '🟩' : '🟥')).join('') });
  };

  return (
    <>
      <p className="muted center small">Toca las canciones de más a menos escuchada (según Deezer).</p>
      <ol className="pyramid">
        {slots.map((id, i) => {
          const s = id != null ? byId.get(id) : null;
          const state = checked ? (id === solution[i] ? 'ok' : 'ko') : '';
          return (
            <li key={i} className={`pyramid-slot ${state}`} style={{ ['--w' as string]: `${62 + i * 9.5}%` }}>
              <button onClick={() => unplace(i)} disabled={!s || checked} aria-label={s ? `Quitar ${s.title} del puesto ${i + 1}` : `Puesto ${i + 1}`}>
                <span className="pyramid-pos">{i + 1}</span>
                {s ? (
                  <span className="pyramid-song">
                    <strong>{s.title}</strong>
                    <span>{s.artist}</span>
                  </span>
                ) : (
                  <span className="muted small">{i === 0 ? 'La más escuchada' : i === PYRAMID_SIZE - 1 ? 'La menos' : ''}</span>
                )}
              </button>
              {checked && s && <span className="pyramid-rank">{fmtInt(s.rank)}</span>}
            </li>
          );
        })}
      </ol>
      {!checked && (
        <div className="pyramid-pool">
          {songs.map((s) => (
            <button key={s.id} className="pyramid-card" onClick={() => place(s.id)} disabled={placed.has(s.id)}>
              <SafeImg src={s.cover} alt="" width={44} height={44} />
              <span className="pyramid-song">
                <strong>{s.title}</strong>
                <span>
                  {s.artist} · {s.year}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
      {!checked && (
        <button className="btn-primary" onClick={check} disabled={!full}>
          Comprobar
        </button>
      )}
      {checked && (
        <p className="muted small center">
          Orden correcto: {solution.map((id) => byId.get(id)!.title).join(' › ')}
        </p>
      )}
    </>
  );
}

/** Para la pantalla de inicio: ¿ya has hecho el reto de hoy? */
export const puzzleDoneToday = dailyDone;
