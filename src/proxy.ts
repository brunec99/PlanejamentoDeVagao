import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { devBypassProfileId } from '@/infrastructure/auth/dev-bypass';

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
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    if (request.nextUrl.pathname.startsWith('/api/')) return NextResponse.json({ error: 'Sessão expirada. Faça login novamente.' }, { status: 401 });
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('redirect', request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return response;
}

// O `wasm` na lista é o binário do web-ifc: sem ele aqui, a sessão expirada devolveria
// a página de login no lugar do módulo, e o visualizador falharia sem dizer por quê.
export const config = { matcher: ['/((?!_next/static|_next/image|favicon\\.ico|icon\\.svg|login|auth/callback|.*\\.(?:png|jpg|jpeg|svg|webp|gif|ico|wasm)$).*)'] };
