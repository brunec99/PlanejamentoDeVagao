import { NextResponse, type NextRequest } from 'next/server';
import { getRouteProfile } from '@/infrastructure/auth/supabase-server';
import {
  canWriteChecklist,
  checklistCommandTarget,
  parseChecklistCommand,
  planChecklistCommand,
  type ChecklistMutation,
  type ChecklistTarget,
} from '@/application/use-cases/checklist-commands';
import { CHECKLIST_TST_ONLY_MESSAGE, CHECKLIST_WINDOW_DAYS, shiftDay, type ChecklistCommand } from '@/domain/equipment-checklist';
import {
  applyChecklistMutation,
  ChecklistConflictError,
  ChecklistUnavailableError,
  findChecklistRun,
  findChecklistWorkId,
  loadChecklist,
} from '@/infrastructure/repositories/supabase/checklist-repository';
import { commandContext } from '@/infrastructure/clock';
import { logRouteError } from '@/infrastructure/log';

export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'no-store' };
const responseError = (error: string, status: number) => NextResponse.json({ error }, { status, headers });

/** Um comando da aba 9 por requisição. `?workId=` é a obra aberta na tela: é a obra que volta na resposta
 * e, nos comandos de modelo (lista única, sem obra), a que serve de conferência de acesso. Só TST e admin
 * gravam (`canWriteChecklist`). Aplica as regras (`planChecklistCommand`) sobre os dados atuais, grava e
 * devolve a obra já atualizada, no mesmo formato do GET. */
export async function POST(request: NextRequest) {
  const profile = await getRouteProfile().catch(() => null);
  if (!profile) return responseError('Perfil não provisionado. Contate o gestor.', 403);
  if (!canWriteChecklist(profile)) return responseError(CHECKLIST_TST_ONLY_MESSAGE, 403);

  const workId = request.nextUrl.searchParams.get('workId') ?? '';
  let command: ChecklistCommand;
  let target: ChecklistTarget;
  try {
    command = parseChecklistCommand(await request.json().catch(() => null));
    target = checklistCommandTarget(command);
  } catch (error) {
    return responseError(error instanceof Error ? error.message : 'Comando inválido.', 400);
  }
  if (!workId) return responseError('Obra não informada.', 400);
  if (!profile.workIds.includes(workId)) return responseError('Você não tem acesso a esta obra.', 403);
  // O comando que traz a obra tem de ser da obra aberta: a resposta é dela, e o acesso conferido também.
  if ('workId' in command && command.workId !== workId) return responseError('O comando é de outra obra. Recarregue a página.', 400);

  try {
    // Equipamento ou inspeção de outra obra conta como não encontrado: a tela só manda o que está nela.
    if ('table' in target && (await findChecklistWorkId(target.table, target.id)) !== workId)
      return responseError('Registro não encontrado. Recarregue a página.', 404);

    const context = commandContext(profile.id);
    const since = shiftDay(context.today, -CHECKLIST_WINDOW_DAYS);
    const current = await loadChecklist(workId, since);
    // Inspeção mais antiga que a janela carregada: entra à parte, para a edição e a exclusão a encontrarem.
    if ('table' in target && target.table === 'runs' && !current.runs.some(r => r.id === target.id)) {
      const old = await findChecklistRun(target.id);
      if (old) current.runs.push(old);
    }
    let mutation: ChecklistMutation;
    try {
      mutation = planChecklistCommand(current, command, context, workId);
    } catch (error) {
      // O planejador é puro: tudo o que ele recusa é regra de negócio, com mensagem para o usuário.
      return responseError(error instanceof Error ? error.message : 'Comando inválido.', 400);
    }
    // Defesa extra: a gravação de equipamento e inspeção não pode sair da obra aberta.
    if (mutation.workId !== undefined && mutation.workId !== workId) return responseError('Você não tem acesso a esta obra.', 403);
    await applyChecklistMutation(mutation);
    const fresh = await loadChecklist(workId, since);
    return NextResponse.json({ available: true, canEdit: true, today: context.today, ...fresh }, { headers });
  } catch (error) {
    if (error instanceof ChecklistUnavailableError) return responseError(error.message, 503);
    if (error instanceof ChecklistConflictError) return responseError(error.message, 409);
    logRouteError('POST /api/checklist/commands', error, { actorId: profile.id, workId, type: command.type });
    return responseError('Não foi possível gravar a alteração. Tente novamente.', 502);
  }
}
