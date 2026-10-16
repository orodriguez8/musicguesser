import { jsonp } from '../lib/jsonp';
import { sleep } from '../lib/util';

const BASE = 'https://api.deezer.com';
// Los enlaces de los fragmentos caducan a las pocas horas: no guardamos respuestas mucho tiempo.
const TTL = 40 * 60 * 1000;

export interface DzArtist {
  id: number;
  name: string;
  picture_medium: string;
  nb_fan: number;
}

export interface DzAlbumRef {
  id: number;
  title: string;
  cover_medium: string;
  cover_big: string;
  release_date?: string;
  record_type?: string;
}

export interface DzTrack {
  id: number;
  readable?: boolean;
  title: string;
  title_short?: string;
  title_version?: string;
  duration: number;
  rank?: number;
  preview: string;
  link: string;
  artist: { id: number; name: string };
  album?: DzAlbumRef;
}

export interface DzAlbum extends DzAlbumRef {
  release_date: string;
  record_type: string;
  artist: { id: number; name: string };
}

interface DzList<T> {
  data?: T[];
}

interface DzError {
  error?: { type?: string; message?: string; code?: number };
}

// Deezer permite ~50 peticiones cada 5 s por IP: limitamos la concurrencia y el ritmo.
const MAX_ACTIVE = 4;
const MIN_GAP_MS = 110;
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

function acquire(): Promise<void> {
  return new Promise((resolve) => {
    waiting.push(resolve);
    pump();
  });
}

function release() {
  active--;
  pump();
}

const cache = new Map<string, { at: number; p: Promise<unknown> }>();

export function dz<T>(path: string): Promise<T> {
  const hit = cache.get(path);
  if (hit && Date.now() - hit.at < TTL) return hit.p as Promise<T>;

  const p = (async () => {
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      let data: (T & DzError) | null = null;
      await acquire();
      try {
        data = await jsonp<T & DzError>(BASE + path);
      } catch (e) {
        lastError = e;
      } finally {
        release();
      }
      if (data && !data.error) return data as T;
      if (data?.error) {
        lastError = new Error(data.error.message ?? 'Error de Deezer');
        // 4 = cuota superada, 700 = servicio ocupado: merece la pena reintentar
        if (data.error.code !== 4 && data.error.code !== 700) break;
      }
      await sleep(900 * (attempt + 1));
    }
    throw lastError ?? new Error('Deezer no responde');
  })();

  cache.set(path, { at: Date.now(), p });
  p.catch(() => cache.delete(path));
  return p;
}

const list = <T>(path: string) => dz<DzList<T>>(path).then((r) => r.data ?? []);

export async function searchArtists(q: string): Promise<DzArtist[]> {
  const res = await list<DzArtist>(`/search/artist?q=${encodeURIComponent(q)}&limit=10`);
  // Deezer a veces pone primero perfiles falsos con 20 fans
  return res.slice().sort((a, b) => b.nb_fan - a.nb_fan);
}

export const artistTop = (id: number, limit = 50) => list<DzTrack>(`/artist/${id}/top?limit=${limit}`);
export const artistAlbums = (id: number) => list<DzAlbumRef>(`/artist/${id}/albums?limit=60`);
export const albumTracks = (id: number) => list<DzTrack>(`/album/${id}/tracks?limit=100`);
export const relatedArtists = (id: number) => list<DzArtist>(`/artist/${id}/related?limit=20`);
export const searchTracks = (q: string) => list<DzTrack>(`/search?q=${encodeURIComponent(q)}&limit=15`);
export const getAlbum = (id: number) => dz<DzAlbum>(`/album/${id}`);
