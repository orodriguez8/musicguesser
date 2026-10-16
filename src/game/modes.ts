import type { ModeId, PlayMode } from './types';
import type { IconName } from '../components/Icon';

export interface ModeInfo {
  id: ModeId;
  title: string;
  desc: string;
  icon: IconName;
  tone: 'accent' | 'cyan';
  /** Solo tiene sentido filtrando por géneros (no por un artista). */
  genresOnly?: boolean;
}

export const MODES: ModeInfo[] = [
  { id: 'cancion', title: '¿Qué canción es?', desc: '1 s, 2 s, 4 s…', icon: 'note', tone: 'accent' },
  { id: 'artista', title: '¿Quién canta?', desc: 'Reconoce la voz', icon: 'mic', tone: 'accent' },
  { id: 'completa', title: 'Completa la letra', desc: '¿Qué viene después?', icon: 'lines', tone: 'cyan' },
  { id: 'misteriosa', title: 'Letra misteriosa', desc: '¿De qué canción es?', icon: 'quote', tone: 'cyan' },
  { id: 'anio', title: 'Máquina del tiempo', desc: 'Acierta el año', icon: 'clock', tone: 'accent' },
  { id: 'portada', title: 'Portada pixelada', desc: 'Enfócala tú', icon: 'grid', tone: 'cyan' },
  { id: 'intruso', title: 'El intruso', desc: 'Uno no encaja', icon: 'odd', tone: 'accent' },
  { id: 'subgenero', title: '¿Qué subgénero?', desc: 'Para entendidos', icon: 'layers', tone: 'accent', genresOnly: true },
];

export const modeById = new Map(MODES.map((m) => [m.id, m]));

export function modeTitle(m: PlayMode): string {
  return m === 'mezcla' ? 'Partida rápida' : (modeById.get(m)?.title ?? m);
}
