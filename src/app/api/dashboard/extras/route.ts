import { NextResponse, type NextRequest } from 'next/server';
import { getRouteAccess } from '@/infrastructure/auth/supabase-server';
import { todayInSaoPaulo } from '@/infrastructure/clock';
import { logRouteError, logRouteTiming, serverTimingHeader, SLOW_ROUTE_MS } from '@/infrastructure/log';
import { parseExtrasQuery, readDashboardExtras } from '@/infrastructure/repositories/supabase/dashboard-extras';
import type { DashboardExtrasResponse } from '@/modules/dashboard/extras/types';

/** Quadros novos dos dashboards (12/11/2026, modelo aprovado "Dashboards completos e resumo semanal", regra 11):
 * histograma, produtividade, Quadro de Restrições, IDP da Linha de Balanço, checklist de equipamentos e, com
 * `seguranca=1`, a segurança, já calculados para o intervalo `de`–`ate`. Sem `obra`, todas as obras liberadas
 * para a pessoa (Dashboard geral); com `obra`, só ela (aba 0). Como `GET /api/dashboard/obras`, fica fora de
 * `RESTRICTED_API_PREFIXES`: o proxy só exige login, e cada bloco só vem para quem tem o módulo dele (sem 403
 * para quem não tem: a célula não vem). As leituras estão em `readDashboardExtras`. */

export const runtime = 'nodejs';
const ROUTE = 'GET /api/dashboard/extras';

export async function GET(request: NextRequest) {
  const startedAt = performance.now();
  const durations: Record<string, number> = {};
  const { profile, developer, modules } = await getRouteAccess();
  durations.auth = performance.now() - startedAt;
  const respond = (body: DashboardExtrasResponse | { error: string }, status: number) => {
    durations.total = performance.now() - startedAt;
    if (durations.total > SLOW_ROUTE_MS) logRouteTiming(ROUTE, durations, { actorId: profile?.id, status });
    return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store', 'Server-Timing': serverTimingHeader(durations) } });
  };
  if (!profile) return respond({ error: 'Perfil não provisionado. Contate o gestor.' }, 403);
  const query = parseExtrasQuery(request.nextUrl.searchParams);
  if (!query.ok) return respond({ error: query.error }, 400);
  if (query.workId && !profile.workIds.includes(query.workId)) return respond({ error: 'Obra não liberada para o seu usuário.' }, 403);
  try {
    const body = await readDashboardExtras({
      workIds: query.workId ? [query.workId] : profile.workIds,
      range: { start: query.start, end: query.end, today: todayInSaoPaulo() },
      access: { developer, modules },
      includeSafety: query.includeSafety,
      actorId: profile.id,
      label: ROUTE,
      durations,
    });
    return respond(body, 200);
  } catch (cause) {
    logRouteError(ROUTE, cause, { actorId: profile.id });
    return respond({ error: 'Não foi possível carregar os dados dos quadros. Tente de novo em instantes.' }, 502);
  }
}
