import { NextResponse, type NextRequest } from 'next/server';
import { requireModuleAccess } from '@/infrastructure/auth/supabase-server';
import type { PendingSourceOptions } from '@/domain/pending-board';
import { pendingSourceOptions } from '@/application/use-cases/pending-commands';
import { loadSourceOptions } from '@/infrastructure/repositories/supabase/pending-repository';
import { logRouteError } from '@/infrastructure/log';

export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'no-store' };
const responseError = (error: string, status: number) => NextResponse.json({ error }, { status, headers });

/** A que uma pendência criada na aba 2 pode ser ligada (10/11/2026): as tarefas do plano vivo mais
 * recente do médio prazo e os serviços da Linha de Balanço que já têm bloco lançado, cada um com o início
 * atual. Mesma porta do quadro: quem abre a aba 2 (módulo `vagoes`) e tem a obra. Só leitura; a ligação é
 * conferida de novo no `create_card`. */
export async function GET(request: NextRequest) {
  const workId = request.nextUrl.searchParams.get('workId') ?? '';
  if (!workId) return responseError('Obra não informada.', 400);
  const gate = await requireModuleAccess('vagoes');
  if (gate.error) return gate.error;
  const { profile } = gate.access;
  if (!profile) return responseError('Perfil não provisionado. Contate o gestor.', 403);
  if (!profile.workIds.includes(workId)) return responseError('Você não tem acesso a esta obra.', 403);
  try {
    return NextResponse.json(pendingSourceOptions(await loadSourceOptions(workId)) satisfies PendingSourceOptions, { headers });
  } catch (error) {
    logRouteError('GET /api/pendencias/origens', error, { actorId: profile.id, workId });
    return responseError('Não foi possível carregar as tarefas e os serviços da obra.', 502);
  }
}
