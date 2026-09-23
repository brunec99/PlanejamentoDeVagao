import { NextResponse } from 'next/server';
import { getPlanning } from '@/application/use-cases/get-planning';
import { SupabasePlanningRepository } from '@/infrastructure/repositories/supabase/planning-repository';
import { getRouteProfile } from '@/infrastructure/auth/supabase-server';
import { scopePlanning } from '@/application/use-cases/scope-planning';
export const runtime = 'nodejs';
export async function GET() {
  const profile = await getRouteProfile();
  if (!profile) return NextResponse.json({ error: 'Perfil não provisionado. Contate o gestor.' }, { status: 403 });
  const repository = new SupabasePlanningRepository();
  const today = new Intl.DateTimeFormat('en-CA', {timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const planning = await getPlanning({getSnapshot: async () => scopePlanning(await repository.getSnapshot(), profile.id), transaction: operation => repository.transaction(operation)}, today);
  return NextResponse.json({ ...planning, actorId: profile.id }, { headers: { 'Cache-Control': 'no-store' } });
}
