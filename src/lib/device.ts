import { load, save } from './storage';

let cached: string | null = null;

/**
 * Id aleatorio de este dispositivo (no identifica a nadie): sirve para contar cuántas
 * personas juegan sin cuenta y para frenar abusos. Se borra al borrar los datos del navegador.
 */
export function deviceId(): string {
  if (cached) return cached;
  const stored = load<unknown>('device', null);
  if (typeof stored === 'string' && /^[a-z0-9-]{8,40}$/.test(stored)) return (cached = stored);
  const fresh =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `d-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  save('device', fresh);
  return (cached = fresh);
}
