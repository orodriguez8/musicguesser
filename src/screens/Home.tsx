import type { Profile } from '../auth/auth';
import { ArtistSearch } from '../components/ArtistSearch';
import { dailyDone, loadStats, type PuzzleId } from '../game/daily';
import { PUZZLES } from './Puzzle';
import { Avatar } from '../components/Avatar';
import { Icon } from '../components/Icon';
import { Logo } from '../components/Logo';
import { filterLabel, GENRES } from '../game/catalog';
import { MODES } from '../game/modes';
import { MAX_ARTISTS, type ArtistRef, type Filter, type PlayMode } from '../game/types';
import { ERAS, isUrbanoFilter, LEVELS, type Era, type Level } from '../game/urbano';
import { fmtInt } from '../lib/util';
import type { Records } from '../settings';

interface Props {
  filter: Filter;
  onFilter: (f: Filter) => void;
  records: Records;
  onPlay: (mode: PlayMode) => void;
  onPuzzle: (id: PuzzleId) => void;
  /** Salas en directo (solo con el modo online configurado) */
  onOnline?: () => void;
  onOpenSettings: () => void;
  onOpenRecords: () => void;
  /** Solo existe si hay ranking online configurado. */
  onOpenRanking?: () => void;
  /** Botón de cuenta (solo con cuentas online configuradas). */
  account?: { profile: Profile | null; onClick: () => void };
}

