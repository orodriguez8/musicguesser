import { useEffect, useState } from 'react';
import { Avatar } from '../components/Avatar';
import { Icon } from '../components/Icon';
import { modeTitle } from '../game/modes';
import type { Question, Summary } from '../game/types';
import { fmtInt } from '../lib/util';
import { challengeBoard, getChallenge, saveChallengeResult, type BoardEntry, type Challenge as Reto } from '../online/challenges';
import { unpackGame } from '../online/pack';
import type { Settings } from '../settings';
import { Game } from './Game';
import { logGame } from '../api/telemetry';

interface Props {
  id: string;
  settings: Settings;
  loggedIn: boolean;
  onBack: () => void;
  onLogin: () => void;
}

type Phase =
  | { k: 'loading' }
  | { k: 'missing' }
  | { k: 'error' }
  | { k: 'intro'; reto: Reto }
  | { k: 'preparing'; reto: Reto }
  | { k: 'play'; reto: Reto; questions: Question[] }
  | { k: 'done'; reto: Reto; summary: Summary; saved: boolean };

export function Challenge({ id, settings, loggedIn, onBack, onLogin }: Props) {
  const [phase, setPhase] = useState<Phase>({ k: 'loading' });
  const [board, setBoard] = useState<BoardEntry[]>([]);

  useEffect(() => {
    getChallenge(id)
      .then((reto) => setPhase(reto ? { k: 'intro', reto } : { k: 'missing' }))
      .catch(() => setPhase({ k: 'error' }));
    challengeBoard(id).then(setBoard);
  }, [id]);

  const accept = async (reto: Reto) => {
    setPhase({ k: 'preparing', reto });
    // Los enlaces de audio de Deezer caducan: se renuevan antes de jugar
    const questions = await unpackGame(reto.game, { refreshAudio: true });
    setPhase({ k: 'play', reto, questions });
  };

  const finish = async (reto: Reto, summary: Summary) => {
    logGame('challenge', summary, null, reto.id);
    setPhase({ k: 'done', reto, summary, saved: false });
    window.scrollTo(0, 0);
    const saved = await saveChallengeResult(reto.id, summary.score, summary.correct).catch(() => false);
    setPhase({ k: 'done', reto, summary, saved });
    challengeBoard(reto.id).then(setBoard);
  };

  if (phase.k === 'play')
    return (
      <Game
        mode={phase.reto.game.mode}
        filter={{ kind: 'genres', genres: [] }}
        label={phase.reto.game.label}
        preset={phase.questions}
        settings={settings}
        onExit={onBack}
        onFinish={(s) => finish(phase.reto, s)}
      />
    );

  return (
    <main className="screen challenge">
      <header className="game-head">
        <button className="btn-square" onClick={onBack} aria-label="Volver al inicio">
          <Icon name="back" size={20} />
        </button>
        <div className="game-title">
          <span className="game-mode">Reto</span>
          <span className="game-sub">{id}</span>
        </div>
        <span className="head-spacer" />
      </header>

      {phase.k === 'loading' && (
        <section className="stage state-card">
          <p className="state-title">Cargando el reto…</p>
        </section>
      )}
      {(phase.k === 'missing' || phase.k === 'error') && (
        <section className="stage state-card">
          <p className="state-title">{phase.k === 'missing' ? 'Este reto no existe' : 'No se ha podido cargar'}</p>
          <p className="muted center">{phase.k === 'missing' ? 'Revisa el enlace que te han pasado.' : 'Revisa tu conexión y vuelve a intentarlo.'}</p>
          <button className="btn-ghost" onClick={onBack}>
            Ir al inicio
          </button>
        </section>
      )}

      {(phase.k === 'intro' || phase.k === 'preparing') && (
        <section className="stage online-card">
          <Avatar id={phase.reto.creatorAvatar} name={phase.reto.creatorName} size={56} />
          <p className="state-title center">{phase.reto.creatorName} te reta</p>
          <p className="muted center">
            {modeTitle(phase.reto.game.mode)} · {phase.reto.game.label}
          </p>
          <span className="room-code">{fmtInt(phase.reto.creatorScore)}</span>
          <span className="muted small">
            puntos · {phase.reto.creatorCorrect}/10 aciertos
          </span>
          <button className="btn-primary big" onClick={() => accept(phase.reto)} disabled={phase.k === 'preparing'}>
            <Icon name="play" /> {phase.k === 'preparing' ? 'Preparando…' : 'Aceptar el reto'}
          </button>
          {!loggedIn && (
            <p className="muted small center">
              Puedes jugar sin cuenta, pero solo con cuenta apareces en la clasificación del reto.{' '}
              <button className="link" onClick={onLogin}>
                Entrar
              </button>
            </p>
          )}
        </section>
      )}

      {phase.k === 'done' && (
        <section className={phase.summary.score >= phase.reto.creatorScore ? 'stage online-card win' : 'stage online-card'}>
          <p className="state-title center">
            {phase.summary.score > phase.reto.creatorScore
              ? `¡Le has ganado a ${phase.reto.creatorName}!`
              : phase.summary.score === phase.reto.creatorScore
                ? 'Empate'
                : `${phase.reto.creatorName} gana esta vez`}
          </p>
          <div className="versus">
            <span>
              <strong>{fmtInt(phase.summary.score)}</strong>
              Tú
            </span>
            <span className="muted">vs</span>
            <span>
              <strong>{fmtInt(phase.reto.creatorScore)}</strong>
              {phase.reto.creatorName}
            </span>
          </div>
          {!loggedIn && <p className="muted small center">Tu resultado no se guarda porque no has entrado con tu cuenta.</p>}
          <button className="btn-ghost" onClick={onBack}>
            Ir al inicio
          </button>
        </section>
      )}

      {board.length > 0 && phase.k !== 'loading' && (
        <section className="block">
          <div className="block-head">
            <h2>Clasificación del reto</h2>
          </div>
          <ol className="scoreboard podium">
            {board.map((b, i) => (
              <li key={`${b.username}-${i}`}>
                <span className="sb-pos">{i + 1}</span>
                <Avatar id={b.avatar} name={b.username} size={32} />
                <span className="sb-name">
                  {b.username}
                  {b.is_creator && <span className="muted small"> · creó el reto</span>}
                </span>
                <span className="sb-score">{fmtInt(b.score)}</span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </main>
  );
}
