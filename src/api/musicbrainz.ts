import { normText, similarity } from '../game/text';
import type { ArtistKind } from '../game/types';
import { load, save } from '../lib/storage';
import { sleep } from '../lib/util';

// MusicBrainz conoce la fecha del PRIMER lanzamiento de cada grabación (Deezer solo la de la
// edición que tiene, a menudo una reedición) y si un artista es grupo o solista.
// Admite CORS, pero pide máximo 1 petición por segundo y a veces responde 503 (ocupado).
const BASE = 'https://musicbrainz.org/ws/2';

interface MbRecording {
  score: number;
  title: string;
  'first-release-date'?: string;
  'artist-credit'?: Array<{ name: string }>;
}

interface MbArtist {
  score: number;
  name: string;
  type?: string;
}

let queue: Promise<void> = Promise.resolve();
let last = 0;

function slot(): Promise<void> {
  const p = queue.then(async () => {
    const wait = last + 1100 - Date.now();
    if (wait > 0) await sleep(wait);
    last = Date.now();
  });
  queue = p.catch(() => {});
  return p;
}

// Cortocircuito: si MusicBrainz falla varias veces seguidas, lo dejamos en paz un rato
// en vez de alargar la carga de la partida (se usa el año de Deezer como respaldo).
let consecutiveFailures = 0;
let disabledUntil = 0;
const available = () => Date.now() >= disabledUntil;

function markFailure() {
  consecutiveFailures++;
  if (consecutiveFailures >= 2) {
    disabledUntil = Date.now() + 5 * 60 * 1000;
    consecutiveFailures = 0;
  }
}

/** Petición con cola, reintentos y cortocircuito. null = no disponible. */
async function mbFetch<T>(path: string): Promise<T | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (!available()) return null;
    await slot();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    try {
      const r = await fetch(`${BASE}${path}`, { signal: ctrl.signal });
      if (r.ok) {
        consecutiveFailures = 0;
        return (await r.json()) as T;
      }
      if (r.status !== 503) return null;
    } catch {
      /* reintento */
    } finally {
      clearTimeout(timer);
    }
    await sleep(1500);
  }
  markFailure();
  return null;
}

const esc = (s: string) => s.replace(/[\\"]/g, '\\$&');

function sameArtist(a: string, b: string): boolean {
  const x = normText(a);
  const y = normText(b);
  return x === y || x.includes(y) || y.includes(x) || similarity(x, y) >= 0.8;
}

const yearCache = new Map<string, Promise<number | null>>();

async function lookupYear(artist: string, title: string): Promise<number | null> {
  // Fuera directos: los temas famosos tienen decenas y tapan la grabación de estudio
  const query = `recording:"${esc(title)}" AND artist:"${esc(artist)}" AND NOT comment:live`;
  const data = await mbFetch<{ recordings?: MbRecording[] }>(
    `/recording?query=${encodeURIComponent(query)}&fmt=json&limit=100`,
  );
  if (!data) return null;
  const t = normText(title);
  const years = (data.recordings ?? [])
    .filter((rec) => rec.score >= 90 && similarity(normText(rec.title), t) >= 0.9)
    .filter((rec) => rec['artist-credit']?.some((a) => sameArtist(a.name, artist)))
    .map((rec) => Number(rec['first-release-date']?.slice(0, 4)))
    .filter((y) => y >= 1900);
  return years.length ? Math.min(...years) : null;
}

export function firstReleaseYear(artist: string, title: string): Promise<number | null> {
  const key = `${normText(artist)}|${normText(title)}`;
  let p = yearCache.get(key);
  if (!p) {
    p = lookupYear(artist, title);
    yearCache.set(key, p);
  }
  return p;
}

// Tipos de artista ya consultados (persisten entre visitas: no cambian)
const typeCache = load<Record<string, ArtistKind | 'unknown'>>('artist-types', {});

/** ¿Grupo o solista? Para artistas fuera del catálogo (búsqueda libre y "artistas parecidos"). */
export async function artistType(name: string): Promise<ArtistKind | undefined> {
  const key = normText(name);
  const cached = typeCache[key];
  if (cached) return cached === 'unknown' ? undefined : cached;
  const data = await mbFetch<{ artists?: MbArtist[] }>(
    `/artist?query=${encodeURIComponent(`artist:"${esc(name)}"`)}&fmt=json&limit=5`,
  );
  if (!data) return undefined;
  const hit = (data.artists ?? []).find((a) => a.score >= 85 && normText(a.name) === key && a.type);
  const kind: ArtistKind | 'unknown' =
    hit?.type === 'Person' ? 'person' : hit && ['Group', 'Orchestra', 'Choir'].includes(hit.type!) ? 'group' : 'unknown';
  typeCache[key] = kind;
  save('artist-types', typeCache);
  return kind === 'unknown' ? undefined : kind;
}
