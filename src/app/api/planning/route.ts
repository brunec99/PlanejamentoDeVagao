import { NextResponse } from 'next/server';
import { getPlanning } from '@/application/use-cases/get-planning';
import { SupabasePlanningRepository } from '@/infrastructure/repositories/supabase/planning-repository';
import { getRouteAccess } from '@/infrastructure/auth/supabase-server';
import { scopePlanning, slimForShortTerm } from '@/application/use-cases/scope-planning';
import { todayInSaoPaulo } from '@/infrastructure/clock';
import { logRouteError } from '@/infrastructure/log';
import type { PlanningData } from '@/domain/entities';
export const runtime = 'nodejs';
export async function GET() {
  const { profile, developer } = await getRouteAccess();
  if (!profile) return NextResponse.json({ error: 'Perfil não provisionado. Contate o gestor.' }, { status: 403 });
  try {
    const repository = new SupabasePlanningRepository();
    const scope = { workIds: profile.workIds };
    // Fora do desenvolvimento, o payload leva só o que o curto prazo usa; o recorte vem antes de
    // `getPlanning`, para os campos derivados (status dos vagões) saírem coerentes com ele.
    const trim = developer ? (data: PlanningData) => data : slimForShortTerm;
    const planning = await getPlanning(
      {
        getSnapshot: async () => trim(scopePlanning(await repository.getSnapshot(scope), profile.id)),
        transaction: operation => repository.transaction(operation, scope),
      },
      todayInSaoPaulo(),
    );
    return NextResponse.json({ ...planning, actorId: profile.id }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (cause) {
    logRouteError('GET /api/planning', cause, { actorId: profile.id });
    return NextResponse.json({ error: 'Não foi possível carregar o planejamento. Tente de novo em instantes.' }, { status: 502 });
  }
}
