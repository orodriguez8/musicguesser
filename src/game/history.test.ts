import { describe, expect, it } from 'vitest';
import { load, save } from '../lib/storage';
import {
  freshFirst,
  pickFreshAlbums,
  recentArtists,
  recentPuzzle,
  recentTracks,
  remember,
  rememberAlbums,
  rememberPuzzle,
  type Recency,
} from './history';

describe('remember / recentTracks', () => {
  it('lo más nuevo va primero y sin repetidos', () => {
    remember([1, 2], [10]);
    remember([3, 1], [11, 10]);
    expect([...recentTracks().entries()]).toEqual([
      [3, 0],
      [1, 1],
      [2, 2],
    ]);
    expect([...recentArtists().keys()]).toEqual([11, 10]);
  });

  it('guarda como mucho 400 canciones y 60 artistas', () => {
    remember(
      Array.from({ length: 500 }, (_, i) => i),
      Array.from({ length: 80 }, (_, i) => i),
    );
    expect(recentTracks().size).toBe(400);
    expect(recentArtists().size).toBe(60);
  });

  it('ignora datos guardados corruptos', () => {
    save('recent', { tracks: ['x', 5, null], artists: 'nada' });
    expect([...recentTracks().keys()]).toEqual([5]);
    expect(recentArtists().size).toBe(0);
  });
});

describe('freshFirst', () => {
  it('primero lo nunca visto, luego lo que salió hace más tiempo', () => {
    const recent: Recency = new Map([
      [1, 0],
      [2, 5],
      [3, 2],
    ]);
    expect(freshFirst([1, 2, 3, 4, 5], recent, (x) => x)).toEqual([4, 5, 2, 3, 1]);
  });
  it('no cambia el array original', () => {
    const a = [1, 2];
    freshFirst(a, new Map([[1, 0]]), (x) => x);
    expect(a).toEqual([1, 2]);
  });
});

describe('pickFreshAlbums', () => {
  const al = (id: number, a: number) => ({ id, a });

  it('no repite ninguno de los 10 últimos discos', () => {
    rememberAlbums('albumquiz', Array.from({ length: 10 }, (_, i) => al(i, 100 + i)));
    const items = Array.from({ length: 12 }, (_, i) => al(i, 200 + i));
    expect(pickFreshAlbums('albumquiz', items, 1, (x) => x)[0].id).toBe(10);
  });

  it('el disco 11 ya puede volver', () => {
    rememberAlbums('albumquiz', Array.from({ length: 11 }, (_, i) => al(i, 100 + i)));
    // El más antiguo de los 11 es el 0: ya no está entre los 10 últimos
    expect(pickFreshAlbums('albumquiz', [al(0, 300)], 1, (x) => x)[0].id).toBe(0);
  });

  it('no repite artista de los 3 discos anteriores', () => {
    rememberAlbums('albumquiz', [al(1, 7), al(2, 8), al(3, 9)]);
    const items = [al(10, 9), al(11, 8), al(12, 7), al(13, 6)];
    expect(pickFreshAlbums('albumquiz', items, 1, (x) => x)[0].id).toBe(13);
  });

  it('el artista de hace 4 discos ya puede salir', () => {
    rememberAlbums('albumquiz', [al(1, 7), al(2, 8), al(3, 9), al(4, 5)]);
    expect(pickFreshAlbums('albumquiz', [al(10, 7)], 1, (x) => x)[0].id).toBe(10);
  });

  it('dentro de una misma partida también separa artistas', () => {
    const items = [1, 1, 1, 2, 2, 3, 4, 5].map((a, i) => al(i, a));
    const artists = pickFreshAlbums('albumlink', items, 8, (x) => x).map((x) => x.a);
    expect(artists).toEqual([1, 2, 3, 4, 1, 2, 5, 1]);
  });

  it('si no hay más remedio, relaja primero el artista y después el disco', () => {
    rememberAlbums('albumquiz', [al(1, 7)]);
    expect(pickFreshAlbums('albumquiz', [al(2, 7)], 1, (x) => x)[0].id).toBe(2);
    expect(pickFreshAlbums('albumquiz', [al(1, 7)], 1, (x) => x)[0].id).toBe(1);
  });

  it('nunca da el mismo disco dos veces en una partida', () => {
    expect(pickFreshAlbums('portada', [al(1, 1), al(1, 1)], 2, (x) => x)).toHaveLength(1);
  });

  it('cada juego lleva su propio historial', () => {
    rememberAlbums('albumquiz', [al(1, 1)]);
    expect(pickFreshAlbums('portada', [al(1, 1), al(2, 2)], 1, (x) => x)[0].id).toBe(1);
  });

  it('rememberAlbums deja lo último primero, sin duplicados y como mucho 30', () => {
    rememberAlbums('albumquiz', [al(1, 1), al(2, 2)]);
    rememberAlbums('albumquiz', [al(1, 1)]);
    expect(load<{ id: number }[]>('recent-albums:albumquiz', []).map((x) => x.id)).toEqual([1, 2]);
    rememberAlbums('albumquiz', Array.from({ length: 40 }, (_, i) => al(100 + i, i)));
    expect(load<unknown[]>('recent-albums:albumquiz', [])).toHaveLength(30);
  });

  it('tolera un historial corrupto', () => {
    save('recent-albums:albumquiz', [{ id: 'x' }, null, 5]);
    expect(pickFreshAlbums('albumquiz', [al(1, 1)], 1, (x) => x)).toHaveLength(1);
  });
});

describe('recentPuzzle', () => {
  it('apunta y limita', () => {
    rememberPuzzle('clasico', [1]);
    rememberPuzzle('clasico', [2, 1]);
    expect([...recentPuzzle('clasico').keys()]).toEqual([2, 1]);
    rememberPuzzle('wordle', [1, 2, 3], 2);
    expect(recentPuzzle('wordle').size).toBe(2);
  });
});
