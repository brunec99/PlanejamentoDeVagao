import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { devBypassProfileId } from '@/infrastructure/auth/dev-bypass';
import { isDeveloperEmail, isRestrictedApi, restrictedPageRedirect, RESTRICTED_MODULE_MESSAGE } from '@/application/module-access';

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
  // Go-live só do curto prazo: os demais módulos da obra ficam com quem desenvolve. O acesso local
  // sem login já saiu acima e conta como desenvolvedor. As rotas repetem a conferência dos comandos.
  if (!isDeveloperEmail(user.email, process.env.DEVELOPER_EMAILS)) {
    const { pathname } = request.nextUrl;
    if (isRestrictedApi(pathname)) return NextResponse.json({ error: RESTRICTED_MODULE_MESSAGE }, { status: 403 });
    const target = restrictedPageRedirect(pathname);
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
