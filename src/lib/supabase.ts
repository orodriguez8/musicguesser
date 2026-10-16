import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// URL y clave pública (anon) del proyecto de Supabase. Son públicas por diseño:
// la seguridad la ponen las reglas (RLS) y funciones de supabase/schema.sql.
// Sin ellas la app funciona igual, solo que sin cuentas ni ranking.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabase: SupabaseClient | null =
  url && key
    ? createClient(url, key, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      })
    : null;

export const onlineEnabled = supabase != null;
