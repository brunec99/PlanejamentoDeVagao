import { NextResponse } from 'next/server';
import { getPlanning } from '@/application/use-cases/get-planning';
import { SupabasePlanningRepository } from '@/infrastructure/repositories/supabase/planning-repository';
import { getRouteAccess } from '@/infrastructure/auth/supabase-server';
import { scopePlanning, slimForModules } from '@/application/use-cases/scope-planning';
import { todayInSaoPaulo } from '@/infrastructure/clock';
import { logRouteError, logRouteTiming, serverTimingHeader, SLOW_ROUTE_MS } from '@/infrastructure/log';
import type { PlanningData } from '@/domain/entities';
export const runtime = 'nodejs';
const ROUTE = 'GET /api/planning';
export async function GET() {
  // Tempo por fase (`auth`, `snapshot`, `total`) em `Server-Timing`, como na rota de comandos: a carga
  // completa é a outra requisição que a obra sente quando demora.
  const startedAt = performance.now();
  const durations: Record<string, number> = {};
  const { profile, developer, modules } = await getRouteAccess();
  durations.auth = performance.now() - startedAt;
  const respond = (body: unknown, status: number) => {
    durations.total = performance.now() - startedAt;
    if (durations.total > SLOW_ROUTE_MS) logRouteTiming(ROUTE, durations, { actorId: profile?.id, status });
    return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store', 'Server-Timing': serverTimingHeader(durations) } });
  };
  if (!profile) return respond({ error: 'Perfil não provisionado. Contate o gestor.' }, 403);
  const snapshotStartedAt = performance.now();
  try {
    const repository = new SupabasePlanningRepository();
    const scope = { workIds: profile.workIds };
    // Fora do desenvolvimento, o payload leva o que o curto prazo usa mais o que os módulos liberados
    // para a pessoa leem; o recorte vem antes de `getPlanning`, para os campos derivados (status dos
    // vagões) saírem coerentes com ele.
    const trim = developer ? (data: PlanningData) => data : (data: PlanningData) => slimForModules(data, modules);
    const planning = await getPlanning(
      {
        getSnapshot: async () => trim(scopePlanning(await repository.getSnapshot(scope), profile.id)),
        transaction: operation => repository.transaction(operation, scope),
        commit: operation => repository.commit(operation, scope),
      },
      todayInSaoPaulo(),
    );
    durations.snapshot = performance.now() - snapshotStartedAt;
    return respond({ ...planning, actorId: profile.id }, 200);
  } catch (cause) {
    durations.snapshot = performance.now() - snapshotStartedAt;
    logRouteError(ROUTE, cause, { actorId: profile.id });
    return respond({ error: 'Não foi possível carregar o planejamento. Tente de novo em instantes.' }, 502);
  }
}
