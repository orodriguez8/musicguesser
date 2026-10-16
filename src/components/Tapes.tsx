// Las cintas de casete que cada jugador elige como avatar (diseño Boombox).
// Sin nombres de géneros: cada una solo "recuerda" a un estilo por sus detalles.

export interface Tape {
  id: string;
  label: string;
  color: string;
  ink: string;
  glow: string;
}

export const TAPES: Tape[] = [
  { id: 'tape-gold', label: 'Cinta dorada de eslabones', color: '#FFC23D', ink: '#1A1200', glow: 'rgba(255,194,61,0.45)' },
  { id: 'tape-spikes', label: 'Cinta negra con pinchos', color: '#E5243B', ink: '#FFF1F1', glow: 'rgba(229,36,59,0.45)' },
  { id: 'tape-graffiti', label: 'Cinta de graffiti', color: '#3DE3FF', ink: '#051A20', glow: 'rgba(61,227,255,0.4)' },
  { id: 'tape-glitter', label: 'Cinta de brillos', color: '#C9A7FF', ink: '#1E0F3A', glow: 'rgba(180,124,255,0.45)' },
];

export const tapeById = (id?: string) => TAPES.find((t) => t.id === id);
export const randomTape = () => TAPES[Math.floor(Math.random() * TAPES.length)].id;

/** Cinta pequeña con la etiqueta decorada (selector y avatar grande). */
export function TapeArt({ id, width = 66 }: { id: string; width?: number }) {
  const h = (width * 44) / 66;
  const reels = (
    <>
      <rect x="19" y="27" width="28" height="10" rx="5" fill="#0C0817" />
      <circle cx="25" cy="32" r="3" fill="#CFC6E6" />
      <circle cx="41" cy="32" r="3" fill="#CFC6E6" />
    </>
  );
  let body;
  switch (id) {
    case 'tape-spikes':
      body = (
        <>
          <rect x="1" y="1" width="64" height="42" rx="5" fill="#141012" />
          <rect x="6" y="5" width="54" height="18" rx="3" fill="#1F1214" stroke="#E5243B" />
          <path d="M8 23l4-8 4 8 4-10 4 10 4-7 4 7 4-9 4 9 4-8 4 8 4-6 3 6z" fill="#E5243B" />
          <path d="M33 6l-4 7h3l-1 5 5-7h-3z" fill="#FFC23D" />
        </>
      );
      break;
    case 'tape-graffiti':
      body = (
        <>
          <rect x="1" y="1" width="64" height="42" rx="5" fill="#1A1030" />
          <rect x="6" y="5" width="54" height="18" rx="3" fill="#2A1A4A" />
          <path d="M6 5h54v4c-3 0-3 7-6 7s-3-7-6-7h-8c-2 0-2 10-5 10s-3-10-5-10h-9c-3 0-3 5-6 5s-3-5-6-5H6z" fill="#3DE3FF" />
          <path d="M12 19c5-6 8 3 13-1s8 4 13-1 7 3 12-1" fill="none" stroke="#FF3D9A" strokeWidth="2" strokeLinecap="round" />
        </>
      );
      break;
    case 'tape-glitter':
      body = (
        <>
          <rect x="1" y="1" width="64" height="42" rx="5" fill="#2A1748" />
          <rect x="6" y="5" width="54" height="18" rx="3" fill="#C9A7FF" />
          <path
            d="M16 8l1.3 3.7 3.7 1.3-3.7 1.3L16 18l-1.3-3.7L11 13l3.7-1.3zM44 8l1.3 3.7 3.7 1.3-3.7 1.3L44 18l-1.3-3.7L39 13l3.7-1.3z"
            fill="#FFFFFF"
          />
          <path d="M30 19s-4.5-2.7-5.6-5.3A2.6 2.6 0 0 1 30 11.5a2.6 2.6 0 0 1 5.6 2.2C34.5 16.3 30 19 30 19z" fill="#FF3D9A" />
        </>
      );
      break;
    default:
      body = (
        <>
          <rect x="1" y="1" width="64" height="42" rx="5" fill="#2A2414" />
          <rect x="6" y="5" width="54" height="18" rx="3" fill="#FFC23D" />
          {[14, 32, 50].map((x) => (
            <ellipse key={x} cx={x} cy="14" rx="4.5" ry="3" fill="none" stroke="#8A5A00" strokeWidth="1.6" />
          ))}
          {[23, 41].map((x) => (
            <ellipse key={x} cx={x} cy="14" rx="3" ry="1.3" fill="none" stroke="#8A5A00" strokeWidth="1.6" />
          ))}
        </>
      );
  }
  return (
    <svg width={width} height={h} viewBox="0 0 66 44" aria-hidden="true" focusable="false">
      {body}
      {reels}
    </svg>
  );
}

/** Casete grande del registro: la etiqueta lleva el color de la cinta y el nombre del jugador. */
export function BigCassette({ tapeId, handle }: { tapeId: string; handle: string }) {
  const tape = tapeById(tapeId) ?? TAPES[0];
  return (
    <svg className="big-cassette" viewBox="0 0 350 168" role="img" aria-label={`Casete: mixtape de ${handle}`}>
      <rect x="4" y="4" width="342" height="160" rx="16" fill="#E9E4F7" />
      {[
        [18, 18],
        [332, 18],
        [18, 150],
        [332, 150],
      ].map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="4" fill="#B9B0D6" />
      ))}
      <rect x="30" y="16" width="290" height="96" rx="8" fill="#FFFFFF" />
      <rect x="30" y="16" width="290" height="22" rx="8" fill={tape.color} />
      <rect x="30" y="30" width="290" height="8" fill={tape.color} />
      <text x="175" y="32" fill={tape.ink} fontFamily="VT323, monospace" fontSize="15" textAnchor="middle">
        CARA A · 30 MIN · MUSICGUESSER
      </text>
      <text x="175" y="62" fill="#1B1530" fontFamily="'Permanent Marker', cursive" fontSize="19" textAnchor="middle">
        Mixtape de @{handle}
      </text>
      <rect x="95" y="72" width="160" height="34" rx="17" fill="#1A1030" />
      <g className="reel">
        <circle cx="117" cy="89" r="13" fill="#0C0817" stroke="#CFC6E6" strokeWidth="2" />
        <path d="M117 78 v22 M106 89 h22" stroke="#CFC6E6" strokeWidth="2" />
      </g>
      <g className="reel">
        <circle cx="233" cy="89" r="13" fill="#0C0817" stroke="#CFC6E6" strokeWidth="2" />
        <path d="M233 78 v22 M222 89 h22" stroke="#CFC6E6" strokeWidth="2" />
      </g>
      <rect x="136" y="82" width="78" height="14" rx="3" fill="#3B3150" />
      <path d="M70 164 L90 124 H260 L280 164 Z" fill="#D7D0EA" />
      <circle cx="120" cy="146" r="5" fill="#9A91B8" />
      <circle cx="230" cy="146" r="5" fill="#9A91B8" />
      <rect x="160" y="140" width="30" height="12" rx="2" fill="#9A91B8" />
    </svg>
  );
}
