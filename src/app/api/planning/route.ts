import { NextResponse } from 'next/server';
import { getPlanning } from '@/application/use-cases/get-planning';
import { SupabasePlanningRepository } from '@/infrastructure/repositories/supabase/planning-repository';
import { getRouteProfile } from '@/infrastructure/auth/supabase-server';
import { DEMO_DATE } from '@/mocks/planning';
export const runtime = 'nodejs';
export async function GET() {
  const profile = await getRouteProfile();
  if (!profile) return NextResponse.json({ error: 'Perfil não provisionado. Contate o gestor.' }, { status: 403 });
  const planning = await getPlanning(new SupabasePlanningRepository(), DEMO_DATE);
  return NextResponse.json({ ...planning, actorId: profile.id }, { headers: { 'Cache-Control': 'no-store' } });
}
