import { NextResponse, type NextRequest } from 'next/server';
import { requireModuleAccess } from '@/infrastructure/auth/supabase-server';
import type { PendingResponse } from '@/domain/pending-board';
import { listPeople, loadPending, PendingUnavailableError } from '@/infrastructure/repositories/supabase/pending-repository';
import { logRouteError } from '@/infrastructure/log';

export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'no-store' };
const responseError = (error: string, status: number) => NextResponse.json({ error }, { status, headers });

/** Lista de pendência de uma obra (aba 2): cards com a data viva dos ligados ao médio e ao longo prazo,
 * checklists, conversa e as pessoas da obra. Lê quem abre a aba 2 (módulo `vagoes`) e tem a obra. Sem a
 * migração 0043 responde `available: false` com as listas vazias: só a lista de pendência fica fora. */
export async function GET(request: NextRequest) {
  const workId = request.nextUrl.searchParams.get('workId') ?? '';
  if (!workId) return responseError('Obra não informada.', 400);
  const gate = await requireModuleAccess('vagoes');
  if (gate.error) return gate.error;
  const { profile } = gate.access;
  if (!profile) return responseError('Perfil não provisionado. Contate o gestor.', 403);
  if (!profile.workIds.includes(workId)) return responseError('Você não tem acesso a esta obra.', 403);
  const who = { admin: profile.role === 'admin', actorId: profile.id };
  try {
    const [data, people] = await Promise.all([loadPending(workId), listPeople(workId)]);
    return NextResponse.json({ available: true, people, ...who, ...data } satisfies PendingResponse, { headers });
  } catch (error) {
    if (error instanceof PendingUnavailableError)
      return NextResponse.json(
        { available: false, people: [], ...who, cards: [], checklists: [], items: [], messages: [] } satisfies PendingResponse,
        { headers },
      );
    logRouteError('GET /api/pendencias', error, { actorId: profile.id, workId });
    return responseError('Não foi possível carregar a lista de pendência da obra.', 502);
  }
}
