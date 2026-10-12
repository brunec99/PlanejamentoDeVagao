import { NextResponse, type NextRequest } from 'next/server';
import { getRouteProfile } from '@/infrastructure/auth/supabase-server';
import { searchPlaces } from '@/infrastructure/integrations/weather/open-meteo';
import { parseCoordinates, searchAddresses } from '@/infrastructure/integrations/geocoding/nominatim';

export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'no-store' };
const responseError = (error: string, status: number) => NextResponse.json({ error }, { status, headers });

/** Busca de local para Configurações da obra. Qualquer pessoa logada pode buscar; quem grava é a
 * rota de work_settings, que confere o perfil. Três caminhos, nesta ordem (12/10/2026): coordenadas
 * coladas; endereço completo pelo Nominatim (rua, número, bairro); e, se nada vier, o nome do lugar
 * pela geocodificação do Open-Meteo, que só conhece cidades e bairros. */
export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get('q') ?? '').trim();
  if (q.length < 2 || q.length > 120) return responseError('Digite de 2 a 120 caracteres para buscar o local.', 400);
  try {
    const profile = await getRouteProfile();
    if (!profile) return responseError('Faça login para buscar o local.', 401);
  } catch {
    return responseError('Não foi possível conferir seu acesso.', 502);
  }
  const typed = parseCoordinates(q);
  if (typed) return NextResponse.json({ places: [typed], source: 'coordenadas' }, { headers });
  let addresses: Awaited<ReturnType<typeof searchAddresses>> = [];
  let addressesFailed = false;
  try {
    addresses = await searchAddresses(q);
  } catch {
    addressesFailed = true;
  }
  if (addresses.length) return NextResponse.json({ places: addresses, source: 'nominatim' }, { headers });
  try {
    return NextResponse.json({ places: await searchPlaces(q), source: 'open-meteo' }, { headers });
  } catch {
    if (addressesFailed) return responseError('Não foi possível buscar o local agora. Tente de novo em instantes.', 502);
    return NextResponse.json({ places: [], source: 'open-meteo' }, { headers });
  }
}
