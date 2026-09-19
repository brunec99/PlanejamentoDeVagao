import { NextResponse, type NextRequest } from 'next/server';
import { getRouteProfile } from '@/infrastructure/auth/supabase-server';
import { getServiceClient } from '@/infrastructure/repositories/supabase/client';
import { SupabasePlanningRepository } from '@/infrastructure/repositories/supabase/planning-repository';
import { validateFederation, type SavedFederation } from '@/domain/ifc-federation';

export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'no-store' };
const responseError = (error: string, status: number) => NextResponse.json({ error }, { status, headers });
const databaseError = (code: string) => responseError(
  code === '42P01' || code === 'PGRST205'
    ? 'Aplique a migração 0021_ifc_federations.sql no Supabase para salvar e abrir composições.'
    : 'Não foi possível acessar as composições salvas. Tente novamente.', 502);

export async function GET(request: NextRequest) {
  try {
    const workId = request.nextUrl.searchParams.get('workId') ?? '';
    if (!workId) return responseError('Obra não informada.', 400);
    const profile = await getRouteProfile();
    if (!profile?.workIds.includes(workId)) return responseError('Você não tem acesso a esta obra.', 403);
    const client = getServiceClient();
    const federations: SavedFederation[] = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await client.from('ifc_federations').select('*').eq('work_id', workId)
        .order('created_at', { ascending: false }).order('id').range(offset, offset + 999);
      if (error) return databaseError(error.code);
      federations.push(...data.map(row => ({ id: row.id, workId: row.work_id, name: row.name, versionIds: row.version_ids, createdAt: row.created_at, createdBy: row.created_by })));
      if (data.length < 1000) break;
    }
    return NextResponse.json({ federations }, { headers });
  } catch { return responseError('Falha ao consultar as composições.', 502); }
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try { body = await request.json(); } catch { return responseError('Corpo da requisição inválido.', 400); }
  if (!body || typeof body !== 'object' || !('workId' in body) || typeof body.workId !== 'string' || !body.workId) return responseError('Obra não informada.', 400);
  const workId = body.workId;
  try {
    const profile = await getRouteProfile();
    if (!profile?.workIds.includes(workId)) return responseError('Você não tem acesso a esta obra.', 403);
    if (profile.role === 'viewer') return responseError('Seu perfil permite apenas consulta.', 403);
    const snapshot = await new SupabasePlanningRepository().getSnapshot();
    let composition: ReturnType<typeof validateFederation>;
    try { composition = validateFederation(body, workId, snapshot.ifcModels, snapshot.ifcVersions); }
    catch (cause) { return responseError(cause instanceof Error ? cause.message : 'Composição inválida.', 400); }
    const federation: SavedFederation = { id: crypto.randomUUID(), workId, ...composition, createdAt: new Date().toISOString(), createdBy: profile.id };
    const { error } = await getServiceClient().from('ifc_federations').insert({
      id: federation.id, work_id: workId, name: federation.name, version_ids: federation.versionIds,
      created_at: federation.createdAt, created_by: profile.id,
    });
    if (error) return databaseError(error.code);
    return NextResponse.json({ federation }, { status: 201, headers });
  } catch { return responseError('Falha ao salvar a composição.', 502); }
}
