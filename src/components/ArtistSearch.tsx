import { useEffect, useId, useState, type KeyboardEvent } from 'react';
import { searchArtists, type DzArtist } from '../api/deezer';
import { GENRES } from '../game/catalog';
import type { ArtistRef } from '../game/types';
import { fmtFans } from '../lib/util';
import { Icon } from './Icon';
import { SafeImg } from './SafeImg';

const catalogGenre = new Map(GENRES.flatMap((g) => g.artists.map((a) => [a.id, g.id] as const)));

export function ArtistSearch({ onPick, placeholder }: { onPick: (a: ArtistRef) => void; placeholder?: string }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<DzArtist[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(-1);
  const [failed, setFailed] = useState(false);
  const listId = useId();

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setResults([]);
      setLoading(false);
      setFailed(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(() => {
      searchArtists(term)
        .then((r) => {
          if (cancelled) return;
          // Fuera perfiles sin fans (homónimos falsos, subidas de terceros)
          setResults(r.filter((a) => a.nb_fan > 0).slice(0, 6));
          setFailed(false);
          setOpen(true);
          setActive(-1);
        })
        .catch(() => {
          if (cancelled) return;
          setResults([]);
          setFailed(true);
        })
        .finally(() => !cancelled && setLoading(false));
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q]);

  const choose = (a: DzArtist) => {
    onPick({ id: a.id, name: a.name, picture: a.picture_medium, genreId: catalogGenre.get(a.id) });
    setQ('');
    setResults([]);
    setOpen(false);
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!results.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((i) => (i + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (i <= 0 ? results.length - 1 : i - 1));
    } else if (e.key === 'Enter' && open) {
      e.preventDefault();
      choose(results[Math.max(0, active)]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const showList = open && q.trim().length >= 2;

  return (
    <div className="search">
      <label className="field search-field">
        <Icon name="search" />
        <span className="sr-only">Buscar artista</span>
        <input
          type="search"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          placeholder={placeholder ?? 'Busca uno o varios artistas: Clarent, Bad Bunny…'}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onKeyDown={onKey}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          autoComplete="off"
          spellCheck={false}
        />
        {loading && <span className="spinner" aria-hidden="true" />}
      </label>
      {showList && (
        <ul className="search-list" id={listId} role="listbox">
          {!loading && !results.length && (
            <li className="search-empty">{failed ? 'No hay conexión con Deezer. Inténtalo de nuevo.' : 'Sin resultados'}</li>
          )}
          {results.map((a, i) => (
            <li
              key={a.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={i === active ? 'search-item active' : 'search-item'}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(a);
              }}
            >
              <SafeImg src={a.picture_medium} alt="" width={40} height={40} loading="lazy" />
              <span className="search-name">{a.name}</span>
              <span className="search-fans">{fmtFans(a.nb_fan)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
