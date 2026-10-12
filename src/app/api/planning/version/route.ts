import { NextResponse } from 'next/server';
import { SupabasePlanningRepository } from '@/infrastructure/repositories/supabase/planning-repository';
import { getRouteProfile } from '@/infrastructure/auth/supabase-server';
import { logRouteError } from '@/infrastructure/log';
export const runtime = 'nodejs';
const NO_STORE = { 'Cache-Control': 'no-store' };
/** Só a versão do planejamento (`planning_meta.version`), para a tela saber se há algo novo antes de
 * baixar o planejamento inteiro: a recarga completa a cada 2 min por aba estourava a cota grátis de
 * tráfego da Vercel e do Supabase (12/10/2026). Qualquer perfil provisionado pode conferir. */
export async function GET() {
  const profile = await getRouteProfile();
  if (!profile) return NextResponse.json({ error: 'Perfil não provisionado. Contate o gestor.' }, { status: 403, headers: NO_STORE });
  try {
    const version = await new SupabasePlanningRepository().getVersion();
    return NextResponse.json({ version }, { headers: NO_STORE });
  } catch (cause) {
    logRouteError('GET /api/planning/version', cause, { actorId: profile.id });
    return NextResponse.json({ error: 'Não foi possível conferir a versão do planejamento.' }, { status: 502, headers: NO_STORE });
  }
}
