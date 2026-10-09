import { NextResponse } from 'next/server';
import { getRouteProfile } from '@/infrastructure/auth/supabase-server';
import {
  parseTerminalityCommand,
  planTerminalityCommand,
  terminalityCommandTarget,
  type TerminalityMutation,
} from '@/application/use-cases/terminality-commands';
import type { TerminalityCommand } from '@/domain/terminality';
import {
  applyMutation,
  findWorkIdForEntity,
  loadTerminality,
  photoFilesExist,
  TerminalityConflictError,
  TerminalityUnavailableError,
  withSignedUrls,
} from '@/infrastructure/repositories/supabase/terminality-repository';
import { commandContext } from '@/infrastructure/clock';
import { logRouteError } from '@/infrastructure/log';

export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'no-store' };
const responseError = (error: string, status: number) => NextResponse.json({ error }, { status, headers });

/** Um comando da aba 5 por requisição. Descobre a obra do comando, confere o acesso, aplica as
 * regras (`planTerminalityCommand`) sobre os dados atuais da obra, grava e devolve a obra já
 * atualizada, para a tela não precisar de outra leitura. */
export async function POST(request: Request) {
  const profile = await getRouteProfile().catch(() => null);
  if (!profile) return responseError('Perfil não provisionado. Contate o gestor.', 403);
  if (profile.role === 'viewer') return responseError('Seu perfil permite apenas consulta.', 403);

  let command: TerminalityCommand;
  let target: ReturnType<typeof terminalityCommandTarget>;
  try {
    command = parseTerminalityCommand(await request.json().catch(() => null));
    target = terminalityCommandTarget(command);
  } catch (error) {
    return responseError(error instanceof Error ? error.message : 'Comando inválido.', 400);
  }

  try {
    const workId = 'workId' in target ? target.workId : await findWorkIdForEntity(target.table, target.id);
    if (!workId) return responseError('Registro não encontrado. Recarregue a página.', 404);
    if (!profile.workIds.includes(workId)) return responseError('Você não tem acesso a esta obra.', 403);

    const current = await loadTerminality(workId);
    let mutation: TerminalityMutation;
    try {
      mutation = planTerminalityCommand(current, command, commandContext(profile.id));
    } catch (error) {
      // O planejador é puro: tudo o que ele recusa é regra de negócio, com mensagem para o usuário.
      return responseError(error instanceof Error ? error.message : 'Comando inválido.', 400);
    }
    // Defesa extra: o planejador só enxerga a obra carregada, mas a gravação não pode sair dela.
    if (mutation.workId !== workId) return responseError('Você não tem acesso a esta obra.', 403);
    // O planejador não enxerga o Storage: a foto só entra no banco se os dois arquivos já subiram.
    if (command.type === 'add_photo') {
      const photo = mutation.insert.photos[0];
      if (!photo || !(await photoFilesExist(photo))) return responseError('Envie a foto antes de registrá-la.', 400);
    }
    await applyMutation(mutation);
    const fresh = await withSignedUrls(await loadTerminality(workId));
    return NextResponse.json({ available: true, ...fresh }, { headers });
  } catch (error) {
    if (error instanceof TerminalityUnavailableError) return responseError(error.message, 503);
    if (error instanceof TerminalityConflictError) return responseError(error.message, 409);
    logRouteError('POST /api/terminalidade/commands', error, { actorId: profile.id, type: command.type });
    return responseError('Não foi possível gravar a alteração. Tente novamente.', 502);
  }
}
