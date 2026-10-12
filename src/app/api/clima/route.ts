import { NextResponse, type NextRequest } from 'next/server';
import { getRouteProfile } from '@/infrastructure/auth/supabase-server';
import { getServiceClient } from '@/infrastructure/repositories/supabase/client';
import { fetchWeekWeather } from '@/infrastructure/integrations/weather/open-meteo';
import { todayInSaoPaulo } from '@/infrastructure/clock';
import { startOfWeek, validateDate } from '@/domain/validation';
import type { WeatherResponse } from '@/domain/weather';

export const runtime = 'nodejs';
const noStore = { 'Cache-Control': 'no-store' };
/** A semana muda pouco em 15 min; o navegador reaproveita entre o PDF do planejamento e o do fechamento. */
const cached = { 'Cache-Control': 'private, max-age=900' };
const responseError = (error: string, status: number) => NextResponse.json({ error }, { status, headers: noStore });
const missingSchema = (code?: string) => code === '42P01' || code === 'PGRST205' || code === '42703' || code === 'PGRST204';
const unavailable = (reason: 'sem_local' | 'indisponivel', message: string) =>
  NextResponse.json({ available: false, reason, message } satisfies WeatherResponse, { headers: noStore });

/** Tempo da semana para os PDFs do curto prazo. Quem só consulta também pode ler. Toda falha depois
 * da autorização responde 200 com `available: false`: o PDF sai sem a faixa do tempo, nunca deixa
 * de sair. */
export async function GET(request: NextRequest) {
  const workId = request.nextUrl.searchParams.get('workId') ?? '';
  if (!workId) return responseError('Obra não informada.', 400);
  const semana = request.nextUrl.searchParams.get('semana') ?? '';
  if (!semana) return responseError('Semana não informada.', 400);
  let weekStart: string;
  try {
    validateDate(semana);
    weekStart = startOfWeek(semana);
  } catch {
    return responseError('Semana inválida: use AAAA-MM-DD.', 400);
  }
  try {
    const profile = await getRouteProfile();
    if (!profile?.workIds.includes(workId)) return responseError('Você não tem acesso a esta obra.', 403);
    const { data, error } = await getServiceClient()
      .from('work_settings')
      .select('place, latitude, longitude')
      .eq('work_id', workId)
      .maybeSingle();
    if (error)
      return missingSchema(error.code)
        ? unavailable('indisponivel', 'Aplique a migração 0029_work_location.sql no Supabase.')
        : unavailable('indisponivel', 'Previsão do tempo indisponível no momento.');
    const latitude = typeof data?.latitude === 'number' ? data.latitude : null;
    const longitude = typeof data?.longitude === 'number' ? data.longitude : null;
    if (latitude === null || longitude === null)
      return unavailable('sem_local', 'Informe o local da obra em Configurações da obra para o PDF trazer o tempo.');
    const week = await fetchWeekWeather({ latitude, longitude, weekStart, today: todayInSaoPaulo() });
    const body: WeatherResponse = { available: true, workId, place: typeof data?.place === 'string' ? data.place : '', ...week };
    return NextResponse.json(body, { headers: cached });
  } catch {
    return unavailable('indisponivel', 'Previsão do tempo indisponível no momento.');
  }
}
