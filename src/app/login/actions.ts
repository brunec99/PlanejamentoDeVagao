'use server';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServerSupabase } from '@/infrastructure/auth/supabase-server';
import { getServiceClient } from '@/infrastructure/repositories/supabase/client';
import { validateAccessRequest } from '@/application/access-request';
import { ACCESS_REQUEST_COOKIE, readIdentity } from '@/infrastructure/auth/access-request-token';

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
  // Só este navegador: o Auth é dividido com o Takt Hub, e o escopo padrão (global) encerraria
  // também as sessões da mesma pessoa no Takt.
  await supabase.auth.signOut({ scope: 'local' });
  redirect('/login');
}

export interface AccessRequestState {
  status: 'idle' | 'sent' | 'error';
  message?: string;
}

/** Pedido de acesso de quem ainda não tem cadastro. Com o cookie assinado do retorno do login, o e-mail
 * é o que o Google confirmou (e não pode ser trocado); sem ele, vale o digitado, marcado como não
 * confirmado para o admin. Um pedido por e-mail: repetir atualiza o mesmo e o volta para pendente. */
export async function requestAccess(_: AccessRequestState, formData: FormData): Promise<AccessRequestState> {
  const identity = readIdentity((await cookies()).get(ACCESS_REQUEST_COOKIE)?.value);
  const { value, error } = validateAccessRequest({
    email: identity?.email ?? String(formData.get('email') ?? ''),
    name: String(formData.get('name') ?? ''),
    message: String(formData.get('message') ?? ''),
  });
  if (!value) return { status: 'error', message: error };
  const service = getServiceClient();
  const { data: previous, error: readError } = await service
    .from('access_requests')
    .select('updated_at, status, verified')
    .eq('email', value.email)
    .maybeSingle();
  if (readError) return { status: 'error', message: 'Não foi possível registrar o pedido agora. Tente de novo mais tarde.' };
  // Quem clica várias vezes não multiplica o pedido nem o refaz a cada segundo.
  // Pedido digitado não sobrescreve um confirmado pelo Google: o nome dele vale mais.
  if (previous?.verified && !identity && previous.status === 'pending') return { status: 'sent' };
  if (previous?.status === 'pending' && Date.now() - Date.parse(previous.updated_at) < 60_000) return { status: 'sent' };
  const now = new Date().toISOString();
  const { error: writeError } = await service.from('access_requests').upsert(
    {
      email: value.email,
      name: value.name,
      message: value.message ?? null,
      verified: !!identity,
      status: 'pending',
      updated_at: now,
      handled_by: null,
      handled_at: null,
    },
    { onConflict: 'email' },
  );
  if (writeError) return { status: 'error', message: 'Não foi possível registrar o pedido agora. Tente de novo mais tarde.' };
  return { status: 'sent' };
}
