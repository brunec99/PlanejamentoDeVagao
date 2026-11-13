import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabase } from '@/infrastructure/auth/supabase-server';
import { getServiceClient } from '@/infrastructure/repositories/supabase/client';
import { BOOTSTRAP_ADMIN_EMAIL } from '@/application/module-access';
import { ACCESS_DOMAINS_LABEL, NOT_REGISTERED_REASON, isAllowedEmail } from '@/application/access-request';
import { ACCESS_REQUEST_COOKIE, signIdentity } from '@/infrastructure/auth/access-request-token';
import { publicOrigin } from '@/infrastructure/public-origin';

export const runtime = 'nodejs';
const NOT_REGISTERED = 'Seu e-mail ainda não foi cadastrado no Obra 360. Peça o cadastro a um administrador.';

/** Endereço de uma página do próprio sistema, no endereço público (ver `publicOrigin`): fora da Vercel,
 * `request.nextUrl` aponta para onde o servidor escuta, e o navegador não chega lá. O caminho entra por
 * `pathname`, que nunca troca o domínio, mesmo que o valor comece com `//`. */
function siteUrl(request: NextRequest, pathname: string) {
  const url = new URL(publicOrigin(request.headers, request.nextUrl.origin, process.env.PUBLIC_SITE_URL));
  url.pathname = pathname;
  return url;
}

function loginError(request: NextRequest, message: string, reason?: string) {
  const url = siteUrl(request, '/login');
  url.searchParams.set('error', message);
  // O motivo deixa a tela de login oferecer "Solicitar acesso" a quem não tem cadastro.
  if (reason) url.searchParams.set('motivo', reason);
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
    return /signup/i.test(reason)
      ? loginError(request, NOT_REGISTERED, NOT_REGISTERED_REASON)
      : loginError(request, 'Falha ao entrar com Google. Tente novamente.');
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
  if (!user?.email) {
    await supabase.auth.signOut({ scope: 'local' });
    return loginError(request, `Apenas contas ${ACCESS_DOMAINS_LABEL} podem acessar este sistema.`);
  }

  // Só entra quem tem perfil, criado pelo cadastro em Configurações. O Auth é dividido com o Takt Hub:
  // ter conta de login não basta, porque ela pode ser só do Takt ou de alguém excluído do Obra 360.
  // A exceção é o primeiro acesso do admin inicial, que não teria quem o cadastrasse.
  const service = getServiceClient();
  const { data: existing } = await service.from('profiles').select('id').eq('id', user.id).maybeSingle();
  // Conta de fora da ATR e da Takt (13/11/2026): entra só com o perfil que um admin criou para ela; sem ele,
  // é recusada como antes e não recebe o cartão de "Solicitar acesso".
  if (!existing && !isAllowedEmail(user.email)) {
    await supabase.auth.signOut({ scope: 'local' });
    return loginError(request, `Apenas contas ${ACCESS_DOMAINS_LABEL}, ou cadastradas por um administrador, podem acessar este sistema.`);
  }
  if (!existing) {
    const isBootstrap = user.email.toLowerCase() === BOOTSTRAP_ADMIN_EMAIL;
    if (!isBootstrap) {
      await supabase.auth.signOut({ scope: 'local' });
      // O Google já confirmou quem é: o pedido de acesso sai com o e-mail dele, sem a pessoa digitar.
      const response = loginError(request, NOT_REGISTERED, NOT_REGISTERED_REASON);
      const name = (user.user_metadata?.full_name as string) || (user.user_metadata?.name as string) || '';
      response.cookies.set(ACCESS_REQUEST_COOKIE, signIdentity({ email: user.email.toLowerCase(), name }), {
        httpOnly: true,
        secure: request.nextUrl.protocol === 'https:',
        sameSite: 'lax',
        path: '/login',
        maxAge: 30 * 60,
      });
      return response;
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

  return NextResponse.redirect(siteUrl(request, redirectTo.startsWith('/') ? redirectTo : '/obras'));
}
