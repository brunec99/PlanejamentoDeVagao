import { NextResponse, type NextRequest } from 'next/server';
import { getRouteProfile } from '@/infrastructure/auth/supabase-server';
import { getServiceClient } from '@/infrastructure/repositories/supabase/client';
import { normalizeWeekOne } from '@/domain/week-numbering';
import { validateDate } from '@/domain/validation';

export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'no-store' };
const responseError = (error: string, status: number) => NextResponse.json({ error }, { status, headers });
const missingTable = (code?: string) => code === '42P01' || code === 'PGRST205';
/** 42703 = coluna inexistente no Postgres; PGRST204 = coluna fora do cache de esquema do PostgREST. */
const missingColumn = (code?: string) => code === '42703' || code === 'PGRST204';
const MIGRATION_0025 = 'Aplique a migração 0025_work_settings.sql no Supabase para salvar a semana 1.';
const MIGRATION_0029 = 'Aplique a migração 0029_work_location.sql no Supabase para salvar o local da obra.';

type Row = { week_one_start?: string | null; place?: string | null; latitude?: number | null; longitude?: number | null };
type Location = { place: string; latitude: number; longitude: number };

const UNAVAILABLE = { available: false, weekOneStart: null, place: null, latitude: null, longitude: null, locationAvailable: false };
const settingsOf = (row: Row | null, locationAvailable: boolean) => ({
  available: true,
  weekOneStart: row?.week_one_start ?? null,
  place: locationAvailable ? (row?.place ?? null) : null,
  latitude: locationAvailable ? (row?.latitude ?? null) : null,
  longitude: locationAvailable ? (row?.longitude ?? null) : null,
  locationAvailable,
});

/** Lê a linha da obra. Sem as colunas da 0029 relê só a semana 1 e marca o local como indisponível,
 * para a semana 1 continuar funcionando numa base que ainda não recebeu a migração nova. */
async function readRow(workId: string): Promise<{ row: Row | null; locationAvailable: boolean; error: { code?: string } | null }> {
  const table = () => getServiceClient().from('work_settings');
  const full = await table().select('week_one_start, place, latitude, longitude').eq('work_id', workId).maybeSingle();
  if (!full.error) return { row: (full.data as Row | null) ?? null, locationAvailable: true, error: null };
  if (!missingColumn(full.error.code)) return { row: null, locationAvailable: true, error: full.error };
  const partial = await table().select('week_one_start').eq('work_id', workId).maybeSingle();
  return { row: (partial.data as Row | null) ?? null, locationAvailable: false, error: partial.error };
}

/** Valida o local vindo do cliente: nome de 1 a 120 caracteres e coordenadas dentro do globo. Devolve
 * a mensagem em vez de lançar, para a resposta 400 sair numa linha. */
function parseLocation(input: unknown): Location | string {
  if (!input || typeof input !== 'object') return 'Local da obra inválido.';
  const { place, latitude, longitude } = input as Record<string, unknown>;
  const name = typeof place === 'string' ? place.trim() : '';
  if (!name || name.length > 120) return 'Informe o local da obra com até 120 caracteres.';
  if (typeof latitude !== 'number' || !Number.isFinite(latitude) || Math.abs(latitude) > 90) return 'Latitude inválida (de -90 a 90).';
  if (typeof longitude !== 'number' || !Number.isFinite(longitude) || Math.abs(longitude) > 180)
    return 'Longitude inválida (de -180 a 180).';
  return { place: name, latitude, longitude };
}

/** Sem a migração 0025 a leitura responde "indisponível" em vez de erro: a planilha segue com a
 * numeração automática, e só a gravação pede a migração. Sem a 0029, só o local fica indisponível. */
export async function GET(request: NextRequest) {
  const workId = request.nextUrl.searchParams.get('workId') ?? '';
  if (!workId) return responseError('Obra não informada.', 400);
  try {
    const profile = await getRouteProfile();
    if (!profile?.workIds.includes(workId)) return responseError('Você não tem acesso a esta obra.', 403);
    const { row, locationAvailable, error } = await readRow(workId);
    if (error)
      return missingTable(error.code)
        ? NextResponse.json(UNAVAILABLE, { headers })
        : responseError('Não foi possível ler as configurações da obra.', 502);
    return NextResponse.json(settingsOf(row, locationAvailable), { headers });
  } catch {
    return responseError('Falha ao ler as configurações da obra.', 502);
  }
}

/** Atualização parcial: só as chaves presentes no corpo mudam (`weekOneStart` e/ou `location`); o
 * resto vem da linha atual. `location: null` limpa as três colunas. */
export async function PUT(request: NextRequest) {
  let body: { workId?: unknown; weekOneStart?: unknown; location?: unknown };
  try {
    body = await request.json();
  } catch {
    return responseError('Corpo da requisição inválido.', 400);
  }
  if (!body || typeof body !== 'object') return responseError('Corpo da requisição inválido.', 400);
  const workId = typeof body.workId === 'string' ? body.workId : '';
  if (!workId) return responseError('Obra não informada.', 400);
  const hasWeekOne = 'weekOneStart' in body;
  const hasLocation = 'location' in body;
  if (!hasWeekOne && !hasLocation) return responseError('Nada para salvar.', 400);
  let weekOneStart: string | null = null;
  if (hasWeekOne && body.weekOneStart !== null) {
    if (typeof body.weekOneStart !== 'string') return responseError('Data da semana 1 inválida.', 400);
    try {
      validateDate(body.weekOneStart);
      weekOneStart = normalizeWeekOne(body.weekOneStart);
    } catch {
      return responseError('Data da semana 1 inválida.', 400);
    }
  }
  let location: Location | null = null;
  if (hasLocation && body.location !== null) {
    const parsed = parseLocation(body.location);
    if (typeof parsed === 'string') return responseError(parsed, 400);
    location = parsed;
  }
  try {
    const profile = await getRouteProfile();
    if (!profile?.workIds.includes(workId)) return responseError('Você não tem acesso a esta obra.', 403);
    if (profile.role === 'viewer') return responseError('Seu perfil permite apenas consulta.', 403);
    const current = await readRow(workId);
    if (current.error)
      return responseError(missingTable(current.error.code) ? MIGRATION_0025 : 'Não foi possível ler as configurações da obra.', 502);
    if (hasLocation && !current.locationAvailable) return responseError(MIGRATION_0029, 502);
    const row = current.row;
    const merged: Row & { work_id: string; updated_at: string; updated_by: string } = {
      work_id: workId,
      week_one_start: hasWeekOne ? weekOneStart : (row?.week_one_start ?? null),
      updated_at: new Date().toISOString(),
      updated_by: profile.id,
    };
    // Só manda as colunas da 0029 quando elas existem; senão o PostgREST recusa a linha inteira.
    if (current.locationAvailable) {
      merged.place = hasLocation ? (location?.place ?? null) : (row?.place ?? null);
      merged.latitude = hasLocation ? (location?.latitude ?? null) : (row?.latitude ?? null);
      merged.longitude = hasLocation ? (location?.longitude ?? null) : (row?.longitude ?? null);
    }
    const { error } = await getServiceClient().from('work_settings').upsert(merged);
    if (error)
      return responseError(
        missingTable(error.code)
          ? MIGRATION_0025
          : missingColumn(error.code)
            ? MIGRATION_0029
            : 'Não foi possível salvar as configurações da obra.',
        502,
      );
    return NextResponse.json(settingsOf(merged, current.locationAvailable), { headers });
  } catch {
    return responseError('Falha ao salvar as configurações da obra.', 502);
  }
}
