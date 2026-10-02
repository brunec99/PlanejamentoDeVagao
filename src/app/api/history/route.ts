import { NextResponse, type NextRequest } from 'next/server';
import { getRouteProfile } from '@/infrastructure/auth/supabase-server';
import { getServiceClient } from '@/infrastructure/repositories/supabase/client';
import { SupabasePlanningRepository } from '@/infrastructure/repositories/supabase/planning-repository';
import { visibleEntityIds } from '@/application/use-cases/scope-planning';
import { logRouteError } from '@/infrastructure/log';
import type { HistoryEvent } from '@/domain/entities';

export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'no-store' };
const MAX_IDS = 300;
const MAX_LIMIT = 200;

/** Histórico por entidade. Saiu do snapshot em 01/10/2026: ele só cresce e era lido inteiro em
 * cada requisição. Aqui a tela pede os eventos das entidades que está mostrando (um vagão e as
 * atividades dele, uma tarefa do plano), e o servidor confere que todas pertencem a uma obra a
 * que a pessoa tem acesso antes de responder. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const workId = params.get('workId') ?? '';
  const ids = [
    ...new Set(
      (params.get('entityIds') ?? '')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean),
    ),
  ];
  const action = params.get('action') ?? undefined;
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(params.get('limit') ?? 100) || 100));
  if (!workId) return NextResponse.json({ error: 'Obra não informada.' }, { status: 400, headers });
  if (!ids.length) return NextResponse.json({ events: [] }, { headers });
  if (ids.length > MAX_IDS)
    return NextResponse.json({ error: `Peça o histórico de até ${MAX_IDS} registros por vez.` }, { status: 400, headers });
  const profile = await getRouteProfile();
  if (!profile) return NextResponse.json({ error: 'Perfil não provisionado. Contate o gestor.' }, { status: 403, headers });
  if (!profile.workIds.includes(workId)) return NextResponse.json({ error: 'Você não tem acesso a esta obra.' }, { status: 403, headers });
  try {
    const snapshot = await new SupabasePlanningRepository().getSnapshot({ workIds: [workId] });
    const visible = visibleEntityIds(snapshot, workId);
    const allowed = ids.filter(id => visible.has(id));
    if (!allowed.length) return NextResponse.json({ events: [] }, { headers });
    let query = getServiceClient()
      .from('history_events')
      .select('*')
      .in('entity_id', allowed)
      .order('occurred_at', { ascending: false })
      .limit(limit);
    if (action) query = query.eq('action', action);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const events: HistoryEvent[] = (
      data as {
        id: string;
        entity_id: string;
        entity_type: string;
        action: string;
        author_id: string;
        occurred_at: string;
        changes: Record<string, unknown>;
      }[]
    ).map(r => ({
      id: r.id,
      entityId: r.entity_id,
      entityType: r.entity_type,
      action: r.action,
      authorId: r.author_id,
      occurredAt: r.occurred_at,
      changes: r.changes,
    }));
    return NextResponse.json({ events }, { headers });
  } catch (cause) {
    logRouteError('GET /api/history', cause, { actorId: profile.id, workId, ids: ids.length });
    return NextResponse.json({ error: 'Não foi possível consultar o histórico.' }, { status: 502, headers });
  }
}
