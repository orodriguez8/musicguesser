import { describe, expect, it } from 'vitest';
import { save } from './lib/storage';
import { clearRecords, loadFilter, loadRecords, loadSettings, recordGame, saveFilter, saveSettings } from './settings';
import { summary } from './test/helpers';

describe('ajustes', () => {
  it('valores por defecto y guardado', () => {
    expect(loadSettings()).toEqual({ volume: 0.8, showOptions: false });
    saveSettings({ volume: 0.3, showOptions: true });
    expect(loadSettings()).toEqual({ volume: 0.3, showOptions: true });
  });
});

describe('filtro guardado', () => {
  it('se recupera tal cual si es válido', () => {
    saveFilter({ kind: 'genres', genres: ['reggaeton'], era: 'vieja', level: 'facil' });
    expect(loadFilter()).toEqual({ kind: 'genres', genres: ['reggaeton'], era: 'vieja', level: 'facil' });
  });
  it('limpia géneros, épocas y dificultades que no existen', () => {
    save('filter', { kind: 'genres', genres: ['reggaeton', 'polka'], era: 'futuro', level: 'imposible' });
    expect(loadFilter()).toEqual({ kind: 'genres', genres: ['reggaeton'], era: undefined, level: undefined });
  });
  it('convierte el formato antiguo de un solo artista', () => {
    save('filter', { kind: 'artist', artist: { id: 1, name: 'Bad Bunny', picture: '' } });
    expect(loadFilter()).toEqual({ kind: 'artist', artists: [{ id: 1, name: 'Bad Bunny', picture: '' }] });
  });
  it('datos manipulados → filtro por defecto', () => {
    save('filter', { kind: 'artist', artists: [{ id: 'x' }] });
    expect(loadFilter()).toEqual({ kind: 'genres', genres: [] });
    save('filter', 'basura');
    expect(loadFilter()).toEqual({ kind: 'genres', genres: [] });
  });
});

describe('récords', () => {
  it('solo guarda si supera el anterior', () => {
    expect(recordGame(summary({ score: 5000 })).isRecord).toBe(true);
    expect(recordGame(summary({ score: 4000 })).isRecord).toBe(false);
    expect(recordGame(summary({ score: 6000 })).isRecord).toBe(true);
    expect(loadRecords().cancion?.score).toBe(6000);
  });
  it('una partida a cero no es récord', () => {
    expect(recordGame(summary({ score: 0 }, 10, 0)).isRecord).toBe(false);
  });
  it('se pueden borrar', () => {
    recordGame(summary());
    expect(clearRecords()).toEqual({});
    expect(loadRecords()).toEqual({});
  });
});
