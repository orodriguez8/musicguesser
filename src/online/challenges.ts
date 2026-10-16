// Reto a un amigo: se guardan las 10 pruebas de tu partida y se comparte un enlace (?reto=XXXXXX).
import type { Question, Summary } from '../game/types';
import { supabase } from '../lib/supabase';
import { packGame, type PackedGame } from './pack';

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newId = () => Array.from({ length: 6 }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join('');
export const validChallengeId = (id: string) => /^[A-Z2-9]{6}$/.test(id);

export const challengeLink = (id: string) => `${window.location.href.split(/[?#]/)[0]}?reto=${id}`;

export interface Challenge {
  id: string;
  creatorName: string;
  creatorAvatar: string;
  creatorScore: number;
  creatorCorrect: number;
  game: PackedGame;
}

export interface BoardEntry {
  username: string;
  avatar: string;
  score: number;
  correct: number;
  is_creator: boolean;
}

function need() {
  if (!supabase) throw new Error('El modo online no está disponible.');
  return supabase;
}

/** Guarda la partida como reto y devuelve su código. */
export async function createChallenge(summary: Summary, urbano: boolean): Promise<string> {
  const sb = need();
  const { data: s } = await sb.auth.getSession();
  if (!s.session) throw new Error('Entra con tu cuenta para retar a tus amigos.');
  const questions: Question[] = summary.results.map((r) => r.question);
  const game = packGame(summary.mode, summary.filterLabel, urbano, questions);
  for (let attempt = 0; attempt < 3; attempt++) {
    const id = newId();
    const { error } = await sb.from('challenges').insert({
      id,
      creator: s.session.user.id,
      mode: summary.mode,
      label: summary.filterLabel.slice(0, 80),
      game,
      creator_score: summary.score,
      creator_correct: summary.correct,
    });
    if (!error) return id;
    // Código repetido (muy raro): probamos con otro
    if (!error.message.includes('duplicate')) {
      throw new Error(
        error.message.includes('relation') || error.message.includes('schema cache')
          ? 'Los retos todavía no están activados en el servidor.'
          : 'No se ha podido crear el reto. Inténtalo de nuevo.',
      );
    }
  }
  throw new Error('No se ha podido crear el reto. Inténtalo de nuevo.');
}

export async function getChallenge(id: string): Promise<Challenge | null> {
  const { data, error } = await need()
    .from('challenges')
    .select('id, game, creator_score, creator_correct, profiles(username, avatar)')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error('No se ha podido cargar el reto.');
  if (!data) return null;
  const prof = (Array.isArray(data.profiles) ? data.profiles[0] : data.profiles) as { username: string; avatar: string } | null;
  return {
    id: data.id as string,
    game: data.game as PackedGame,
    creatorScore: data.creator_score as number,
    creatorCorrect: data.creator_correct as number,
    creatorName: prof?.username ?? 'Alguien',
    creatorAvatar: prof?.avatar ?? 'note',
  };
}

/** Guarda tu resultado (solo con cuenta; si ya lo jugaste, se queda el primero). */
export async function saveChallengeResult(id: string, score: number, correct: number): Promise<boolean> {
  const sb = need();
  const { data: s } = await sb.auth.getSession();
  if (!s.session) return false;
  const { error } = await sb.from('challenge_results').insert({ challenge_id: id, user_id: s.session.user.id, score, correct });
  return !error;
}

export async function challengeBoard(id: string): Promise<BoardEntry[]> {
  const { data, error } = await need().rpc('challenge_board', { p_id: id });
  if (error) return [];
  return (data ?? []) as BoardEntry[];
}
