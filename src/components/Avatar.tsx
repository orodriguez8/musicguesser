import { Icon, type IconName } from './Icon';
import { tapeById } from './Tapes';

// Avatares por icono (por si en el futuro se usan) y por cinta de casete (diseño actual).
export const AVATARS: Record<string, { color: string; icon: IconName }> = {
  note: { color: '#FF81BD', icon: 'note' },
  mic: { color: '#FFC23D', icon: 'mic' },
  headphones: { color: '#3DE3FF', icon: 'headphones' },
  crown: { color: '#FFD24D', icon: 'crown' },
  bolt: { color: '#FF5468', icon: 'bolt' },
  sparkle: { color: '#B47CFF', icon: 'sparkle' },
  heart: { color: '#FF8AD8', icon: 'heart' },
  glasses: { color: '#FF3D9A', icon: 'glasses' },
};

export function Avatar({ id, name, size = 40 }: { id?: string; name: string; size?: number }) {
  const tape = tapeById(id);
  if (tape) {
    // Mini casete: el color de la cinta con la ventanita y las dos bobinas
    return (
      <span className="avatar" style={{ width: size, height: size, background: tape.color }} title={name} aria-hidden="true">
        <svg width={size * 0.66} height={size * 0.42} viewBox="0 0 28 18">
          <rect x="0.5" y="0.5" width="27" height="17" rx="3" fill="#0C0817" />
          <circle cx="8.5" cy="9" r="3.4" fill={tape.color} />
          <circle cx="19.5" cy="9" r="3.4" fill={tape.color} />
          <circle cx="8.5" cy="9" r="1.2" fill="#0C0817" />
          <circle cx="19.5" cy="9" r="1.2" fill="#0C0817" />
        </svg>
      </span>
    );
  }
  const a = (id && AVATARS[id]) || AVATARS.note;
  return (
    <span className="avatar" style={{ width: size, height: size, background: a.color }} title={name} aria-hidden="true">
      <Icon name={a.icon} size={Math.round(size * 0.55)} />
    </span>
  );
}
