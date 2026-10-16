// Salas en directo con Supabase Realtime: presencia (quién está) y mensajes (broadcast).
// No hace falta ninguna tabla: la sala existe mientras haya alguien conectado al canal.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { Profile } from '../auth/auth';
import { supabase } from '../lib/supabase';

export const MAX_PLAYERS = 8;
/** Tiempo para responder cada prueba (¿Qué canción es? necesita margen para pedir más segundos). */
export const ROUND_MS = 40_000;
/** Cuenta atrás antes de cada prueba y pausa para ver la solución. */
export const COUNTDOWN_MS = 3_000;
export const REVEAL_MS = 4_000;

// Sin letras ni números que se confundan (0/O, 1/I)
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const newRoomCode = () => Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
export const validCode = (c: string) => /^[A-Z2-9]{5}$/.test(c);

export interface Player {
  id: string;
  name: string;
  avatar: string;
  host: boolean;
  /** Cuándo entró (el orden de llegada decide quién sobra si la sala se llena) */
  at: number;
  /** El anfitrión avisa de que la partida ya ha empezado */
  playing?: boolean;
}

export type RoomStatus = 'connecting' | 'joined' | 'full' | 'error';

type Handler = (payload: Record<string, unknown>) => void;

export const ROOM_EVENTS = ['start', 'ready', 'round', 'answer', 'end', 'lobby'] as const;
export type RoomEvent = (typeof ROOM_EVENTS)[number];

export function useRoom(code: string, me: Profile, host: boolean) {
  const [players, setPlayers] = useState<Player[]>([]);
  const [status, setStatus] = useState<RoomStatus>('connecting');
  const channel = useRef<RealtimeChannel | null>(null);
  const handlers = useRef<Partial<Record<RoomEvent, Handler>>>({});
  const meta = useRef<Player>({ id: me.id, name: me.username, avatar: me.avatar, host, at: Date.now() });

  useEffect(() => {
    if (!supabase) return;
    const ch = supabase.channel(`mg-room-${code}`, {
      config: { presence: { key: me.id }, broadcast: { self: true, ack: false } },
    });
    ch.on('presence', { event: 'sync' }, () => {
      const list = Object.values(ch.presenceState<Player>())
        .map((v) => v[0])
        .filter(Boolean)
        .sort((a, b) => a.at - b.at);
      setPlayers(list);
      // Si somos de los que sobran, salimos
      const pos = list.findIndex((p) => p.id === me.id);
      if (pos >= MAX_PLAYERS) setStatus('full');
    });
    for (const ev of ROOM_EVENTS) ch.on('broadcast', { event: ev }, ({ payload }) => handlers.current[ev]?.(payload ?? {}));
    ch.subscribe(async (s) => {
      if (s === 'SUBSCRIBED') {
        await ch.track(meta.current);
        setStatus((prev) => (prev === 'full' ? prev : 'joined'));
      } else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') setStatus('error');
    });
    channel.current = ch;
    return () => {
      channel.current = null;
      ch.untrack().catch(() => {});
      supabase?.removeChannel(ch);
    };
  }, [code, me.id]);

  const send = useCallback((event: RoomEvent, payload: Record<string, unknown> = {}) => {
    channel.current?.send({ type: 'broadcast', event, payload });
  }, []);

  /** Registra qué hacer al recibir un mensaje (se puede cambiar en cada render). */
  const on = useCallback((event: RoomEvent, fn: Handler) => {
    handlers.current[event] = fn;
  }, []);

  const setPlaying = useCallback((playing: boolean) => {
    meta.current = { ...meta.current, playing };
    channel.current?.track(meta.current);
  }, []);

  return { players, status, send, on, setPlaying };
}
