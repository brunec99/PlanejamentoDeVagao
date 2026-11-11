import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabase } from '@/infrastructure/auth/supabase-server';
import { publicOrigin } from '@/infrastructure/public-origin';

export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'no-store' };

/** Início do login com o Google. É um endereço comum, aberto pelo formulário da tela de login (GET), e
 * não uma ação de servidor.
 *
 * Por que não ação de servidor: quando ela termina num `redirect()` para outro site, o roteador do Next
 * guarda esse endereço externo como a página atual antes de sair. Se a saída não se completa (no celular,
 * a pessoa volta da tela de contas do Google e a página continua viva), o próximo toque no botão envia a
 * ação para o endereço guardado, que é o do Supabase: ele recusa (405) e nada acontece na tela, por mais
 * que a pessoa toque. Um formulário comum não passa pelo roteador, então cada toque é um pedido novo.
 *
 * Fica em `/login/...` porque esse prefixo está fora do proxy (`src/proxy.ts`): quem chega aqui ainda
 * não tem sessão. O cookie do PKCE é gravado por `createServerSupabase` nesta mesma resposta. */
export async function GET(request: NextRequest) {
  const origin = publicOrigin(request.headers, request.nextUrl.origin, process.env.PUBLIC_SITE_URL);
  const redirectTo = request.nextUrl.searchParams.get('redirect') || '/obras';
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${origin}/auth/callback?redirect=${encodeURIComponent(redirectTo)}`,
      // "*" mostra só contas de empresa (Google Workspace): ATR e Takt. O domínio é conferido no retorno.
      queryParams: { hd: '*', prompt: 'select_account' },
    },
  });
  if (error || !data.url) {
    const url = new URL('/login', origin);
    url.searchParams.set('error', 'Não foi possível iniciar o login com Google.');
    return NextResponse.redirect(url, { headers });
  }
  return NextResponse.redirect(data.url, { headers });
}
