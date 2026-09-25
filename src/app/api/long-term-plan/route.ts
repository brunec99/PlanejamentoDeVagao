import { NextResponse, type NextRequest } from 'next/server';
import { getRouteProfile } from '@/infrastructure/auth/supabase-server';
import { getServiceClient } from '@/infrastructure/repositories/supabase/client';
import { emptyPlanDocument, isPlanError, validatePlanDocument, type LongTermPlan } from '@/domain/long-term-plan';

export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'no-store' };
const responseError = (error: string, status: number) => NextResponse.json({ error }, { status, headers });
const databaseError = (code?: string) => responseError(
  code === '42P01' || code === 'PGRST205'
    ? 'Aplique a migração 0024_long_term_plans.sql no Supabase para salvar o planejamento de longo prazo.'
    : 'Não foi possível acessar o planejamento de longo prazo. Tente novamente.', 502);
const conflict = () => responseError('Outra pessoa salvou este planejamento enquanto você editava. Recarregue para ver a versão atual antes de continuar.', 409);
type Row = { work_id: string; document: unknown; revision: number; updated_at: string; updated_by: string; synced_revision?: number | null; synced_sequence_id?: string | null; synced_at?: string | null; synced_by?: string | null };
const toPlan = (row: Row): LongTermPlan => ({
  workId: row.work_id, revision: row.revision, updatedAt: row.updated_at, updatedBy: row.updated_by, document: row.document as LongTermPlan['document'],
  ...(row.synced_revision && row.synced_sequence_id && row.synced_at ? { sync: { revision: row.synced_revision, sequenceId: row.synced_sequence_id, at: row.synced_at, by: row.synced_by ?? '' } } : {}),
});

export async function GET(request: NextRequest) {
  try {
    const workId = request.nextUrl.searchParams.get('workId') ?? '';
    if (!workId) return responseError('Obra não informada.', 400);
    const profile = await getRouteProfile();
    if (!profile?.workIds.includes(workId)) return responseError('Você não tem acesso a esta obra.', 403);
    const { data, error } = await getServiceClient().from('long_term_plans').select('*').eq('work_id', workId).maybeSingle();
    if (error) return databaseError(error.code);
    // Obra sem plano ainda: devolve um documento vazio com revisão 0, que o primeiro salvamento cria.
    const plan: LongTermPlan = data ? toPlan(data as Row) : { workId, revision: 0, document: emptyPlanDocument() };
    return NextResponse.json({ plan }, { headers });
  } catch { return responseError('Falha ao consultar o planejamento de longo prazo.', 502); }
}

export async function PUT(request: NextRequest) {
  let body: unknown;
  try { body = await request.json(); } catch { return responseError('Corpo da requisição inválido.', 400); }
  if (!body || typeof body !== 'object') return responseError('Corpo da requisição inválido.', 400);
  const { workId, revision, document } = body as Record<string, unknown>;
  if (typeof workId !== 'string' || !workId) return responseError('Obra não informada.', 400);
  if (typeof revision !== 'number' || !Number.isInteger(revision) || revision < 0) return responseError('Revisão inválida.', 400);
  try {
    const profile = await getRouteProfile();
    if (!profile?.workIds.includes(workId)) return responseError('Você não tem acesso a esta obra.', 403);
    if (profile.role === 'viewer') return responseError('Seu perfil permite apenas consulta.', 403);
    let valid: LongTermPlan['document'];
    try { valid = validatePlanDocument(document); }
    catch (cause) { return responseError(isPlanError(cause) ? cause.message : 'Plano inválido.', 400); }
    const client = getServiceClient();
    const row = { document: valid, revision: revision + 1, updated_at: new Date().toISOString(), updated_by: profile.id };
    if (revision === 0) {
      const { data, error } = await client.from('long_term_plans').insert({ work_id: workId, ...row }).select('*').single();
      if (error) return error.code === '23505' ? conflict() : databaseError(error.code);
      return NextResponse.json({ plan: toPlan(data as Row) }, { headers });
    }
    const { data, error } = await client.from('long_term_plans').update(row).eq('work_id', workId).eq('revision', revision).select('*');
    if (error) return databaseError(error.code);
    if (!data?.length) return conflict();
    return NextResponse.json({ plan: toPlan(data[0] as Row) }, { headers });
  } catch { return responseError('Falha ao salvar o planejamento de longo prazo.', 502); }
}
