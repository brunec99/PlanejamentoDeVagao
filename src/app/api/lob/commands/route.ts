import { NextResponse } from 'next/server';
import { requireModuleAccess } from '@/infrastructure/auth/supabase-server';
import {
  isLobCommandError,
  lobCommandTarget,
  parseLobCommand,
  planLobCommand,
  type LobExtras,
  type LobMutation,
} from '@/application/use-cases/lob-commands';
import type { LobCommand } from '@/domain/lob';
import type { LongTermPlanDocument } from '@/domain/long-term-plan';
import {
  applyLobMutation,
  findWorkIdForEntity,
  getFlow,
  loadLob,
  LobConflictError,
  LobUnavailableError,
  photoFilesExist,
  withSignedUrls,
} from '@/infrastructure/repositories/supabase/lob-repository';
import { getServiceClient } from '@/infrastructure/repositories/supabase/client';
import { commandContext } from '@/infrastructure/clock';
import { logRouteError } from '@/infrastructure/log';

export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'no-store' };
const responseError = (error: string, status: number) => NextResponse.json({ error }, { status, headers });

/** O plano do Planejador da obra, para "Importar do Planejador". `undefined` sem plano. */
async function loadPlannerDocument(workId: string): Promise<LongTermPlanDocument | undefined> {
  const { data, error } = await getServiceClient().from('long_term_plans').select('document').eq('work_id', workId).maybeSingle();
  if (error) return undefined;
  return (data as { document: LongTermPlanDocument } | null)?.document;
}

/** Um comando por requisição: descobre a obra, confere o acesso, aplica as regras
 * (`planLobCommand`) sobre os dados atuais, grava e devolve a obra já atualizada. */
export async function POST(request: Request) {
  const gate = await requireModuleAccess('longo-prazo');
  if (gate.error) return gate.error;
  const { profile } = gate.access;
  if (!profile) return responseError('Perfil não provisionado. Contate o gestor.', 403);
  if (profile.role === 'viewer') return responseError('Seu perfil permite apenas consulta.', 403);

  let command: LobCommand;
  let target: ReturnType<typeof lobCommandTarget>;
  try {
    command = parseLobCommand(await request.json().catch(() => null));
    target = lobCommandTarget(command);
  } catch (error) {
    return responseError(error instanceof Error ? error.message : 'Comando inválido.', 400);
  }

  try {
    const workId = 'workId' in target ? target.workId : await findWorkIdForEntity(target.table, target.id);
    if (!workId) return responseError('Registro não encontrado. Recarregue a página.', 404);
    if (!profile.workIds.includes(workId)) return responseError('Você não tem acesso a esta obra.', 403);

    const extras: LobExtras = {};
    if (command.type === 'launch_flow') extras.flow = (await getFlow(command.flowId)) ?? undefined;
    if (command.type === 'import_planner') extras.plannerDocument = await loadPlannerDocument(workId);

    const current = await loadLob(workId);
    let mutation: LobMutation;
    try {
      mutation = planLobCommand(current, command, commandContext(profile.id), extras);
    } catch (error) {
      if (isLobCommandError(error) || error instanceof Error) return responseError(error.message, 400);
      throw error;
    }
    if (mutation.workId !== workId) return responseError('Você não tem acesso a esta obra.', 403);
    if (command.type === 'add_photo') {
      const photo = mutation.insert.photos[0];
      if (!photo || !(await photoFilesExist(photo))) return responseError('Envie a foto antes de registrá-la.', 400);
    }
    await applyLobMutation(mutation);
    const fresh = await withSignedUrls(await loadLob(workId));
    const extra = mutation.summary ?? {};
    return NextResponse.json({ available: true, ...fresh, ...extra }, { headers });
  } catch (error) {
    if (error instanceof LobUnavailableError) return responseError(error.message, 503);
    if (error instanceof LobConflictError) return responseError(error.message, 409);
    logRouteError('POST /api/lob/commands', error, { actorId: profile.id, type: command.type });
    return responseError('Não foi possível gravar a alteração. Tente novamente.', 502);
  }
}
