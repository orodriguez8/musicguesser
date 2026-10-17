import { describe, expect, it, vi } from 'vitest';
import { cancion, track } from '../test/helpers';

vi.mock('../api/deezer', () => ({ getTrack: vi.fn(async (id: number) => ({ id, preview: `https://fresh/${id}.mp3` })) }));
vi.mock('../lib/supabase', () => ({ supabase: null, onlineEnabled: false }));

const { newRoomCode, validCode } = await import('./room');
const { challengeLink, validChallengeId, createChallenge } = await import('./challenges');
const { packGame, unpackGame } = await import('./pack');

describe('códigos', () => {
  it('sala: 5 caracteres sin letras confusas', () => {
    for (let i = 0; i < 50; i++) {
      const c = newRoomCode();
      expect(validCode(c)).toBe(true);
      expect(c).not.toMatch(/[01IO]/);
    }
    expect(validCode('abcde')).toBe(false);
    expect(validCode('ABCD')).toBe(false);
  });
  it('reto: 6 caracteres', () => {
    expect(validChallengeId('ABC234')).toBe(true);
    expect(validChallengeId('ABC23')).toBe(false);
    expect(validChallengeId('ABC10O')).toBe(false);
    expect(challengeLink('ABC234')).toMatch(/\?reto=ABC234$/);
  });
  it('sin Supabase, crear un reto da un error claro', async () => {
    await expect(createChallenge({} as never, false)).rejects.toThrow(/no está disponible/);
  });
});

describe('empaquetar partidas', () => {
  const qs = [cancion(track({ id: 1, title: 'Gasolina' })), cancion(track({ id: 2, title: 'Rompe' }))];
  for (const q of qs) (q as { suggest?: string[] }).suggest = ['Gasolina', 'Rompe', 'Lo Que Pasó, Pasó'];

  it('no manda las listas del autocompletado dentro de cada pregunta', () => {
    const p = packGame('cancion', 'Reggaetón', false, qs);
    expect(p.questions.every((q) => !('suggest' in q))).toBe(true);
    expect(p.songs).toEqual(['Gasolina', 'Rompe', 'Lo Que Pasó, Pasó']);
    // El original no se toca
    expect('suggest' in qs[0] && qs[0].suggest).toBeTruthy();
  });

  it('al desempaquetar rehace el autocompletado y renueva el audio', async () => {
    const p = JSON.parse(JSON.stringify(packGame('cancion', 'Reggaetón', false, qs)));
    const out = await unpackGame(p, { refreshAudio: true });
    expect(out[0].kind === 'cancion' && out[0].track.preview).toBe('https://fresh/1.mp3');
    expect(out[0].kind === 'cancion' && out[0].suggest).toEqual(expect.arrayContaining(['Gasolina', 'Lo Que Pasó, Pasó']));
  });

  it('urbano: el autocompletado sale de la base de datos', async () => {
    const p = packGame('cancion', 'Urbano', true, qs);
    expect(p.songs).toBeUndefined();
    const out = await unpackGame(p, { refreshAudio: false });
    expect(out[0].kind === 'cancion' && out[0].suggest!.length).toBeGreaterThan(5000);
    expect(out[0].kind === 'cancion' && out[0].track.preview).toBe(qs[0].kind === 'cancion' && qs[0].track.preview);
  });
});
