import { beforeEach, describe, expect, it, vi } from 'vitest';

const jsonp = vi.hoisted(() => vi.fn());
vi.mock('../lib/jsonp', () => ({ jsonp }));
vi.mock('../lib/util', async (orig) => ({ ...(await orig<typeof import('../lib/util')>()), sleep: () => Promise.resolve() }));

const { dz, searchArtists } = await import('./deezer');

// Con llaves: si beforeEach devuelve una función, Vitest la ejecuta al acabar el test
beforeEach(() => {
  jsonp.mockReset();
});

describe('dz', () => {
  it('pide con JSONP y guarda la respuesta un rato', async () => {
    jsonp.mockResolvedValue({ id: 1 });
    expect(await dz('/track/1')).toEqual({ id: 1 });
    expect(await dz('/track/1')).toEqual({ id: 1 });
    expect(jsonp).toHaveBeenCalledTimes(1);
    expect(jsonp.mock.calls[0][0]).toBe('https://api.deezer.com/track/1');
  });

  it('reintenta si Deezer está saturado (código 4 o 700)', async () => {
    jsonp.mockResolvedValueOnce({ error: { code: 4, message: 'Quota' } }).mockResolvedValueOnce({ id: 2 });
    expect(await dz('/track/2')).toEqual({ id: 2 });
    expect(jsonp).toHaveBeenCalledTimes(2);
  });

  it('reintenta los fallos de red y al final lanza el error', async () => {
    jsonp.mockRejectedValue(new Error('Error de red'));
    const err = await dz('/track/3').catch((e: Error) => e);
    expect((err as Error).message).toBe('Error de red');
    expect(jsonp.mock.calls.length).toBe(4);
  });

  it('no reintenta errores definitivos (p. ej. no existe)', async () => {
    jsonp.mockResolvedValue({ error: { code: 800, message: 'no data' } });
    await expect(dz('/track/4')).rejects.toThrow('no data');
    expect(jsonp).toHaveBeenCalledTimes(1);
  });

  it('un fallo no se queda en caché', async () => {
    jsonp.mockResolvedValueOnce({ error: { code: 800, message: 'x' } }).mockResolvedValueOnce({ id: 5 });
    await expect(dz('/track/5')).rejects.toThrow();
    expect(await dz('/track/5')).toEqual({ id: 5 });
  });
});

describe('searchArtists', () => {
  it('ordena por fans (Deezer a veces pone perfiles falsos primero)', async () => {
    jsonp.mockResolvedValue({ data: [{ id: 1, nb_fan: 20 }, { id: 2, nb_fan: 9000 }] });
    expect((await searchArtists('bad bunny')).map((a) => a.id)).toEqual([2, 1]);
  });
});
