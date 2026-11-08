import { NextResponse } from 'next/server';
import { getRouteAccess } from '@/infrastructure/auth/supabase-server';
import { logRouteError, logRouteTiming, serverTimingHeader, SLOW_ROUTE_MS } from '@/infrastructure/log';
import { readPortfolioSources } from '@/infrastructure/repositories/supabase/portfolio-sources';
import type { PortfolioSourcesResponse } from '@/modules/dashboard/portfolio/types';

/** Dashboard geral (04/11/2026, regra 15 do modelo "Dashboard geral e escalas de tempo"): o que o planejamento
 * já carregado não traz, para todas as obras liberadas para a pessoa numa leitura só. A rota fica fora de
 * `RESTRICTED_API_PREFIXES`: o proxy só exige login, e o acesso ao longo prazo e à terminalidade é decidido na
 * leitura, sem 403 para quem não os tem.
 *
 * 08/11/2026: as leituras (longo prazo, terminalidade e segurança) e a montagem da resposta foram para
 * `readPortfolioSources` (`infrastructure/repositories/supabase/portfolio-sources.ts`), sem mudar nada, porque a
 * ferramenta `panorama_obras` da Claudia lê as mesmas fontes no servidor. Aqui ficam a sessão, o
 * `Server-Timing` e o 502. */

export const runtime = 'nodejs';
const ROUTE = 'GET /api/dashboard/obras';

export async function GET() {
  // Tempo por fase em `Server-Timing` (`auth`, `longTerm`, `terminality`, `safety`, `total`), como em `/api/planning`:
  // a terminalidade de muitas obras é a parte que pode pesar.
  const startedAt = performance.now();
  const durations: Record<string, number> = {};
  const { profile, developer, modules } = await getRouteAccess();
  durations.auth = performance.now() - startedAt;
  const respond = (body: PortfolioSourcesResponse | { error: string }, status: number) => {
    durations.total = performance.now() - startedAt;
    if (durations.total > SLOW_ROUTE_MS) logRouteTiming(ROUTE, durations, { actorId: profile?.id, status });
    return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store', 'Server-Timing': serverTimingHeader(durations) } });
  };
  if (!profile) return respond({ error: 'Perfil não provisionado. Contate o gestor.' }, 403);
  try {
    const body = await readPortfolioSources({ workIds: profile.workIds, actorId: profile.id, developer, modules, label: ROUTE, durations });
    return respond(body, 200);
  } catch (cause) {
    logRouteError(ROUTE, cause, { actorId: profile.id });
    return respond({ error: 'Não foi possível carregar os dados das obras. Tente de novo em instantes.' }, 502);
  }
}
