import { NextResponse, type NextRequest } from 'next/server';
import { getRouteProfile } from '@/infrastructure/auth/supabase-server';
import { canWriteSafety } from '@/application/use-cases/safety-commands';
import {
  listInspectors,
  loadSafety,
  SafetyUnavailableError,
  withSignedUrls,
} from '@/infrastructure/repositories/supabase/safety-repository';
import { logRouteError } from '@/infrastructure/log';

export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'no-store' };
const responseError = (error: string, status: number) => NextResponse.json({ error }, { status, headers });

/** Apontamentos de segurança de uma obra, com URLs assinadas das fotos, os tipos da lista única e os TSTs
 * da obra. Lê quem tem a obra liberada; `canEdit` diz se quem pediu é TST (a tela só esconde botões, quem
 * barra é o POST). Sem a migração 0040 responde "indisponível": só a aba 6 fica fora. */
export async function GET(request: NextRequest) {
  const workId = request.nextUrl.searchParams.get('workId') ?? '';
  if (!workId) return responseError('Obra não informada.', 400);
  const profile = await getRouteProfile().catch(() => null);
  if (!profile) return responseError('Perfil não provisionado. Contate o gestor.', 403);
  if (!profile.workIds.includes(workId)) return responseError('Você não tem acesso a esta obra.', 403);
  try {
    const [data, inspectors] = await Promise.all([loadSafety(workId).then(withSignedUrls), listInspectors(workId)]);
    return NextResponse.json({ available: true, canEdit: canWriteSafety(profile), inspectors, ...data }, { headers });
  } catch (error) {
    if (error instanceof SafetyUnavailableError) return NextResponse.json({ available: false }, { headers });
    logRouteError('GET /api/seguranca', error, { actorId: profile.id, workId });
    return responseError('Não foi possível carregar os apontamentos de segurança da obra.', 502);
  }
}
