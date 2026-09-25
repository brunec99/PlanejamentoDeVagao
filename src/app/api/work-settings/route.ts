import { NextResponse, type NextRequest } from 'next/server';
import { getRouteProfile } from '@/infrastructure/auth/supabase-server';
import { getServiceClient } from '@/infrastructure/repositories/supabase/client';
import { normalizeWeekOne } from '@/domain/week-numbering';
import { validateDate } from '@/domain/validation';

export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'no-store' };
const responseError = (error: string, status: number) => NextResponse.json({ error }, { status, headers });
const missingTable = (code?: string) => code === '42P01' || code === 'PGRST205';

/** Sem a migração 0025 a leitura responde "indisponível" em vez de erro: a planilha segue com a
 * numeração automática, e só a gravação pede a migração. */
export async function GET(request: NextRequest) {
  const workId = request.nextUrl.searchParams.get('workId') ?? '';
  if (!workId) return responseError('Obra não informada.', 400);
  try {
    const profile = await getRouteProfile();
    if (!profile?.workIds.includes(workId)) return responseError('Você não tem acesso a esta obra.', 403);
    const { data, error } = await getServiceClient().from('work_settings').select('week_one_start').eq('work_id', workId).maybeSingle();
    if (error) return missingTable(error.code)
      ? NextResponse.json({ available: false, weekOneStart: null }, { headers })
      : responseError('Não foi possível ler as configurações da obra.', 502);
    return NextResponse.json({ available: true, weekOneStart: data?.week_one_start ?? null }, { headers });
  } catch { return responseError('Falha ao ler as configurações da obra.', 502); }
}

export async function PUT(request: NextRequest) {
  let body: { workId?: unknown; weekOneStart?: unknown };
  try { body = await request.json(); } catch { return responseError('Corpo da requisição inválido.', 400); }
  const workId = typeof body.workId === 'string' ? body.workId : '';
  if (!workId) return responseError('Obra não informada.', 400);
  let weekOneStart: string | null = null;
  if (body.weekOneStart !== null) {
    if (typeof body.weekOneStart !== 'string') return responseError('Data da semana 1 inválida.', 400);
    try { validateDate(body.weekOneStart); weekOneStart = normalizeWeekOne(body.weekOneStart); }
    catch { return responseError('Data da semana 1 inválida.', 400); }
  }
  try {
    const profile = await getRouteProfile();
    if (!profile?.workIds.includes(workId)) return responseError('Você não tem acesso a esta obra.', 403);
    if (profile.role === 'viewer') return responseError('Seu perfil permite apenas consulta.', 403);
    const { error } = await getServiceClient().from('work_settings').upsert({
      work_id: workId, week_one_start: weekOneStart, updated_at: new Date().toISOString(), updated_by: profile.id,
    });
    if (error) return responseError(missingTable(error.code)
      ? 'Aplique a migração 0025_work_settings.sql no Supabase para salvar a semana 1.'
      : 'Não foi possível salvar as configurações da obra.', 502);
    return NextResponse.json({ available: true, weekOneStart }, { headers });
  } catch { return responseError('Falha ao salvar as configurações da obra.', 502); }
}
