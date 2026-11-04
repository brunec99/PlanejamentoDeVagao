import { NextResponse, type NextRequest } from 'next/server';
import { requireModuleAccess } from '@/infrastructure/auth/supabase-server';
import { loadLob, LobUnavailableError, withSignedUrls } from '@/infrastructure/repositories/supabase/lob-repository';
import { logRouteError } from '@/infrastructure/log';

export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'no-store' };
const responseError = (error: string, status: number) => NextResponse.json({ error }, { status, headers });

/** A Linha de Balanço de uma obra (locais, serviços, blocos, dependências, linhas de base,
 * lançamentos e medições com URLs assinadas das fotos). Sem a migração 0038 responde
 * `available: false`: só as visões novas da aba 1 ficam fora. */
export async function GET(request: NextRequest) {
  const workId = request.nextUrl.searchParams.get('workId') ?? '';
  if (!workId) return responseError('Obra não informada.', 400);
  const gate = await requireModuleAccess('longo-prazo');
  if (gate.error) return gate.error;
  const { profile } = gate.access;
  if (!profile) return responseError('Perfil não provisionado. Contate o gestor.', 403);
  if (!profile.workIds.includes(workId)) return responseError('Você não tem acesso a esta obra.', 403);
  try {
    const data = await withSignedUrls(await loadLob(workId));
    return NextResponse.json({ available: true, ...data }, { headers });
  } catch (error) {
    if (error instanceof LobUnavailableError) return NextResponse.json({ available: false }, { headers });
    logRouteError('GET /api/lob', error, { actorId: profile.id, workId });
    return responseError('Não foi possível carregar a Linha de Balanço da obra.', 502);
  }
}
