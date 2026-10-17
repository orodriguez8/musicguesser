import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeFakeSupabase } from '../test/fakeSupabase';
import { summary } from '../test/helpers';
import type { Filter } from '../game/types';

const fake = vi.hoisted(() => ({ current: null as ReturnType<typeof makeFakeSupabase> | null }));
vi.mock('../lib/supabase', () => ({
  get supabase() {
    return fake.current!.client;
  },
  onlineEnabled: true,
}));

const { flushPendingScores, pendingScores, rankingGenre, rankingLevel, submitScore } = await import('./ranking');

let sb: ReturnType<typeof makeFakeSupabase>;
beforeEach(() => {
  sb = makeFakeSupabase();
  fake.current = sb;
});
afterEach(() => vi.useRealTimers());

const reggaeton: Filter = { kind: 'genres', genres: ['reggaeton'], level: 'facil' };

describe('a qué ranking va cada partida', () => {
  it('un género → ese género; varios → general; un artista → no puntúa', () => {
    expect(rankingGenre('cancion', reggaeton)).toBe('reggaeton');
    expect(rankingGenre('cancion', { kind: 'genres', genres: ['reggaeton', 'rock'] })).toBe('mix');
    expect(rankingGenre('subgenero', { kind: 'genres', genres: ['rock'] })).toBe('mix');
    expect(rankingGenre('cancion', { kind: 'artist', artists: [{ id: 1, name: 'X', picture: '' }] })).toBeNull();
  });
  it('la dificultad solo cuenta en urbano', () => {
    expect(rankingLevel(reggaeton)).toBe('facil');
    expect(rankingLevel({ kind: 'genres', genres: ['rock'], level: 'dificil' })).toBe('normal');
  });
});

describe('submitScore', () => {
  it('sube la partida con su dificultad', async () => {
    sb.rpcResult = (fn) => (fn === 'my_rank' ? { data: [{ pos: 3, score: 7000 }] } : {});
    const r = await submitScore(summary(), reggaeton);
    expect(r).toEqual({ ok: true, weekPos: 3 });
    expect(sb.rpcCalls[0]).toEqual({
      fn: 'submit_score',
      args: { p_mode: 'cancion', p_genre: 'reggaeton', p_score: 7000, p_correct: 7, p_rounds: 10, p_difficulty: 'facil' },
    });
  });

  it('Normal no envía p_difficulty (compatible con el servidor antiguo)', async () => {
    await submitScore(summary(), { kind: 'genres', genres: ['rock'] });
    expect(sb.rpcCalls[0].args).not.toHaveProperty('p_difficulty');
  });

  it('partidas que no puntúan', async () => {
    expect((await submitScore(summary({}, 8), reggaeton)).ok).toBe(false);
    expect(await submitScore(summary(), { kind: 'artist', artists: [{ id: 1, name: 'X', picture: '' }] })).toMatchObject({ reason: 'not_eligible' });
    sb.session = null;
    expect(await submitScore(summary(), reggaeton)).toMatchObject({ reason: 'not_logged' });
    expect(sb.rpcCalls).toHaveLength(0);
  });

  it('traduce los errores del servidor', async () => {
    sb.rpcResult = () => ({ error: { message: 'too_fast' } });
    expect(await submitScore(summary(), reggaeton)).toMatchObject({ reason: 'error', message: expect.stringMatching(/hace un momento/) });
    sb.rpcResult = () => ({ error: { message: 'invalid_score' } });
    expect(await submitScore(summary(), reggaeton)).toMatchObject({ message: 'Esta puntuación no es válida.' });
  });

  it('un error desconocido se avisa como error de la app', async () => {
    sb.rpcResult = () => ({ error: { message: 'algo raro' } });
    await submitScore(summary(), reggaeton);
    expect(sb.inserts.some((i) => i.table === 'client_errors' && String(i.row.place) === 'ranking:submit')).toBe(true);
  });
});

describe('sin conexión', () => {
  it('guarda la partida y la sube luego', async () => {
    sb.rpcResult = () => ({ error: { message: 'TypeError: Failed to fetch' } });
    const r = await submitScore(summary(), reggaeton);
    expect(r).toMatchObject({ ok: false, reason: 'queued' });
    expect(pendingScores()).toBe(1);

    sb.rpcResult = () => ({});
    sb.rpcCalls = [];
    expect(await flushPendingScores()).toBe(1);
    expect(pendingScores()).toBe(0);
    expect(sb.rpcCalls[0]).toMatchObject({ fn: 'submit_score', args: { p_score: 7000 } });
  });

  it('si sigue sin red, no pierde nada', async () => {
    sb.rpcResult = () => ({ error: { message: 'Failed to fetch' } });
    await submitScore(summary(), reggaeton);
    expect(await flushPendingScores()).toBe(0);
    expect(pendingScores()).toBe(1);
  });

  it('solo sube las de la cuenta con la que se jugaron', async () => {
    sb.rpcResult = () => ({ error: { message: 'Failed to fetch' } });
    await submitScore(summary(), reggaeton);
    sb.session = { user: { id: 'otra' } };
    sb.rpcResult = () => ({});
    expect(await flushPendingScores()).toBe(0);
    expect(pendingScores()).toBe(1);
  });

  it('si el servidor dice "too_fast", espera y reintenta la misma', async () => {
    vi.useFakeTimers();
    sb.rpcResult = () => ({ error: { message: 'Failed to fetch' } });
    await submitScore(summary(), reggaeton);
    let calls = 0;
    sb.rpcResult = () => (++calls === 1 ? { error: { message: 'too_fast' } } : {});
    const p = flushPendingScores();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(await p).toBe(1);
    expect(calls).toBe(2);
  });

  it('una partida rechazada por algo que no se arregla se quita de la cola', async () => {
    sb.rpcResult = () => ({ error: { message: 'Failed to fetch' } });
    await submitScore(summary(), reggaeton);
    sb.rpcResult = () => ({ error: { message: 'invalid_score' } });
    expect(await flushPendingScores()).toBe(0);
    expect(pendingScores()).toBe(0);
  });

  it('las pendientes de hace más de 7 días caducan', async () => {
    sb.rpcResult = () => ({ error: { message: 'Failed to fetch' } });
    await submitScore(summary(), reggaeton);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 8 * 864e5);
    expect(pendingScores()).toBe(0);
  });
});
