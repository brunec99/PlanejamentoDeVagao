import { NextResponse, type NextRequest } from 'next/server';
import { getRouteProfile } from '@/infrastructure/auth/supabase-server';
import {
  canWriteSafety,
  parseSafetyCommand,
  planSafetyCommand,
  safetyCommandTarget,
  type SafetyMutation,
  type SafetyTarget,
} from '@/application/use-cases/safety-commands';
import { SAFETY_TST_ONLY_MESSAGE, type SafetyCommand } from '@/domain/safety';
import {
  applyMutation,
  findWorkIdForEntity,
  listInspectors,
  loadSafety,
  photoFilesExist,
  SafetyConflictError,
  SafetyUnavailableError,
  withSignedUrls,
} from '@/infrastructure/repositories/supabase/safety-repository';
import { commandContext } from '@/infrastructure/clock';
import { logRouteError } from '@/infrastructure/log';

export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'no-store' };
const responseError = (error: string, status: number) => NextResponse.json({ error }, { status, headers });

/** Um comando da aba 6 por requisição. `?workId=` é a obra aberta na tela: é a obra que volta na resposta
 * e, nos comandos de tipo (lista única, sem obra), a que serve de conferência de acesso. Só quem é TST
 * grava — papel nenhum, nem admin, basta. Aplica as regras (`planSafetyCommand`) sobre os dados atuais,
 * grava e devolve a obra já atualizada, no mesmo formato do GET. */
export async function POST(request: NextRequest) {
  const profile = await getRouteProfile().catch(() => null);
  if (!profile) return responseError('Perfil não provisionado. Contate o gestor.', 403);
  if (!canWriteSafety(profile)) return responseError(SAFETY_TST_ONLY_MESSAGE, 403);

  const workId = request.nextUrl.searchParams.get('workId') ?? '';
  let command: SafetyCommand;
  let target: SafetyTarget;
  try {
    command = parseSafetyCommand(await request.json().catch(() => null));
    target = safetyCommandTarget(command);
  } catch (error) {
    return responseError(error instanceof Error ? error.message : 'Comando inválido.', 400);
  }
  if (!workId) return responseError('Obra não informada.', 400);
  if (!profile.workIds.includes(workId)) return responseError('Você não tem acesso a esta obra.', 403);
  // O comando que traz a obra tem de ser da obra aberta: a resposta é dela, e o acesso conferido também.
  if ('workId' in target && target.workId !== workId) return responseError('O comando é de outra obra. Recarregue a página.', 400);

  try {
    if ('table' in target) {
      // Apontamento ou foto de outra obra conta como não encontrado: a tela só manda o que está nela.
      const owner = await findWorkIdForEntity(target.table === 'photos' ? 'photos' : 'items', target.id);
      if (owner !== workId) return responseError('Registro não encontrado. Recarregue a página.', 404);
    }

    const current = await loadSafety(workId);
    let mutation: SafetyMutation;
    try {
      mutation = planSafetyCommand(current, command, commandContext(profile.id));
    } catch (error) {
      // O planejador é puro: tudo o que ele recusa é regra de negócio, com mensagem para o usuário.
      return responseError(error instanceof Error ? error.message : 'Comando inválido.', 400);
    }
    // Defesa extra: o planejador só enxerga a obra carregada, mas a gravação não pode sair dela.
    if (mutation.workId !== undefined && mutation.workId !== workId) return responseError('Você não tem acesso a esta obra.', 403);
    // O planejador não enxerga o Storage: a foto só entra no banco se os dois arquivos já subiram.
    if (command.type === 'add_photo') {
      const photo = mutation.insert.photos[0];
      if (!photo || !(await photoFilesExist(photo))) return responseError('Envie a foto antes de registrá-la.', 400);
    }
    await applyMutation(mutation);
    const [fresh, inspectors] = await Promise.all([loadSafety(workId).then(withSignedUrls), listInspectors(workId)]);
    return NextResponse.json({ available: true, canEdit: canWriteSafety(profile), inspectors, ...fresh }, { headers });
  } catch (error) {
    if (error instanceof SafetyUnavailableError) return responseError(error.message, 503);
    if (error instanceof SafetyConflictError) return responseError(error.message, 409);
    logRouteError('POST /api/seguranca/commands', error, { actorId: profile.id, workId, type: command.type });
    return responseError('Não foi possível gravar a alteração. Tente novamente.', 502);
  }
}
