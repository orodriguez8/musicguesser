import { useEffect, useState } from 'react';
import { fetchLeaderboard, fetchMyRank, type BoardRow, type Period } from '../api/ranking';
import { Avatar } from '../components/Avatar';
import { Icon } from '../components/Icon';
import { GENRES } from '../game/catalog';
import { MODES, modeTitle } from '../game/modes';
import type { PlayMode } from '../game/types';
import { LEVELS, URBANO_GENRES, type Level } from '../game/urbano';
import { fmtInt } from '../lib/util';

interface Props {
  myId: string | null;
  onBack: () => void;
}

const MODE_TABS: PlayMode[] = ['mezcla', ...MODES.map((m) => m.id)];

export function Ranking({ myId, onBack }: Props) {
  const [period, setPeriod] = useState<Period>('semana');
  const [mode, setMode] = useState<PlayMode>('mezcla');
  const [genre, setGenre] = useState('todos');
  const [levelPick, setLevel] = useState<Level>('normal');
  // La dificultad solo existe en el urbano (y en el general, que lo incluye)
  const hasLevels = genre === 'todos' || URBANO_GENRES.has(genre);
  const level = hasLevels ? levelPick : 'normal';
  const [rows, setRows] = useState<BoardRow[] | null>(null);
  const [mine, setMine] = useState<{ pos: number; score: number } | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setRows(null);
    setError(false);
    Promise.all([fetchLeaderboard(mode, genre, period, level), myId ? fetchMyRank(mode, genre, period, level) : Promise.resolve(null)])
      .then(([r, m]) => {
        if (!alive) return;
        setRows(r);
        setMine(m);
      })
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, [mode, genre, period, level, myId, attempt]);

  const meInList = rows?.some((r) => r.user_id === myId);

  return (
    <main className="screen ranking">
      <header className="game-head">
        <button className="btn-square" onClick={onBack} aria-label="Volver al inicio">
          <Icon name="back" size={20} />
        </button>
        <div className="game-title">
          <span className="game-mode">Ranking</span>
          <span className="game-sub">{modeTitle(mode)}</span>
        </div>
        <span className="head-spacer" />
      </header>

      <div className="segmented" role="tablist" aria-label="Periodo">
        <button role="tab" aria-selected={period === 'semana'} className={period === 'semana' ? 'on' : ''} onClick={() => setPeriod('semana')}>
          Esta semana
        </button>
        <button role="tab" aria-selected={period === 'siempre'} className={period === 'siempre' ? 'on' : ''} onClick={() => setPeriod('siempre')}>
          Siempre
        </button>
      </div>

      <div className="chips" role="tablist" aria-label="Modo">
        {MODE_TABS.map((m) => (
          <button key={m} className={m === mode ? 'chip on' : 'chip'} aria-pressed={m === mode} onClick={() => setMode(m)}>
            {modeTitle(m)}
          </button>
        ))}
      </div>
      <div className="chips" role="tablist" aria-label="Género">
        <button className={genre === 'todos' ? 'chip on' : 'chip'} aria-pressed={genre === 'todos'} onClick={() => setGenre('todos')}>
          General
        </button>
        {GENRES.map((g) => (
          <button key={g.id} className={genre === g.id ? 'chip on' : 'chip'} aria-pressed={genre === g.id} onClick={() => setGenre(g.id)}>
            {g.label}
          </button>
        ))}
      </div>
      {hasLevels && (
        <div className="segmented seg-3" role="tablist" aria-label="Dificultad">
          {LEVELS.map((l) => (
            <button key={l.id} role="tab" aria-selected={level === l.id} className={level === l.id ? 'on' : ''} onClick={() => setLevel(l.id)}>
              {l.label}
            </button>
          ))}
        </div>
      )}

      {mine && !meInList && (
        <div className="my-rank">
          <Icon name="user" />
          Tu puesto: <strong>#{mine.pos}</strong> · {fmtInt(mine.score)} pts
        </div>
      )}

      {error && (
        <section className="stage state-card">
          <p className="state-title">No se ha podido cargar</p>
          <button className="btn-primary" onClick={() => setAttempt((a) => a + 1)}>
            <Icon name="replay" /> Reintentar
          </button>
        </section>
      )}

      {!error && rows == null && (
        <ol className="board" aria-busy="true">
          {Array.from({ length: 6 }, (_, i) => (
            <li key={i} className="board-row skeleton" />
          ))}
        </ol>
      )}

      {!error && rows?.length === 0 && (
        <section className="stage state-card">
          <Icon name="podium" size={40} />
          <p className="state-title">Aún no ha puntuado nadie aquí</p>
          <p className="muted center">Juega una partida completa y estrena este ranking.</p>
        </section>
      )}

      {!error && rows && rows.length > 0 && (
        <ol className="board">
          {rows.map((r) => (
            <li key={r.user_id} className={`board-row ${r.user_id === myId ? 'me' : ''} ${r.pos <= 3 ? `top${r.pos}` : ''}`}>
              <span className="board-pos">{r.pos}</span>
              <Avatar id={r.avatar} name={r.username} size={38} />
              <span className="board-name">
                <strong>{r.username}</strong>
                <span>{r.correct}/10 aciertos</span>
              </span>
              <span className="board-score">{fmtInt(r.score)}</span>
            </li>
          ))}
        </ol>
      )}

      <p className="muted small center">
        Cuenta la mejor partida de cada jugador. Las partidas con un artista concreto no puntúan.
      </p>
    </main>
  );
}
