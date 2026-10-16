import { ArtistSearch } from '../components/ArtistSearch';
import { Icon } from '../components/Icon';
import { Logo } from '../components/Logo';
import { filterLabel, GENRES } from '../game/catalog';
import { MODES } from '../game/modes';
import type { Filter, PlayMode } from '../game/types';
import { fmtInt } from '../lib/util';
import type { Records } from '../settings';

interface Props {
  filter: Filter;
  onFilter: (f: Filter) => void;
  records: Records;
  onPlay: (mode: PlayMode) => void;
  onOpenSettings: () => void;
  onOpenRecords: () => void;
  /** Solo existe si hay ranking online configurado. */
  onOpenRanking?: () => void;
}

export function Home({ filter, onFilter, records, onPlay, onOpenSettings, onOpenRecords, onOpenRanking }: Props) {
  const genres = filter.kind === 'genres' ? filter.genres : [];
  const artistMode = filter.kind === 'artist';

  const toggleGenre = (id: string) => {
    const next = genres.includes(id) ? genres.filter((g) => g !== id) : [...genres, id];
    onFilter({ kind: 'genres', genres: next });
  };

  return (
    <main className="screen home">
      <header className="home-head">
        <Logo />
        <div className="head-actions">
          {onOpenRanking && (
            <button className="btn-square" onClick={onOpenRanking} aria-label="Ranking">
              <Icon name="podium" size={20} />
            </button>
          )}
          <button className="btn-square" onClick={onOpenRecords} aria-label="Récords">
            <Icon name="trophy" size={20} />
          </button>
          <button className="btn-square" onClick={onOpenSettings} aria-label="Ajustes">
            <Icon name="settings" size={20} />
          </button>
        </div>
      </header>

      <section className="hero">
        <div className="hero-text">
          <span className="eyebrow accent">Partida rápida</span>
          <h1>
            10 pruebas de
            <br />
            {artistMode ? filter.artist.name : genres.length ? 'tus géneros' : 'todo un poco'}
          </h1>
          <span className="hero-sub">{filterLabel(filter)} · todos los minijuegos</span>
        </div>
        <button className="hero-play" onClick={() => onPlay('mezcla')} aria-label="Jugar una partida rápida">
          <Icon name="play" size={30} />
        </button>
      </section>

      <section className="block">
        <div className="block-head">
          <h2>Géneros</h2>
          {genres.length > 0 && (
            <button className="link" onClick={() => onFilter({ kind: 'genres', genres: [] })}>
              Quitar filtros
            </button>
          )}
        </div>
        {artistMode && (
          <div className="artist-pill">
            <img src={filter.artist.picture} alt="" width={36} height={36} />
            <span>
              Jugando con <strong>{filter.artist.name}</strong>
            </span>
            <button className="btn-square sm" onClick={() => onFilter({ kind: 'genres', genres: [] })} aria-label="Quitar artista">
              <Icon name="x" size={16} />
            </button>
          </div>
        )}
        <div className={artistMode ? 'chips faded' : 'chips'}>
          <button
            className={!artistMode && !genres.length ? 'chip on' : 'chip'}
            aria-pressed={!artistMode && !genres.length}
            onClick={() => onFilter({ kind: 'genres', genres: [] })}
          >
            Todos
          </button>
          {GENRES.map((g) => {
            const on = !artistMode && genres.includes(g.id);
            return (
              <button key={g.id} className={on ? 'chip on' : 'chip'} aria-pressed={on} onClick={() => toggleGenre(g.id)}>
                {on && <Icon name="check" size={16} />}
                {g.label}
              </button>
            );
          })}
        </div>
        <ArtistSearch onPick={(a) => onFilter({ kind: 'artist', artist: a })} />
      </section>

      <section className="block">
        <div className="block-head">
          <h2>Minijuegos</h2>
          <span className="muted">8 modos · 10 pruebas</span>
        </div>
        <div className="modes">
          {MODES.map((m) => {
            const disabled = !!m.genresOnly && artistMode;
            const rec = records[m.id];
            return (
              <button key={m.id} className={`mode-card tone-${m.tone}`} onClick={() => onPlay(m.id)} disabled={disabled}>
                <span className="mode-icon">
                  <Icon name={m.icon} size={18} />
                </span>
                <span className="mode-title">{m.title}</span>
                <span className="mode-desc">{disabled ? 'Necesita géneros, no un artista' : m.desc}</span>
                {rec && (
                  <span className="mode-record">
                    <Icon name="trophy" size={12} /> {fmtInt(rec.score)}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </section>

      <footer className="footer">
        Fragmentos de 30 s de{' '}
        <a href="https://www.deezer.com" target="_blank" rel="noreferrer">
          Deezer
        </a>{' '}
        · Letras de{' '}
        <a href="https://lrclib.net" target="_blank" rel="noreferrer">
          LRCLIB
        </a>{' '}
        · Proyecto sin ánimo de lucro
      </footer>
      <span className="credit">made by Raksoda</span>
    </main>
  );
}
