import { NextResponse, type NextRequest } from 'next/server';
import { requireModuleAccess } from '@/infrastructure/auth/supabase-server';
import { loadLobWithCosts, LobUnavailableError, withSignedUrls } from '@/infrastructure/repositories/supabase/lob-repository';
import { logRouteError } from '@/infrastructure/log';
import type { LobCostAccess, LobResponse } from '@/domain/lob';
import { maskCosts } from '@/domain/lob-performance';

export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'no-store' };
const responseError = (error: string, status: number) => NextResponse.json({ error }, { status, headers });

/** A Linha de Balanço de uma obra (locais, serviços, blocos, dependências, linhas de base,
 * lançamentos, medições com URLs assinadas das fotos e itens de custo). Sem a migração 0038 responde
 * `available: false`: só as visões novas da aba 1 ficam fora. Custos (11/11/2026, regra 9 do modelo
 * do IDP): o perfil Consulta recebe cada item como % do total (`costAccess: 'masked'`), e o valor em
 * reais não sai do servidor; sem a 0044, `costs: []` e `costAccess: 'unavailable'`. */
export async function GET(request: NextRequest) {
  const workId = request.nextUrl.searchParams.get('workId') ?? '';
  if (!workId) return responseError('Obra não informada.', 400);
  const gate = await requireModuleAccess('longo-prazo');
  if (gate.error) return gate.error;
  const { profile } = gate.access;
  if (!profile) return responseError('Perfil não provisionado. Contate o gestor.', 403);
  if (!profile.workIds.includes(workId)) return responseError('Você não tem acesso a esta obra.', 403);
  try {
    const { data, costsAvailable } = await loadLobWithCosts(workId);
    const signed = await withSignedUrls(data);
    const masked = profile.role === 'viewer';
    const costAccess: LobCostAccess = !costsAvailable ? 'unavailable' : masked ? 'masked' : 'full';
    const body: LobResponse = { available: true, ...signed, costs: masked ? maskCosts(signed.costs) : signed.costs, costAccess };
    return NextResponse.json(body, { headers });
  } catch (error) {
    if (error instanceof LobUnavailableError) return NextResponse.json({ available: false }, { headers });
    logRouteError('GET /api/lob', error, { actorId: profile.id, workId });
    return responseError('Não foi possível carregar a Linha de Balanço da obra.', 502);
  }
}
