'use server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServerSupabase } from '@/infrastructure/auth/supabase-server';

async function origin() {
  const h = await headers();
  return h.get('origin') ?? `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('host')}`;
}

export async function signInWithGoogle(formData: FormData) {
  const redirectTo = String(formData.get('redirect') ?? '/obras');
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${await origin()}/auth/callback?redirect=${encodeURIComponent(redirectTo)}`,
      queryParams: { hd: 'atrincorporadora.com.br', prompt: 'select_account' },
    },
  });
  if (error || !data.url) redirect(`/login?error=${encodeURIComponent('Não foi possível iniciar o login com Google.')}`);
  redirect(data.url);
}

export async function signOut() {
  const supabase = await createServerSupabase();
  await supabase.auth.signOut();
  redirect('/login');
}
