import { useEffect, useRef, useState } from 'react';
import { rankingGenre, submitScore, type SubmitResult } from '../api/ranking';
import type { Filter, Summary } from '../game/types';
import { onlineEnabled } from '../lib/supabase';
import { Icon } from './Icon';

interface Props {
  summary: Summary;
  filter: Filter;
  loggedIn: boolean;
  onLogin?: () => void;
  onOpenRanking?: () => void;
}

/** En la pantalla final: sube la partida al ranking (una sola vez) y cuenta qué ha pasado. */
export function RankingStatus({ summary, filter, loggedIn, onLogin, onOpenRanking }: Props) {
  const [result, setResult] = useState<SubmitResult | 'sending' | null>(null);
  const sent = useRef(false);
  const eligible = rankingGenre(summary.mode, filter) != null && summary.results.length === 10;

  useEffect(() => {
    if (!onlineEnabled || !loggedIn || !eligible || sent.current) return;
    sent.current = true;
    setResult('sending');
    submitScore(summary, filter).then(setResult);
  }, [loggedIn, eligible, summary, filter]);

  if (!onlineEnabled) return null;

  if (!eligible) {
    return (
      <p className="rank-status muted">
        <Icon name="podium" /> {filter.kind === 'artist' ? 'Las partidas con artistas concretos no puntúan en el ranking.' : 'Solo puntúan las partidas de 10 pruebas.'}
      </p>
    );
  }

  if (!loggedIn) {
    return (
      <div className="rank-status">
        <Icon name="podium" />
        <span>Entra con tu cuenta para aparecer en el ranking.</span>
        {onLogin && (
          <button className="btn-chip" onClick={onLogin}>
            Entrar
          </button>
        )}
      </div>
    );
  }

  if (result === 'sending' || result == null) {
    return (
      <p className="rank-status muted">
        <span className="spinner" aria-hidden="true" /> Subiendo al ranking…
      </p>
    );
  }

  if (result.ok) {
    return (
      <div className="rank-status ok" role="status">
        <Icon name="podium" />
        <span>{result.weekPos ? `Guardada · vas #${result.weekPos} esta semana` : 'Guardada en el ranking'}</span>
        {onOpenRanking && (
          <button className="btn-chip" onClick={onOpenRanking}>
            Ver ranking
          </button>
        )}
      </div>
    );
  }

  return (
    <p className={result.reason === 'queued' ? 'rank-status muted' : 'rank-status ko'} role="status">
      <Icon name="podium" /> {result.message}
    </p>
  );
}
