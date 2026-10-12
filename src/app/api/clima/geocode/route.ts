import { NextResponse, type NextRequest } from 'next/server';
import { getRouteProfile } from '@/infrastructure/auth/supabase-server';
import { searchPlaces } from '@/infrastructure/integrations/weather/open-meteo';

export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'no-store' };
const responseError = (error: string, status: number) => NextResponse.json({ error }, { status, headers });

/** Busca de local para Configurações da obra. Qualquer pessoa logada pode buscar; quem grava é a
 * rota de work_settings, que confere o perfil. */
export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get('q') ?? '').trim();
  if (q.length < 2 || q.length > 80) return responseError('Digite de 2 a 80 caracteres para buscar o local.', 400);
  try {
    const profile = await getRouteProfile();
    if (!profile) return responseError('Faça login para buscar o local.', 401);
  } catch {
    return responseError('Não foi possível conferir seu acesso.', 502);
  }
  try {
    return NextResponse.json({ places: await searchPlaces(q) }, { headers });
  } catch {
    return responseError('Não foi possível buscar o local agora. Tente de novo em instantes.', 502);
  }
}
