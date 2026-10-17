import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeFakeSupabase } from '../test/fakeSupabase';
import { summary } from '../test/helpers';

const fake = vi.hoisted(() => ({ current: null as ReturnType<typeof makeFakeSupabase> | null }));
vi.mock('../lib/supabase', () => ({
  get supabase() {
    return fake.current!.client;
  },
  onlineEnabled: true,
}));

const { logGame, logPuzzle, reportQuestion } = await import('./telemetry');
const { resetErrorReporting } = await import('../lib/errors');
const { deviceId } = await import('../lib/device');

let sb: ReturnType<typeof makeFakeSupabase>;
beforeEach(() => {
  sb = makeFakeSupabase();
  fake.current = sb;
  resetErrorReporting();
});
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('estadísticas de partidas', () => {
  it('partida de urbano con dificultad y época', async () => {
    logGame('game', summary(), { kind: 'genres', genres: ['reggaeton'], era: 'vieja', level: 'facil' });
    await flush();
    expect(sb.inserts).toHaveLength(1);
    expect(sb.inserts[0]).toEqual({
      table: 'plays',
      row: {
        device: deviceId(),
        kind: 'game',
        mode: 'cancion',
        genre: 'reggaeton',
        difficulty: 'facil',
        era: 'vieja',
        rounds: 10,
        correct: 7,
        score: 7000,
        challenge_id: null,
      },
    });
  });

  it('fuera del urbano no hay dificultad; con artistas, género "artista"', async () => {
    logGame('game', summary(), { kind: 'artist', artists: [{ id: 1, name: 'X', picture: '' }] });
    await flush();
    expect(sb.inserts[0].row).toMatchObject({ genre: 'artista', difficulty: null, era: null });
  });

  it('retos con su código', async () => {
    logGame('challenge', summary(), null, 'ABCDEF');
    await flush();
    expect(sb.inserts[0].row).toMatchObject({ kind: 'challenge', challenge_id: 'ABCDEF', genre: null });
  });

  it('puzles', async () => {
    logPuzzle('wordle', { won: true, attempts: 4, score: '4/6', grid: '' }, true);
    await flush();
    expect(sb.inserts[0].row).toMatchObject({ kind: 'puzzle', mode: 'wordle', won: true, daily: true, difficulty: null });
  });

  it('si aún no existe la tabla no se avisa como error', async () => {
    sb.insertResult = () => ({ error: { message: 'relation "public.plays" does not exist' } });
    logGame('game', summary(), null);
    await flush();
    expect(sb.inserts.filter((i) => i.table === 'client_errors')).toHaveLength(0);
  });

  it('otros fallos sí se avisan', async () => {
    sb.insertResult = (t) => ({ error: t === 'plays' ? { message: 'permission denied' } : null });
    logGame('game', summary(), null);
    await flush();
    await flush();
    expect(sb.inserts.some((i) => i.table === 'client_errors')).toBe(true);
  });
});

describe('reportar preguntas', () => {
  it('envía el motivo, el comentario recortado y la canción', async () => {
    const ok = await reportQuestion({ reason: 'audio', comment: '  suena otra  ', mode: 'cancion', trackId: 5, title: 'Gasolina', artist: 'Daddy Yankee' });
    expect(ok).toBe(true);
    expect(sb.inserts[0]).toMatchObject({
      table: 'question_reports',
      row: { reason: 'audio', comment: 'suena otra', track_id: 5, title: 'Gasolina', artist: 'Daddy Yankee', album: null },
    });
  });

  it('comentario vacío → null; si falla, devuelve false', async () => {
    sb.insertResult = () => ({ error: { message: 'rate_limited' } });
    expect(await reportQuestion({ reason: 'otro', comment: '   ' })).toBe(false);
    expect(sb.inserts[0].row.comment).toBeNull();
  });
});
