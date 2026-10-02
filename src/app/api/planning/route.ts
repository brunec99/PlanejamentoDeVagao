import { NextResponse } from 'next/server';
import { getPlanning } from '@/application/use-cases/get-planning';
import { SupabasePlanningRepository } from '@/infrastructure/repositories/supabase/planning-repository';
import { getRouteProfile } from '@/infrastructure/auth/supabase-server';
import { scopePlanning } from '@/application/use-cases/scope-planning';
import { todayInSaoPaulo } from '@/infrastructure/clock';
import { logRouteError } from '@/infrastructure/log';
export const runtime = 'nodejs';
export async function GET() {
  const profile = await getRouteProfile();
  if (!profile) return NextResponse.json({ error: 'Perfil não provisionado. Contate o gestor.' }, { status: 403 });
  try {
    const repository = new SupabasePlanningRepository();
    const scope = { workIds: profile.workIds };
    const planning = await getPlanning(
      {
        getSnapshot: async () => scopePlanning(await repository.getSnapshot(scope), profile.id),
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
