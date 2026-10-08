import { NextResponse, type NextRequest } from 'next/server';
import { getRouteProfile } from '@/infrastructure/auth/supabase-server';
import {
  loadTerminality,
  TerminalityUnavailableError,
  withSignedUrls,
} from '@/infrastructure/repositories/supabase/terminality-repository';
import { logRouteError } from '@/infrastructure/log';

export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'no-store' };
const responseError = (error: string, status: number) => NextResponse.json({ error }, { status, headers });

/** Lista de pendências de uma obra, com URLs assinadas das fotos. Sem a migração 0028 responde
 * "indisponível": só a aba 5 fica fora, o resto do sistema segue. */
export async function GET(request: NextRequest) {
  const workId = request.nextUrl.searchParams.get('workId') ?? '';
  if (!workId) return responseError('Obra não informada.', 400);
  const profile = await getRouteProfile().catch(() => null);
  if (!profile) return responseError('Perfil não provisionado. Contate o gestor.', 403);
  if (!profile.workIds.includes(workId)) return responseError('Você não tem acesso a esta obra.', 403);
  try {
    const data = await withSignedUrls(await loadTerminality(workId));
    return NextResponse.json({ available: true, ...data }, { headers });
  } catch (error) {
    if (error instanceof TerminalityUnavailableError) return NextResponse.json({ available: false }, { headers });
    logRouteError('GET /api/terminalidade', error, { actorId: profile.id, workId });
    return responseError('Não foi possível carregar as pendências da obra.', 502);
  }
}
