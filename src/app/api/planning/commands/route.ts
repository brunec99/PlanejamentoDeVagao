import { NextResponse } from 'next/server';
import { applyCommand, type Command } from '@/application/use-cases/commands';
import { commandScope } from '@/application/use-cases/command-scope';
import { SupabasePlanningRepository } from '@/infrastructure/repositories/supabase/planning-repository';
import { getRouteAccess } from '@/infrastructure/auth/supabase-server';
import { isCommandAllowed, RESTRICTED_MODULE_MESSAGE } from '@/application/module-access';
import { commandContext } from '@/infrastructure/clock';
import { logRouteError } from '@/infrastructure/log';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  const { profile, developer, modules } = await getRouteAccess();
  if (!profile) return NextResponse.json({ error: 'Perfil não provisionado. Contate o gestor.' }, { status: 403 });
  let command: Command;
  try {
    command = await request.json();
  } catch {
    return NextResponse.json({ error: 'Corpo da requisição inválido.' }, { status: 400 });
  }
  // Go-live do curto prazo: fora do desenvolvimento, só os comandos dele, das equipes e da administração,
  // mais os dos módulos liberados para a pessoa.
  if (!isCommandAllowed(command?.type, { developer, modules }))
    return NextResponse.json({ error: RESTRICTED_MODULE_MESSAGE }, { status: 403 });
  // Gerar vagões pelo plano só pela rota própria, que lê o plano salvo em vez de aceitar pavimentos do navegador.
  if (command?.type === 'sync_long_term_plan')
    return NextResponse.json({ error: 'Use a geração de vagões do Planejador de longo prazo.' }, { status: 400 });
  try {
    const context = commandContext(profile.id);
    // Comandos do curto prazo leem só o recorte deles (equipes e compromissos envolvidos); os demais,
    // o planejamento inteiro das obras do perfil. A gravação leva só o que mudou, nos dois casos.
    // A versão gravada vai junto: com ela a tela sabe que a projeção local já é a versão do banco e
    // não baixa o planejamento inteiro de novo (`confirmsOwnWrite`).
    const { result: id, version } = await new SupabasePlanningRepository().commit(
      draft => applyCommand(draft, command, context),
      commandScope(command, profile.workIds),
    );
    return NextResponse.json({ id, version });
  } catch (error) {
    // Regra de negócio recusada volta como 400 com a mensagem; falha de infraestrutura é registrada.
    const message = error instanceof Error ? error.message : 'Falha ao aplicar o comando.';
    if (/Falha ao ler|Conflito de concorrência|fetch failed/i.test(message))
      logRouteError('POST /api/planning/commands', error, { actorId: profile.id, type: command?.type });
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
