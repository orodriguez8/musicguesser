import { normText, similarity } from '../game/text';
import { sleep } from '../lib/util';

// MusicBrainz conoce la fecha del PRIMER lanzamiento de cada grabación (Deezer solo la de la
// edición que tiene, a menudo una reedición). Admite CORS, pero pide máximo 1 petición por segundo.
const BASE = 'https://musicbrainz.org/ws/2';

interface MbRecording {
  score: number;
  title: string;
  'first-release-date'?: string;
  'artist-credit'?: Array<{ name: string }>;
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

const esc = (s: string) => s.replace(/[\\"]/g, '\\$&');

function sameArtist(a: string, b: string): boolean {
  const x = normText(a);
  const y = normText(b);
  return x === y || x.includes(y) || y.includes(x) || similarity(x, y) >= 0.8;
}

const cache = new Map<string, Promise<number | null>>();

async function lookup(artist: string, title: string): Promise<number | null> {
  // Fuera directos: los temas famosos tienen decenas y tapan la grabación de estudio
  const query = `recording:"${esc(title)}" AND artist:"${esc(artist)}" AND NOT comment:live`;
  for (let attempt = 0; attempt < 3; attempt++) {
    await slot();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      const r = await fetch(`${BASE}/recording?query=${encodeURIComponent(query)}&fmt=json&limit=100`, { signal: ctrl.signal });
      if (r.status === 503) {
        await sleep(1500);
        continue;
      }
      if (!r.ok) return null;
      const data = (await r.json()) as { recordings?: MbRecording[] };
      const t = normText(title);
      const years = (data.recordings ?? [])
        .filter((rec) => rec.score >= 90 && similarity(normText(rec.title), t) >= 0.9)
        .filter((rec) => rec['artist-credit']?.some((a) => sameArtist(a.name, artist)))
        .map((rec) => Number(rec['first-release-date']?.slice(0, 4)))
        .filter((y) => y >= 1900);
      return years.length ? Math.min(...years) : null;
    } catch {
      /* reintento */
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

export function firstReleaseYear(artist: string, title: string): Promise<number | null> {
  const key = `${normText(artist)}|${normText(title)}`;
  let p = cache.get(key);
  if (!p) {
    p = lookup(artist, title);
    cache.set(key, p);
  }
  return p;
}
