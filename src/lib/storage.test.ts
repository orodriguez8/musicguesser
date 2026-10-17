import { describe, expect, it, vi } from 'vitest';
import { deviceId } from './device';
import { load, remove, save } from './storage';

describe('storage', () => {
  it('guarda y lee JSON con prefijo', () => {
    save('x', { a: 1 });
    expect(localStorage.getItem('mg:x')).toBe('{"a":1}');
    expect(load('x', null)).toEqual({ a: 1 });
    remove('x');
    expect(load('x', 'def')).toBe('def');
  });

  it('si el almacenamiento falla o hay basura, devuelve el valor por defecto', () => {
    localStorage.setItem('mg:roto', '{no es json');
    expect(load('roto', 42)).toBe(42);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    expect(load('x', 'ok')).toBe('ok');
  });

  it('guardar con el almacenamiento lleno no rompe la app', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceeded');
    });
    expect(() => save('x', 1)).not.toThrow();
    expect(() => remove('x')).not.toThrow();
  });
});

describe('deviceId', () => {
  it('crea un id válido y lo mantiene', () => {
    const id = deviceId();
    expect(id).toMatch(/^[a-z0-9-]{8,40}$/);
    expect(deviceId()).toBe(id);
    expect(load('device', null)).toBe(id);
  });
});
