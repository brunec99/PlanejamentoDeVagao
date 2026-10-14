import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { devBypassProfileId } from '@/infrastructure/auth/dev-bypass';
import {
  hasApiAccess,
  hasDeveloperAccess,
  hasSectionAccess,
  isDeveloperEmail,
  isRestrictedApi,
  restrictedPageRedirect,
  restrictedSectionOf,
  RESTRICTED_MODULE_MESSAGE,
} from '@/application/module-access';
import { getServiceClient } from '@/infrastructure/repositories/supabase/client';

/** Papel e permissão de teste do perfil, lidos pelo servidor (a chave anônima não lê `profiles`).
 * Falha conta como "sem papel": na dúvida, o endereço restrito continua fechado. O proxy roda em
 * Node.js no Next 16. */
async function profileAccessOf(userId: string): Promise<{ role: string | null; modules: string[] }> {
  try {
    // `*` e não as colunas pelo nome: antes da migração 0031 a coluna `module_access` não existe, e pedi-la
    // derrubaria a consulta inteira (e com ela o papel de admin).
    const { data } = await getServiceClient().from('profiles').select('*').eq('id', userId).maybeSingle();
    return { role: (data?.role as string | undefined) ?? null, modules: Array.isArray(data?.module_access) ? data.module_access : [] };
  } catch {
    return { role: null, modules: [] };
  }
}

export async function proxy(request: NextRequest) {
  // Quando o endereço de retorno não está na lista do Supabase, ele devolve o código do login para
  // o Site URL em vez de /auth/callback. Sem este desvio o código era ignorado e a pessoa voltava
  // ao login como se nada tivesse acontecido; aqui ele segue para a troca por sessão.
  const code = request.nextUrl.searchParams.get('code');
  if (code && !request.nextUrl.pathname.startsWith('/api/')) {
    const url = request.nextUrl.clone();
    url.pathname = '/auth/callback';
    url.search = '';
    url.searchParams.set('code', code);
    url.searchParams.set('redirect', request.nextUrl.pathname === '/' ? '/obras' : request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  if (devBypassProfileId()) return NextResponse.next({ request });
  let response = NextResponse.next({ request });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: cookiesToSet => {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    if (request.nextUrl.pathname.startsWith('/api/'))
      return NextResponse.json({ error: 'Sessão expirada. Faça login novamente.' }, { status: 401 });
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('redirect', request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  // Go-live só do curto prazo: os demais módulos da obra ficam com quem desenvolve (DEVELOPER_EMAILS),
  // com os admins e com quem tem o módulo liberado pelo admin. O acesso local sem login já
  // saiu acima e conta como desenvolvedor. As rotas repetem a conferência dos comandos. O perfil só
  // é lido do banco quando o e-mail não basta e o endereço é restrito, para as demais requisições
  // não pagarem uma consulta a mais.
  const { pathname } = request.nextUrl;
  const restrictedApi = isRestrictedApi(pathname);
  const target = restrictedPageRedirect(pathname);
  const allowed = async () => {
    if (isDeveloperEmail(user.email, process.env.DEVELOPER_EMAILS)) return true;
    const { role, modules } = await profileAccessOf(user.id);
    const access = { developer: hasDeveloperAccess({ email: user.email, role }, process.env.DEVELOPER_EMAILS), modules };
    if (access.developer) return true;
    return restrictedApi ? hasApiAccess(pathname, access) : hasSectionAccess(restrictedSectionOf(pathname) ?? '', access);
  };
  if ((restrictedApi || target) && !(await allowed())) {
    if (restrictedApi) return NextResponse.json({ error: RESTRICTED_MODULE_MESSAGE }, { status: 403 });
    if (target) {
      const url = request.nextUrl.clone();
      url.pathname = target;
      url.search = '';
      const redirect = NextResponse.redirect(url);
      // A sessão renovada nesta requisição segue junto com o desvio.
      response.cookies.getAll().forEach(cookie => redirect.cookies.set(cookie));
      return redirect;
    }
  }
  return response;
}

// `manifest.webmanifest` e `apple-icon` ficam fora porque o navegador os busca sem cookie de sessão;
// sem isso o atalho na tela inicial recebia a página de login no lugar do manifest.
// O `wasm` na lista é o binário do web-ifc: sem ele aqui, a sessão expirada devolveria
// a página de login no lugar do módulo, e o visualizador falharia sem dizer por quê.
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|icon\\.svg|apple-icon|manifest\\.webmanifest|login|privacidade|auth/callback|.*\\.(?:png|jpg|jpeg|svg|webp|gif|ico|wasm)$).*)',
  ],
};
