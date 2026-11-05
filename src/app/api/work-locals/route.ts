import { NextResponse, type NextRequest } from 'next/server';
import { getRouteProfile } from '@/infrastructure/auth/supabase-server';
import { lobCommandTarget, planLobCommand, type LobMutation } from '@/application/use-cases/lob-commands';
import { parseWorkLocalCommand, workLocalsView, type WorkLocalCommand, type WorkLocalsResponse } from '@/application/use-cases/work-locals';
import {
  applyLobMutation,
  findWorkIdForEntity,
  loadLob,
  LobConflictError,
  LobUnavailableError,
} from '@/infrastructure/repositories/supabase/lob-repository';
import { commandContext } from '@/infrastructure/clock';
import { logRouteError } from '@/infrastructure/log';

export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'no-store' };
const responseError = (error: string, status: number) => NextResponse.json({ error }, { status, headers });

/** "Locais da obra" nas Configurações da obra: a lista da Linha de Balanço (`lob_locals`), que também é a da coluna
 * Local do curto prazo. Fica fora de `/api/lob`, restrita ao módulo do longo prazo, porque as Configurações da obra
 * são abertas a todos e quem preenche o curto prazo precisa cadastrar os locais sem acesso à aba 1. Lê quem tem a
 * obra; grava quem tem a obra e não é Consulta, só os quatro comandos do cadastro (criar, renomear, reordenar,
 * excluir), pelas mesmas regras da Linha de Balanço. Sem a migração 0038 responde `available: false`. */
export async function GET(request: NextRequest) {
  const workId = request.nextUrl.searchParams.get('workId') ?? '';
  if (!workId) return responseError('Obra não informada.', 400);
  const profile = await getRouteProfile().catch(() => null);
  if (!profile) return responseError('Perfil não provisionado. Contate o gestor.', 403);
  if (!profile.workIds.includes(workId)) return responseError('Você não tem acesso a esta obra.', 403);
  try {
    const body: WorkLocalsResponse = { available: true, ...workLocalsView(await loadLob(workId)) };
    return NextResponse.json(body, { headers });
  } catch (error) {
    if (error instanceof LobUnavailableError) return NextResponse.json({ available: false } satisfies WorkLocalsResponse, { headers });
    logRouteError('GET /api/work-locals', error, { actorId: profile.id, workId });
    return responseError('Não foi possível carregar os locais da obra.', 502);
  }
}

/** Um comando do cadastro por requisição; devolve a lista já atualizada. */
export async function POST(request: Request) {
  const profile = await getRouteProfile().catch(() => null);
  if (!profile) return responseError('Perfil não provisionado. Contate o gestor.', 403);
  if (profile.role === 'viewer') return responseError('Seu perfil permite apenas consulta.', 403);

  let command: WorkLocalCommand;
  try {
    command = parseWorkLocalCommand(await request.json().catch(() => null));
  } catch (error) {
    return responseError(error instanceof Error ? error.message : 'Comando inválido.', 400);
  }

  try {
    const target = lobCommandTarget(command);
    const workId = 'workId' in target ? target.workId : await findWorkIdForEntity(target.table, target.id);
    if (!workId) return responseError('Local não encontrado. Recarregue a página.', 404);
    if (!profile.workIds.includes(workId)) return responseError('Você não tem acesso a esta obra.', 403);

    const current = await loadLob(workId);
    let mutation: LobMutation;
    try {
      mutation = planLobCommand(current, command, commandContext(profile.id));
    } catch (error) {
      return responseError(error instanceof Error ? error.message : 'Comando inválido.', 400);
    }
    if (mutation.workId !== workId) return responseError('Você não tem acesso a esta obra.', 403);
    await applyLobMutation(mutation);
    const body: WorkLocalsResponse = { available: true, ...workLocalsView(await loadLob(workId)) };
    return NextResponse.json(body, { headers });
  } catch (error) {
    if (error instanceof LobUnavailableError) return responseError(error.message, 503);
    if (error instanceof LobConflictError) return responseError(error.message, 409);
    logRouteError('POST /api/work-locals', error, { actorId: profile.id, type: command.type });
    return responseError('Não foi possível gravar a alteração. Tente novamente.', 502);
  }
}
