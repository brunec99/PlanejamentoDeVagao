import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabase } from '@/infrastructure/auth/supabase-server';
import { getServiceClient } from '@/infrastructure/repositories/supabase/client';
import { BOOTSTRAP_ADMIN_EMAIL } from '@/application/module-access';

export const runtime = 'nodejs';
const ALLOWED_DOMAIN = 'atrincorporadora.com.br';
const NOT_REGISTERED = 'Seu e-mail ainda não foi cadastrado no Obra 360. Peça o cadastro a um administrador.';

function loginError(request: NextRequest, message: string) {
  const url = request.nextUrl.clone();
  url.pathname = '/login';
  url.search = '';
  url.searchParams.set('error', message);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const tokenHash = request.nextUrl.searchParams.get('token_hash');
  const type = request.nextUrl.searchParams.get('type');
  const redirectTo = request.nextUrl.searchParams.get('redirect') || '/obras';
  const supabase = await createServerSupabase();

  // O Supabase recusou antes de gerar o código. No projeto dividido com o Takt Hub o cadastro aberto
  // fica desligado, então o caso comum é um e-mail que ainda não foi cadastrado.
  const oauthError = request.nextUrl.searchParams.get('error');
  if (oauthError) {
    const reason = `${request.nextUrl.searchParams.get('error_code') ?? ''} ${request.nextUrl.searchParams.get('error_description') ?? ''}`;
    return loginError(request, /signup/i.test(reason) ? NOT_REGISTERED : 'Falha ao entrar com Google. Tente novamente.');
  }

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

  const {
    data: { user },
  } = await supabase.auth.getUser();
  // Recusas encerram a sessão só neste navegador: a global derrubaria a mesma pessoa no Takt Hub.
  if (!user?.email || !user.email.toLowerCase().endsWith(`@${ALLOWED_DOMAIN}`)) {
    await supabase.auth.signOut({ scope: 'local' });
    return loginError(request, `Apenas contas @${ALLOWED_DOMAIN} podem acessar este sistema.`);
  }

  // Só entra quem tem perfil, criado pelo cadastro em Configurações. O Auth é dividido com o Takt Hub:
  // ter conta de login não basta, porque ela pode ser só do Takt ou de alguém excluído do Obra 360.
  // A exceção é o primeiro acesso do admin inicial, que não teria quem o cadastrasse.
  const service = getServiceClient();
  const { data: existing } = await service.from('profiles').select('id').eq('id', user.id).maybeSingle();
  if (!existing) {
    const isBootstrap = user.email.toLowerCase() === BOOTSTRAP_ADMIN_EMAIL;
    if (!isBootstrap) {
      await supabase.auth.signOut({ scope: 'local' });
      return loginError(request, NOT_REGISTERED);
    }
    const name = (user.user_metadata?.full_name as string) || (user.user_metadata?.name as string) || user.email;
    let workIds: string[] = [];
    if (isBootstrap) {
      const { data: works } = await service.from('works').select('id');
      workIds = works?.map(w => w.id) ?? [];
    }
    const { error: insertError } = await service
      .from('profiles')
      .insert({ id: user.id, name, role: isBootstrap ? 'admin' : 'viewer', work_ids: workIds });
    if (insertError) return loginError(request, 'Não foi possível provisionar seu acesso. Contate um administrador.');
  }

  const url = request.nextUrl.clone();
  url.pathname = redirectTo.startsWith('/') ? redirectTo : '/obras';
  url.search = '';
  return NextResponse.redirect(url);
}
