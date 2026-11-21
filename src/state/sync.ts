/**
 * Optional cloud sync with Supabase. Enabled only when VITE_SUPABASE_URL and
 * VITE_SUPABASE_ANON_KEY are set at build time. The SDK is loaded lazily so the
 * game stays small and fully offline when sync isn't configured.
 *
 * Expected table (see README):
 *   create table profiles (id uuid primary key references auth.users, data jsonb not null, updated_at timestamptz default now());
 *   alter table profiles enable row level security;
 *   create policy "own row" on profiles for all using (auth.uid() = id) with check (auth.uid() = id);
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { getProfile, replaceProfile } from './store';
import type { Profile } from './types';

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const syncAvailable = !!(URL && KEY);

let client: SupabaseClient | null = null;
async function sb(): Promise<SupabaseClient> {
  if (!syncAvailable) throw new Error('Cloud sync is not configured for this build.');
  if (!client) {
    const { createClient } = await import('@supabase/supabase-js');
    client = createClient(URL!, KEY!, { auth: { persistSession: true } });
  }
  return client;
}

export async function currentUser(): Promise<string | null> {
  if (!syncAvailable) return null;
  const { data } = await (await sb()).auth.getUser();
  return data.user?.email ?? null;
}

export async function sendMagicLink(email: string) {
  const { error } = await (await sb()).auth.signInWithOtp({ email, options: { emailRedirectTo: location.href } });
  if (error) throw error;
}

export async function signOut() {
  await (await sb()).auth.signOut();
}

export async function pushProfile() {
  const c = await sb();
  const { data } = await c.auth.getUser();
  if (!data.user) throw new Error('Sign in first.');
  const { error } = await c.from('profiles').upsert({ id: data.user.id, data: getProfile(), updated_at: new Date().toISOString() });
  if (error) throw error;
}

export async function pullProfile(): Promise<boolean> {
  const c = await sb();
  const { data } = await c.auth.getUser();
  if (!data.user) throw new Error('Sign in first.');
  const { data: row, error } = await c.from('profiles').select('data').eq('id', data.user.id).maybeSingle();
  if (error) throw error;
  if (!row) return false;
  replaceProfile(row.data as Profile);
  return true;
}
