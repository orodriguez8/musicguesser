// Panel de administración. Toda la seguridad está en el servidor: las funciones admin_* de
// schema.sql comprueban que quien llama está en la tabla admins; si no, devuelven "forbidden".
import { supabase } from '../lib/supabase';

export interface DayRow {
  day: string;
  plays: number;
  devices: number;
  signups: number;
}

export interface ModeRow {
  kind: string;
  mode: string;
  plays: number;
  devices: number;
  avg_score: number | null;
  avg_correct: number | null;
  win_rate: number | null;
}

export interface ChallengeRow {
  id: string;
  mode: string;
  label: string;
  created_at: string;
  creator_score: number;
  creator: string;
  results: number;
  plays: number;
  devices: number;
}

export interface ErrorRow {
  place: string;
  message: string;
  n: number;
  devices: number;
  last_at: string;
  version: string | null;
  stack: string | null;
  extra: Record<string, unknown> | null;
}

export interface ReportRow {
  id: number;
  reason: string;
  comment: string | null;
  mode: string | null;
  track_id: number | null;
  album_id: number | null;
  title: string | null;
  artist: string | null;
  album: string | null;
  created_at: string;
  username: string | null;
}

export interface Kpis {
  generated_at: string;
  days: number;
  users: {
    total: number;
    new_24h: number;
    new_7d: number;
    new_period: number;
    with_email: number;
    google: number;
    active_7d: number;
    in_ranking: number;
  };
  plays: {
    total: number;
    period: number;
    today: number;
    devices_24h: number;
    devices_7d: number;
    devices_period: number;
    devices_total: number;
    logged_share: number;
    returning_devices: number;
    avg_per_device: number;
  };
  daily: DayRow[];
  hours: { hour: number; plays: number }[];
  by_mode: ModeRow[];
  by_genre: { genre: string; plays: number }[];
  by_level: { difficulty: string; era: string; plays: number }[];
  puzzles: { mode: string; daily: boolean; plays: number; devices: number; win_rate: number }[];
  top_players: { username: string; avatar: string; plays: number; best: number | null; days: number; last_at: string }[];
  recent_users: { username: string; avatar: string; created_at: string; plays: number; ranked: number; last_at: string | null }[];
  challenges: { total: number; period: number; results: number; plays: number; list: ChallengeRow[] };
  rooms: { period: number; players: number };
  ranking: { total: number; period: number };
  errors: { h24: number; period: number; devices: number; top: ErrorRow[] };
  reports: { open: number; list: ReportRow[] };
}

export interface ChallengePlayer {
  player: string;
  logged: boolean;
  plays: number;
  best: number | null;
  best_correct: number | null;
  first_at: string;
  last_at: string;
  saved: number | null;
}

function need() {
  if (!supabase) throw new Error('Supabase no está configurado.');
  return supabase;
}

function fail(message: string): never {
  if (message.includes('forbidden')) throw new Error('Esta cuenta no tiene acceso al panel.');
  if (/could not find the function|does not exist/i.test(message))
    throw new Error('Falta ejecutar el SQL nuevo (supabase/schema.sql) en Supabase.');
  throw new Error(message);
}

/** ¿La cuenta con la sesión iniciada es de administración? (falso ante cualquier error) */
export async function isAdmin(): Promise<boolean> {
  if (!supabase) return false;
  const { data, error } = await supabase.rpc('is_admin');
  return !error && data === true;
}

export async function fetchKpis(days: number): Promise<Kpis> {
  const { data, error } = await need().rpc('admin_kpis', { p_days: days });
  if (error) fail(error.message);
  return data as Kpis;
}

export async function fetchChallengePlayers(id: string): Promise<ChallengePlayer[]> {
  const { data, error } = await need().rpc('admin_challenge', { p_id: id });
  if (error) fail(error.message);
  return (data ?? []) as ChallengePlayer[];
}

export async function resolveReport(id: number): Promise<void> {
  const { error } = await need().rpc('admin_resolve_report', { p_id: id });
  if (error) fail(error.message);
}

export async function purgeErrors(): Promise<number> {
  const { data, error } = await need().rpc('admin_purge_errors');
  if (error) fail(error.message);
  return Number(data) || 0;
}
