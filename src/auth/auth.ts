import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

// Las cuentas de "solo usuario" usan por dentro un email inventado en un dominio reservado
// (.invalid nunca existe), así no hace falta email real. Contrapartida: no hay recuperación.
const USERNAME_DOMAIN = 'usuarios.musicguesser.invalid';
export const usernameEmail = (username: string) => `${username.trim().toLowerCase()}@${USERNAME_DOMAIN}`;
export const isUsernameAccount = (email?: string | null) => !!email?.endsWith(`@${USERNAME_DOMAIN}`);

export const USERNAME_RE = /^[A-Za-z0-9_.]{3,20}$/;

export interface Profile {
  id: string;
  username: string;
  avatar: string;
}

/** Traduce los errores de Supabase Auth a mensajes para el jugador. */
export function authMessage(raw: string): string {
  const m = raw.toLowerCase();
  if (m.includes('invalid login credentials')) return 'Usuario o contraseña incorrectos.';
  if (m.includes('already registered') || m.includes('already been registered')) return 'Ese email ya tiene cuenta. Prueba a entrar.';
  if (m.includes('database error saving new user')) return 'Ese nombre de usuario ya está cogido.';
  if (m.includes('password should be at least') || m.includes('weak password')) return 'La contraseña debe tener al menos 6 caracteres.';
  if (m.includes('rate limit') || m.includes('too many')) return 'Demasiados intentos seguidos. Espera un minuto.';
  if (m.includes('provider is not enabled') || m.includes('unsupported provider')) return 'El acceso con Google todavía no está activado.';
  if (m.includes('email not confirmed')) return 'Falta confirmar el email.';
  // El SMTP gratuito de Supabase solo envía a miembros del proyecto
  if (m.includes('not authorized') || m.includes('error sending')) return 'Ahora mismo no podemos enviar emails. Prueba más tarde.';
  if (m.includes('invalid email') || m.includes('unable to validate email')) return 'Ese email no parece válido.';
  if (m.includes('failed to fetch') || m.includes('network')) return 'Sin conexión. Inténtalo de nuevo.';
  return 'No se ha podido completar. Inténtalo de nuevo.';
}

function need() {
  if (!supabase) throw new Error('Las cuentas no están disponibles.');
  return supabase;
}

export async function signInWithEmail(email: string, password: string) {
  const { error } = await need().auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw new Error(authMessage(error.message));
}

export async function signInWithUsername(username: string, password: string) {
  if (!USERNAME_RE.test(username.trim())) throw new Error('Usuario o contraseña incorrectos.');
  const { error } = await need().auth.signInWithPassword({ email: usernameEmail(username), password });
  if (error) throw new Error(authMessage(error.message));
}

export async function usernameAvailable(username: string): Promise<boolean> {
  const { data, error } = await need().rpc('username_available', { p_username: username.trim() });
  if (error) throw new Error(authMessage(error.message));
  return data === true;
}

export async function signUp(opts: { username: string; email?: string; password: string; avatar: string }) {
  const username = opts.username.trim();
  if (!USERNAME_RE.test(username))
    throw new Error('El nombre de usuario debe tener de 3 a 20 caracteres: letras, números, punto o guion bajo.');
  if (opts.password.length < 6) throw new Error('La contraseña debe tener al menos 6 caracteres.');
  if (!(await usernameAvailable(username))) throw new Error('Ese nombre de usuario ya está cogido.');
  const email = opts.email?.trim() || usernameEmail(username);
  const { data, error } = await need().auth.signUp({
    email,
    password: opts.password,
    options: { data: { username, avatar: opts.avatar } },
  });
  if (error) throw new Error(authMessage(error.message));
  if (!data.session) throw new Error('Cuenta creada, pero falta confirmar el email antes de entrar.');
}

export async function signInWithGoogle() {
  const redirectTo = window.location.origin + window.location.pathname;
  const { error } = await need().auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
  if (error) throw new Error(authMessage(error.message));
}

export async function sendPasswordReset(email: string) {
  const redirectTo = window.location.origin + window.location.pathname;
  const { error } = await need().auth.resetPasswordForEmail(email.trim(), { redirectTo });
  if (error) throw new Error(authMessage(error.message));
}

export async function updatePassword(password: string) {
  if (password.length < 6) throw new Error('La contraseña debe tener al menos 6 caracteres.');
  const { error } = await need().auth.updateUser({ password });
  if (error) throw new Error(authMessage(error.message));
}

export async function updateProfile(id: string, changes: { username?: string; avatar?: string }) {
  if (changes.username != null && !USERNAME_RE.test(changes.username.trim()))
    throw new Error('El nombre de usuario debe tener de 3 a 20 caracteres: letras, números, punto o guion bajo.');
  const { error } = await need()
    .from('profiles')
    .update({ ...changes, username: changes.username?.trim() })
    .eq('id', id);
  if (error) throw new Error(error.code === '23505' ? 'Ese nombre de usuario ya está cogido.' : authMessage(error.message));
}

export async function signOut() {
  await supabase?.auth.signOut();
}

async function fetchProfile(id: string): Promise<Profile | null> {
  if (!supabase) return null;
  const { data } = await supabase.from('profiles').select('id, username, avatar').eq('id', id).maybeSingle();
  return (data as Profile | null) ?? null;
}

export interface AuthState {
  ready: boolean;
  session: Session | null;
  profile: Profile | null;
  /** Ha vuelto del enlace de "recuperar contraseña": hay que pedir una nueva. */
  recovering: boolean;
  refreshProfile: () => Promise<void>;
}

export function useAuth(): AuthState {
  const [ready, setReady] = useState(!supabase);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [recovering, setRecovering] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    const load = async (s: Session | null) => {
      setSession(s);
      setProfile(s ? await fetchProfile(s.user.id) : null);
      if (alive) setReady(true);
    };
    supabase.auth.getSession().then(({ data }) => {
      if (alive) void load(data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
      if (event === 'USER_UPDATED') setRecovering(false);
      // No await dentro del callback (lo recomienda Supabase para evitar bloqueos)
      setTimeout(() => alive && load(s), 0);
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return {
    ready,
    session,
    profile,
    recovering,
    refreshProfile: async () => {
      if (session) setProfile(await fetchProfile(session.user.id));
    },
  };
}
