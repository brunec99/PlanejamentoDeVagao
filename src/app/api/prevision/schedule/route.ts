import { NextResponse, type NextRequest } from 'next/server';
import { listActivities, PrevisionError } from '@/infrastructure/integrations/prevision/client';
import { getRouteProfile } from '@/infrastructure/auth/supabase-server';
import { getServiceClient } from '@/infrastructure/repositories/supabase/client';
import { SupabasePlanningRepository } from '@/infrastructure/repositories/supabase/planning-repository';
import { applyCommand, type ImportedActivity } from '@/application/use-cases/commands';
import { planSequenceRegeneration } from '@/application/use-cases/regenerate-sequence';
import { DEMO_DATE } from '@/mocks/planning';

export const runtime = 'nodejs';

type Row = { external_id: string; name: string; location: string; planned_start: string; planned_end: string; baseline_start: string | null; baseline_end: string | null; progress: number; synced_at: string };
const toActivity = (r: Row): ImportedActivity & { baselineStart?: string; baselineEnd?: string } => ({
  externalId: r.external_id, name: r.name, location: r.location,
  plannedStart: r.planned_start, plannedEnd: r.planned_end, progress: Number(r.progress),
  baselineStart: r.baseline_start ?? undefined, baselineEnd: r.baseline_end ?? undefined,
});

async function authorize(request: NextRequest) {
  const workId = request.nextUrl.searchParams.get('workId');
  if (!workId) return { error: NextResponse.json({ error: 'Obra não informada.' }, { status: 400 }) };
  const profile = await getRouteProfile();
  if (!profile) return { error: NextResponse.json({ error: 'Perfil não provisionado.' }, { status: 403 }) };
  if (!profile.workIds.includes(workId)) return { error: NextResponse.json({ error: 'Você não tem acesso a esta obra.' }, { status: 403 }) };
  return { workId, profile };
}

/** Lê o cronograma já salvo no Supabase — sem tocar no Prevision. */
export async function GET(request: NextRequest) {
  const auth = await authorize(request);
  if (auth.error) return auth.error;
  const { data, error } = await getServiceClient().from('prevision_activities').select('*').eq('work_id', auth.workId).order('planned_start');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const rows = (data as Row[]).map(toActivity);
  return NextResponse.json({ rows, syncedAt: data[0]?.synced_at ?? null }, { headers: { 'Cache-Control': 'no-store' } });
}

/** Atualiza o cache a partir do Prevision. Só acontece quando o usuário pede. */
export async function POST(request: NextRequest) {
  const auth = await authorize(request);
  if (auth.error) return auth.error;
  if (auth.profile.role === 'viewer') return NextResponse.json({ error: 'Seu perfil permite apenas consulta.' }, { status: 403 });

  const service = getServiceClient();
  const { data: work, error: workError } = await service.from('works').select('id, prevision_project_id').eq('id', auth.workId).single();
  if (workError || !work) return NextResponse.json({ error: 'Obra não encontrada.' }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const projectId = work.prevision_project_id ?? (typeof body.projectId === 'string' ? body.projectId : null);
  if (!projectId || !/^\d+$/.test(projectId)) return NextResponse.json({ error: 'Esta obra ainda não está vinculada a um projeto do Prevision.' }, { status: 400 });

  let rows: ImportedActivity[]; let skipped: number;
  try { ({ rows, skipped } = await listActivities(projectId)); }
  catch (error) {
    const status = error instanceof PrevisionError ? error.status : 502;
    return NextResponse.json({ error: error instanceof PrevisionError ? error.message : 'A resposta do Prevision não corresponde ao formato esperado.' }, { status });
  }

  const syncedAt = new Date().toISOString();
  const payload = rows.map(r => ({
    work_id: auth.workId, external_id: r.externalId, name: r.name, location: r.location,
    planned_start: r.plannedStart, planned_end: r.plannedEnd,
    baseline_start: r.baselineStart ?? null, baseline_end: r.baselineEnd ?? null,
    progress: r.progress, synced_at: syncedAt,
  }));
  if (payload.length > 0) {
    const { error } = await service.from('prevision_activities').upsert(payload, { onConflict: 'work_id,external_id' });
    if (error) return NextResponse.json({ error: `Falha ao salvar o cronograma: ${error.message}` }, { status: 500 });
  }

  // Depois de atualizar o cache, estica cada sequência da obra com o cronograma novo — só a
  // cauda ainda não liberada é apagada e recriada; vagões liberados nunca são tocados.
  const repo = new SupabasePlanningRepository();
  const snapshot = await repo.getSnapshot();
  const sequences = snapshot.sequences.filter(s => s.workId === auth.workId);
  const regeneration = [];
  for (const sequence of sequences) {
    const preview = planSequenceRegeneration(snapshot, sequence.id, projectId, rows, sequence.defaultTaktDays, DEMO_DATE);
    if (preview.aborted) {
      regeneration.push({ sequenceName: sequence.name, aborted: true, reason: preview.reason });
      continue;
    }
    try {
      const command = { type: 'regenerate_sequence' as const, sequenceId: sequence.id, projectId, rows, responsibleId: auth.profile.id };
      const context = { actorId: auth.profile.id, today: DEMO_DATE, now: new Date().toISOString(), newId: () => crypto.randomUUID() };
      await repo.transaction(draft => applyCommand(draft, command, context));
      regeneration.push({
        sequenceName: sequence.name, aborted: false,
        removedWagons: preview.removedWagonIds.length,
        createdWagons: preview.windows.length,
        placedActivities: preview.windows.reduce((sum, w) => sum + w.members.length, 0),
        removedWithProgressOrCriteria: preview.removedWithProgressOrCriteria,
        skippedTooLong: preview.skippedTooLong,
        skippedProgress: preview.skippedProgress,
      });
    } catch (error) {
      regeneration.push({ sequenceName: sequence.name, aborted: true, reason: error instanceof Error ? error.message : 'Falha ao regenerar.' });
    }
  }

  return NextResponse.json({ count: payload.length, skipped, syncedAt, regeneration }, { headers: { 'Cache-Control': 'no-store' } });
}
