'use server';
import { redirect } from 'next/navigation';
import { createServerSupabase } from '@/infrastructure/auth/supabase-server';

export async function signIn(formData: FormData) {
  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');
  const redirectTo = String(formData.get('redirect') ?? '/obras');
  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect(`/login?error=${encodeURIComponent('E-mail ou senha inválidos.')}&redirect=${encodeURIComponent(redirectTo)}`);
  redirect(redirectTo);
}

export async function signOut() {
  const supabase = await createServerSupabase();
  await supabase.auth.signOut();
  redirect('/login');
}
