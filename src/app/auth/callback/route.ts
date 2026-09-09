import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabase } from '@/infrastructure/auth/supabase-server';
import { getServiceClient } from '@/infrastructure/repositories/supabase/client';

export const runtime = 'nodejs';
const ALLOWED_DOMAIN = 'atrincorporadora.com.br';
const BOOTSTRAP_ADMIN_EMAIL = 'bruno.engenharia@atrincorporadora.com.br';

function loginError(request: NextRequest, message: string) {
  const url = request.nextUrl.clone();
  url.pathname = '/login'; url.search = '';
  url.searchParams.set('error', message);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const tokenHash = request.nextUrl.searchParams.get('token_hash');
  const type = request.nextUrl.searchParams.get('type');
  const redirectTo = request.nextUrl.searchParams.get('redirect') || '/obras';
  const supabase = await createServerSupabase();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return loginError(request, 'Falha ao entrar com Google. Tente novamente.');
  } else if (tokenHash && type) {
    // Link de convite enviado por e-mail (Supabase Auth).
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: type as 'invite' | 'magiclink' | 'email' });
    if (error) return loginError(request, 'Convite inválido ou expirado. Entre com sua conta Google.');
  } else {
    return loginError(request, 'Login incompleto. Tente novamente.');
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email || !user.email.toLowerCase().endsWith(`@${ALLOWED_DOMAIN}`)) {
    await supabase.auth.signOut();
    return loginError(request, `Apenas contas @${ALLOWED_DOMAIN} podem acessar este sistema.`);
  }

  const service = getServiceClient();
  const { data: existing } = await service.from('profiles').select('id').eq('id', user.id).maybeSingle();
  if (!existing) {
    const isBootstrap = user.email.toLowerCase() === BOOTSTRAP_ADMIN_EMAIL;
    const name = (user.user_metadata?.full_name as string) || (user.user_metadata?.name as string) || user.email;
    let workIds: string[] = [];
    if (isBootstrap) {
      const { data: works } = await service.from('works').select('id');
      workIds = works?.map(w => w.id) ?? [];
    }
    const { error: insertError } = await service.from('profiles').insert({ id: user.id, name, role: isBootstrap ? 'admin' : 'viewer', work_ids: workIds });
    if (insertError) return loginError(request, 'Não foi possível provisionar seu acesso. Contate um administrador.');
  }

  const url = request.nextUrl.clone();
  url.pathname = redirectTo.startsWith('/') ? redirectTo : '/obras';
  url.search = '';
  return NextResponse.redirect(url);
}
