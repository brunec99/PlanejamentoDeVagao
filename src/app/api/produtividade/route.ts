import { NextResponse, type NextRequest } from 'next/server';
import { requireModuleAccess } from '@/infrastructure/auth/supabase-server';
import { canWriteProduction } from '@/application/use-cases/production-commands';
import { ProductionUnavailableError, loadProduction } from '@/infrastructure/repositories/supabase/production-repository';
import { logRouteError } from '@/infrastructure/log';

export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'no-store' };
const responseError = (error: string, status: number) => NextResponse.json({ error }, { status, headers });

/** Os lançamentos de produção de uma obra, inteiros: a tela filtra e agrega no navegador. Lê quem tem o módulo e a obra
 * liberados; `canEdit` diz se quem pediu pode lançar (a tela só esconde botões, quem barra é o POST).
 * Sem a migração 0046 responde "indisponível": só a aba 8 fica fora. */
export async function GET(request: NextRequest) {
  const gate = await requireModuleAccess('produtividade');
  if (gate.error) return gate.error;
  const profile = gate.access.profile;
  const workId = request.nextUrl.searchParams.get('workId') ?? '';
  if (!workId) return responseError('Obra não informada.', 400);
  if (!profile) return responseError('Perfil não provisionado. Contate o gestor.', 403);
  if (!profile.workIds.includes(workId)) return responseError('Você não tem acesso a esta obra.', 403);
  try {
    const data = await loadProduction(workId);
    return NextResponse.json({ available: true, canEdit: canWriteProduction(profile), ...data }, { headers });
  } catch (error) {
    if (error instanceof ProductionUnavailableError) return NextResponse.json({ available: false }, { headers });
    logRouteError('GET /api/produtividade', error, { actorId: profile.id, workId });
    return responseError('Não foi possível carregar o controle de produtividade da obra.', 502);
  }
}
