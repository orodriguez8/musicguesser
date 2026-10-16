import type { Track } from '../game/types';
import { normText, similarity } from '../game/text';
import { sleep } from '../lib/util';

// LRCLIB: letras gratuitas y abiertas, con CORS. A veces responde 503 (saturado): reintentamos.
const BASE = 'https://lrclib.net/api';

interface LrcRecord {
  trackName: string;
  artistName: string;
  duration?: number;
  instrumental?: boolean;
  plainLyrics?: string | null;
  syncedLyrics?: string | null;
}

const cache = new Map<number, Promise<string[] | null>>();

// LRCLIB corta con 429 a partir de ~8 peticiones seguidas: como mucho 3 a la vez y algo espaciadas.
const MAX_ACTIVE = 3;
const MIN_GAP_MS = 180;
let active = 0;
let lastStart = 0;
const waiting: Array<() => void> = [];

function pump() {
  if (!waiting.length || active >= MAX_ACTIVE) return;
  const wait = lastStart + MIN_GAP_MS - Date.now();
  if (wait > 0) {
    setTimeout(pump, wait);
    return;
  }
  active++;
  lastStart = Date.now();
  waiting.shift()!();
  pump();
}

async function limited<T>(fn: () => Promise<T>): Promise<T> {
  await new Promise<void>((resolve) => {
    waiting.push(resolve);
    pump();
  });
  try {
    return await fn();
  } finally {
    active--;
    pump();
  }
}

async function fetchJson(url: string): Promise<unknown> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    let retryAfter = 800 * (attempt + 1);
    try {
      const r = await limited(() => fetch(url, { signal: ctrl.signal }));
      if (r.ok) return await r.json();
      if (r.status === 404) return null;
      // 429 / 503: nos dice cuántos segundos esperar
      const ra = Number(r.headers.get('retry-after'));
      if (ra > 0) retryAfter = ra * 1000 + 150;
    } catch {
      /* reintento */
    } finally {
      clearTimeout(timer);
    }
    await sleep(retryAfter);
  }
  return null;
}

export function cleanLyrics(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) =>
      l
        .replace(/\[[^\]]*\]/g, '')
        // Coros y ad-libs entre paréntesis: "(yeah)", "(x2)"…
        .replace(/\s*\([^)]*\)/g, '')
        .replace(/\b(?:x|×)\d+\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter((l) => l.length > 0 && !/^[\W_]+$/.test(l));
}

function sameArtist(a: string, b: string): boolean {
  const x = normText(a);
  const y = normText(b);
  return x.includes(y) || y.includes(x) || similarity(x, y) >= 0.7;
}

async function fetchLyrics(t: Track): Promise<string[] | null> {
  const params = new URLSearchParams({ artist_name: t.artistName, track_name: t.title });
  const found = await fetchJson(`${BASE}/search?${params}`);
  if (!Array.isArray(found)) return null;
  const candidates = (found as LrcRecord[])
    .filter((r) => sameArtist(r.artistName, t.artistName))
    .filter((r) => similarity(normText(r.trackName), normText(t.title)) >= 0.75)
    .sort((a, b) => Math.abs((a.duration ?? 0) - t.duration) - Math.abs((b.duration ?? 0) - t.duration));
  const rec = candidates.find((r) => r.instrumental || r.plainLyrics || r.syncedLyrics);
  if (!rec || rec.instrumental) return null;
  const text = rec.plainLyrics || (rec.syncedLyrics ?? '').replace(/\[\d+:\d+(?:\.\d+)?\]/g, '');
  const lines = cleanLyrics(text);
  return lines.length >= 6 ? lines : null;
}

export function getLyrics(t: Track): Promise<string[] | null> {
  const hit = cache.get(t.id);
  if (hit) return hit;
  const p = fetchLyrics(t).catch(() => null);
  cache.set(t.id, p);
  return p;
}
