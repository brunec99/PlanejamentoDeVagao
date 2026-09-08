import { NextResponse } from 'next/server';
import { applyCommand, type Command } from '@/application/use-cases/commands';
import { SupabasePlanningRepository } from '@/infrastructure/repositories/supabase/planning-repository';
import { getRouteProfile } from '@/infrastructure/auth/supabase-server';
import { DEMO_DATE } from '@/mocks/planning';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  const profile = await getRouteProfile();
  if (!profile) return NextResponse.json({ error: 'Perfil não provisionado. Contate o gestor.' }, { status: 403 });
  let command: Command;
  try { command = await request.json(); }
  catch { return NextResponse.json({ error: 'Corpo da requisição inválido.' }, { status: 400 }); }
  try {
    const context = { actorId: profile.id, today: DEMO_DATE, now: `${DEMO_DATE}T${new Date().toISOString().slice(11)}`, newId: () => crypto.randomUUID() };
    const id = await new SupabasePlanningRepository().transaction(draft => applyCommand(draft, command, context));
    return NextResponse.json({ id }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Falha ao aplicar o comando.' }, { status: 400 });
  }
}