export function Home({ filter, onFilter, records, onPlay, onPuzzle, onOnline, onOpenSettings, onOpenRecords, onOpenRanking, account }: Props) {
  const genres = filter.kind === 'genres' ? filter.genres : [];
  const artistMode = filter.kind === 'artist';
  const chosen = filter.kind === 'artist' ? filter.artists : [];

  const addArtist = (a: ArtistRef) => {
    if (chosen.some((x) => x.id === a.id) || chosen.length >= MAX_ARTISTS) return;
    onFilter({ kind: 'artist', artists: [...chosen, a] });
  };
  const removeArtist = (id: number) => {
    const rest = chosen.filter((a) => a.id !== id);
    onFilter(rest.length ? { kind: 'artist', artists: rest } : { kind: 'genres', genres: [] });
  };

  // Época y dificultad se recuerdan aunque cambies de géneros
  const era = filter.kind === 'genres' ? filter.era : undefined;
  const level = filter.kind === 'genres' ? (filter.level ?? 'normal') : 'normal';
  const urbano = isUrbanoFilter(filter);
  // El infiltrado y AlbumLink solo existen con urbano
  const modes = MODES.filter((m) => !m.urbanoOnly || urbano);

  const toggleGenre = (id: string) => {
    const next = genres.includes(id) ? genres.filter((g) => g !== id) : [...genres, id];
    onFilter({ kind: 'genres', genres: next, era, level });
  };
  const setUrbano = (patch: { era?: Era | undefined; level?: Level }) => {
    if (filter.kind === 'genres') onFilter({ ...filter, ...patch });
  };

  return (
    <main className="screen home">
      <header className="home-head">
        <Logo />
        <div className="head-actions">
          {/* Con ranking online, "mis récords" pasa a Ajustes para no saturar la cabecera en móvil */}
          {onOpenRanking ? (
            <button className="btn-square" onClick={onOpenRanking} aria-label="Ranking">
              <Icon name="podium" size={20} />
            </button>
          ) : (
            <button className="btn-square" onClick={onOpenRecords} aria-label="Récords">
              <Icon name="trophy" size={20} />
            </button>
          )}
          <button className="btn-square" onClick={onOpenSettings} aria-label="Ajustes">
            <Icon name="settings" size={20} />
          </button>
          {account &&
            (account.profile ? (
              <button className="account-btn" onClick={account.onClick} aria-label={`Tu cuenta: ${account.profile.username}`}>
                <Avatar id={account.profile.avatar} name={account.profile.username} size={36} />
              </button>
            ) : (
              <button className="btn-enter" onClick={account.onClick} aria-label="Entrar">
                <Icon name="user" size={18} />
                <span className="btn-enter-text">Entrar</span>
              </button>
            ))}
        </div>
      </header>

      <section className="hero">
        <div className="hero-text">
          <span className="eyebrow accent">Partida rápida</span>
          <h1>
            10 pruebas de
            <br />
            {chosen.length === 1
              ? chosen[0].name
              : chosen.length
                ? `${chosen.length} artistas`
                : genres.length
                  ? 'tus géneros'
                  : 'todo un poco'}
          </h1>
          <span className="hero-sub">{filterLabel(filter)} · todos los minijuegos</span>
        </div>
        <button className="hero-play" onClick={() => onPlay('mezcla')} aria-label="Jugar una partida rápida">
          <Icon name="play" size={30} />
        </button>
      </section>

      {onOnline && (
        <button className="online-cta" onClick={onOnline}>
          <span className="mode-icon">
            <Icon name="users" size={18} />
          </span>
          <span>
            <strong>Jugar con amigos</strong>
            <span className="muted small">Crea una sala y competid en directo</span>
          </span>
          <Icon name="next" size={18} />
        </button>
      )}

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
          <div className="artist-pills">
            {chosen.map((a) => (
              <div className="artist-pill" key={a.id}>
                <img src={a.picture} alt="" width={36} height={36} />
                <span>
                  {chosen.length === 1 && 'Jugando con '}
                  <strong>{a.name}</strong>
                </span>
                <button className="btn-square sm" onClick={() => removeArtist(a.id)} aria-label={`Quitar a ${a.name}`}>
                  <Icon name="x" size={16} />
                </button>
              </div>
            ))}
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
        {urbano && (
          <div className="urbano-opts">
            <div className="opt-row">
              <span className="opt-label">Época</span>
              <div className="segmented seg-4" role="radiogroup" aria-label="Época">
                {[{ id: undefined, label: 'Todas' }, ...ERAS].map((e) => (
                  <button
                    key={e.id ?? 'todas'}
                    role="radio"
                    aria-checked={era === e.id}
                    className={era === e.id ? 'on' : ''}
                    onClick={() => setUrbano({ era: e.id })}
                  >
                    {e.id === 'vieja' ? 'Vieja' : e.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="opt-row">
              <span className="opt-label">Dificultad</span>
              <div className="segmented seg-3" role="radiogroup" aria-label="Dificultad">
                {LEVELS.map((l) => (
                  <button
                    key={l.id}
                    role="radio"
                    aria-checked={level === l.id}
                    className={level === l.id ? 'on' : ''}
                    onClick={() => setUrbano({ level: l.id })}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            </div>
            <p className="muted small opt-hint">{LEVELS.find((l) => l.id === level)?.desc}</p>
          </div>
        )}
        {chosen.length < MAX_ARTISTS ? (
          <ArtistSearch
            onPick={addArtist}
            placeholder={chosen.length ? `Añade otro artista (hasta ${MAX_ARTISTS})` : undefined}
          />
        ) : (
          <p className="muted small">Máximo {MAX_ARTISTS} artistas. Quita alguno para añadir otro.</p>
        )}
      </section>

      <section className="block">
        <div className="block-head">
          <h2>Minijuegos</h2>
          <span className="muted">{modes.length} modos · 10 pruebas</span>
        </div>
        <div className="modes">
          {modes.map((m) => {
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

      {/* Puzles del urbano: con géneros urbanos o sin filtro (que también incluye el urbano) */}
      {(urbano || (!artistMode && !genres.length)) && (
        <section className="block">
          <div className="block-head">
            <h2>Retos urbanos</h2>
            <span className="muted">Uno nuevo cada día</span>
          </div>
          <div className="modes">
            {PUZZLES.map((p) => {
              const done = dailyDone(p.id);
              const streak = loadStats(p.id).streak;
              return (
                <button key={p.id} className="mode-card tone-cyan puzzle-card" onClick={() => onPuzzle(p.id)}>
                  <span className="mode-icon">
                    <Icon name={p.icon} size={18} />
                  </span>
                  <span className="mode-title">{p.title}</span>
                  <span className="mode-desc">{p.desc}</span>
                  {(done || streak > 0) && (
                    <span className="mode-record">
                      {done && <Icon name="check" size={12} />}
                      {done ? 'Hecho hoy' : ''}
                      {streak > 0 && (
                        <>
                          {' '}
                          <Icon name="flame" size={12} /> {streak}
                        </>
                      )}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </section>
      )}

      <footer className="footer">
        Fragmentos de 30 s de{' '}
        <a href="https://www.deezer.com" target="_blank" rel="noreferrer">
          Deezer
        </a>{' '}
        · Letras de{' '}
        <a href="https://lrclib.net" target="_blank" rel="noreferrer">
          LRCLIB
        </a>{' '}
        · Proyecto sin ánimo de lucro ·{' '}
        <a href="privacidad.html">Privacidad</a> · <a href="condiciones.html">Condiciones</a>
      </footer>
      <span className="credit">made by Raksoda</span>
    </main>
  );
}
