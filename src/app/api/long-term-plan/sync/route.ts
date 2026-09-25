import { NextResponse, type NextRequest } from 'next/server';
import { getRouteProfile } from '@/infrastructure/auth/supabase-server';
import { getServiceClient } from '@/infrastructure/repositories/supabase/client';
import { SupabasePlanningRepository } from '@/infrastructure/repositories/supabase/planning-repository';
import { applyCommand } from '@/application/use-cases/commands';
import { longTermSlots, planLongTermSync } from '@/application/use-cases/sync-long-term-plan';
import type { LongTermPlanDocument } from '@/domain/long-term-plan';

export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'no-store' };
const responseError = (error: string, status: number) => NextResponse.json({ error }, { status, headers });
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

/** Gera os vagões da sequência a partir do plano de longo prazo salvo. Com `dryRun`, só devolve
 * o que mudaria, para a tela pedir confirmação antes de remover vagão, restrição ou avanço. O
 * plano vem do banco, nunca do navegador: gera-se exatamente a revisão que está salva. */
export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return responseError('Corpo da requisição inválido.', 400); }
  const { workId, revision, sequenceId, dryRun } = body ?? {};
  if (typeof workId !== 'string' || !workId) return responseError('Obra não informada.', 400);
  if (typeof sequenceId !== 'string' || !sequenceId) return responseError('Escolha a sequência de vagões.', 400);
  if (typeof revision !== 'number') return responseError('Revisão inválida.', 400);
  try {
    const profile = await getRouteProfile();
    if (!profile?.workIds.includes(workId)) return responseError('Você não tem acesso a esta obra.', 403);
    if (profile.role === 'viewer') return responseError('Seu perfil permite apenas consulta.', 403);
    const client = getServiceClient();
    const { data: row, error } = await client.from('long_term_plans').select('document, revision').eq('work_id', workId).maybeSingle();
    if (error) return responseError(error.code === '42P01' || error.code === 'PGRST205' ? 'Aplique a migração 0024_long_term_plans.sql no Supabase antes de gerar os vagões.' : 'Não foi possível ler o plano salvo.', 502);
    if (!row) return responseError('Salve o plano antes de gerar os vagões.', 400);
    if (row.revision !== revision) return responseError('O plano salvo mudou desde que você o abriu. Recarregue antes de gerar os vagões.', 409);
    const slots = longTermSlots(row.document as LongTermPlanDocument);
    if (!slots.length) return responseError('O plano não tem serviços.', 400);

    const repository = new SupabasePlanningRepository();
    const snapshot = await repository.getSnapshot();
    const sequence = snapshot.sequences.find(s => s.id === sequenceId);
    if (!sequence || sequence.workId !== workId) return responseError('Sequência não encontrada nesta obra.', 404);
    const date = today();
    const preview = planLongTermSync(snapshot, sequenceId, slots, date);
    if (preview.aborted) return responseError(preview.reason ?? 'Geração abortada.', 400);
    const frozen = snapshot.wagons.find(w => w.id === preview.frozenWagonId);
    const summary = {
      frontier: preview.frontier, frozenWagonNumber: frozen?.number,
      wagons: preview.wagons.length, activities: preview.wagons.reduce((sum, w) => sum + w.activities.length, 0),
      firstStart: preview.wagons[0]?.plannedStart, lastEnd: preview.wagons.at(-1)?.plannedEnd,
      keptWagons: preview.keptWagons, keptActivities: preview.keptActivities,
      removedWagons: preview.removedWagonIds.length, removedActivities: preview.removedActivityIds.length,
      removedRestrictions: preview.removedRestrictionIds.length, removedPending: preview.removedPendingIds.length,
      removedWithProgress: preview.removedWithProgress, skippedPast: preview.skippedPast,
    };
    if (dryRun) return NextResponse.json({ summary }, { headers });

    const context = { actorId: profile.id, today: date, now: new Date().toISOString(), newId: () => crypto.randomUUID() };
    await repository.transaction(draft => applyCommand(draft, { type: 'sync_long_term_plan', sequenceId, responsibleId: profile.id, slots }, context));
    const sync = { revision: row.revision, sequenceId, at: context.now, by: profile.id };
    // Os vagões já foram gravados; falhar aqui só deixa a tela sem saber da última geração.
    await client.from('long_term_plans').update({ synced_revision: sync.revision, synced_sequence_id: sequenceId, synced_at: sync.at, synced_by: sync.by }).eq('work_id', workId);
    return NextResponse.json({ summary, sync }, { headers });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Falha ao gerar os vagões.';
    if (message.includes('activities_origin_check')) return responseError('Aplique a migração 0026_long_term_wagons.sql no Supabase antes de gerar os vagões. Nada foi alterado.', 502);
    return responseError(message, 400);
  }
}
