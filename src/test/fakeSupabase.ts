// Cliente de Supabase de mentira para los tests: apunta lo que se inserta y deja programar las respuestas.
import { vi } from 'vitest';

export interface FakeSupabase {
  inserts: { table: string; row: Record<string, unknown> }[];
  rpcCalls: { fn: string; args: Record<string, unknown> }[];
  session: { user: { id: string } } | null;
  rpcResult: (fn: string, args: Record<string, unknown>) => { data?: unknown; error?: { message: string } | null } | Promise<never>;
  insertResult: (table: string) => { error: { message: string } | null };
  client: unknown;
}

export function makeFakeSupabase(): FakeSupabase {
  const fake: FakeSupabase = {
    inserts: [],
    rpcCalls: [],
    session: { user: { id: 'user-1' } },
    rpcResult: () => ({ data: null, error: null }),
    insertResult: () => ({ error: null }),
    client: null,
  };
  fake.client = {
    rpc: vi.fn(async (fn: string, args: Record<string, unknown> = {}) => {
      fake.rpcCalls.push({ fn, args });
      const r = await fake.rpcResult(fn, args);
      return { data: r.data ?? null, error: r.error ?? null };
    }),
    from: vi.fn((table: string) => ({
      insert: vi.fn(async (row: Record<string, unknown>) => {
        fake.inserts.push({ table, row });
        return fake.insertResult(table);
      }),
    })),
    auth: { getSession: vi.fn(async () => ({ data: { session: fake.session } })) },
  };
  return fake;
}
