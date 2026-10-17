import { describe, expect, it } from 'vitest';
import { answerMatches, levenshtein, lineMatches, normText, similarity, stripExtras, suggestMatches } from './text';

describe('normText', () => {
  it('quita mayúsculas, tildes y signos', () => {
    expect(normText('¡Dákiti!')).toBe('dakiti');
    expect(normText('Mañana Será Bonito')).toBe('mananaserabonito');
    expect(normText("Pa' Ti")).toBe('pati');
  });
  it('conserva los textos no latinos', () => {
    expect(normText('Кино')).toBe('кино');
  });
});

describe('stripExtras', () => {
  it('quita colaboraciones, versiones y añadidos', () => {
    expect(stripExtras('Te Boté (feat. Ozuna)')).toBe('Te Boté');
    expect(stripExtras('Gasolina - Remastered 2015')).toBe('Gasolina');
    expect(stripExtras('Safaera ft. Jowell & Randy')).toBe('Safaera');
    expect(stripExtras('Callaíta [Remix]')).toBe('Callaíta');
  });
});

describe('levenshtein y similarity', () => {
  it('cuenta ediciones', () => {
    expect(levenshtein('gasolina', 'gasolina')).toBe(0);
    expect(levenshtein('gasolina', 'gazolina')).toBe(1);
    expect(levenshtein('', 'abc')).toBe(3);
  });
  it('similarity va de 0 a 1', () => {
    expect(similarity('', '')).toBe(1);
    expect(similarity('abc', 'abc')).toBe(1);
    expect(similarity('abcd', 'wxyz')).toBe(0);
  });
});

describe('answerMatches', () => {
  it('acepta tildes, mayúsculas y extras', () => {
    expect(answerMatches('dakiti', ['DÁKITI'])).toBe(true);
    expect(answerMatches('te bote', ['Te Boté (feat. Ozuna)'])).toBe(true);
  });
  it('tolera erratas pequeñas en respuestas largas', () => {
    expect(answerMatches('despasito', ['Despacito'])).toBe(true);
  });
  it('en respuestas cortas exige exactitud', () => {
    expect(answerMatches('mia', ['MIA'])).toBe(true);
    expect(answerMatches('mio', ['MIA'])).toBe(false);
  });
  it('rechaza lo vacío y lo distinto', () => {
    expect(answerMatches('', ['Gasolina'])).toBe(false);
    expect(answerMatches('safaera', ['Gasolina'])).toBe(false);
  });
  it('ignora el "the" inicial', () => {
    expect(answerMatches('the weeknd', ['Weeknd'])).toBe(true);
  });
});

describe('lineMatches', () => {
  it('vale si se parece bastante al verso', () => {
    expect(lineMatches('a ella le gusta la gasolina', 'A ella le gusta la gasolina')).toBe(true);
    expect(lineMatches('le gusta la gasolin', 'A ella le gusta la gasolina')).toBe(true);
    expect(lineMatches('nada que ver', 'A ella le gusta la gasolina')).toBe(false);
    expect(lineMatches('abc', 'abc')).toBe(false);
  });
});

describe('suggestMatches', () => {
  const items = ['Gasolina', 'Lo Que Pasó, Pasó', 'Rompe', 'Pa’ Las Ánimas', 'Mayor Que Yo'];
  it('primero lo que empieza igual, luego por palabra, luego lo que contiene', () => {
    expect(suggestMatches('pa', items)).toEqual(['Pa’ Las Ánimas', 'Lo Que Pasó, Pasó']);
    expect(suggestMatches('anim', items)).toEqual(['Pa’ Las Ánimas']);
    expect(suggestMatches('ompe', items)).toEqual(['Rompe']);
  });
  it('con menos de 2 letras no sugiere nada', () => {
    expect(suggestMatches('g', items)).toEqual([]);
  });
  it('respeta el límite', () => {
    expect(suggestMatches('o', ['oa', 'ob', 'oc'], 2)).toEqual([]);
    expect(suggestMatches('ga', Array.from({ length: 10 }, (_, i) => `Ga${i}`), 3)).toHaveLength(3);
  });
});
