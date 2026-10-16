import { Icon, type IconName } from './Icon';

// Avatares disponibles: un icono musical sobre un color. Los ids se guardan en el perfil.
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
  const a = (id && AVATARS[id]) || AVATARS.note;
  return (
    <span
      className="avatar"
      style={{ width: size, height: size, background: a.color }}
      title={name}
      aria-hidden="true"
    >
      <Icon name={a.icon} size={Math.round(size * 0.55)} />
    </span>
  );
}
