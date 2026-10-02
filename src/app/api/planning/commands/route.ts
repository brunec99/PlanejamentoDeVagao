import { NextResponse } from 'next/server';
import { applyCommand, type Command } from '@/application/use-cases/commands';
import { SupabasePlanningRepository } from '@/infrastructure/repositories/supabase/planning-repository';
import { getRouteProfile } from '@/infrastructure/auth/supabase-server';
import { commandContext } from '@/infrastructure/clock';
import { logRouteError } from '@/infrastructure/log';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  const profile = await getRouteProfile();
  if (!profile) return NextResponse.json({ error: 'Perfil não provisionado. Contate o gestor.' }, { status: 403 });
  let command: Command;
  try {
    command = await request.json();
  } catch {
    return NextResponse.json({ error: 'Corpo da requisição inválido.' }, { status: 400 });
  }
  // Gerar vagões pelo plano só pela rota própria, que lê o plano salvo em vez de aceitar pavimentos do navegador.
  if (command?.type === 'sync_long_term_plan')
    return NextResponse.json({ error: 'Use a geração de vagões do Planejador de longo prazo.' }, { status: 400 });
  try {
    const context = commandContext(profile.id);
    const id = await new SupabasePlanningRepository().transaction(draft => applyCommand(draft, command, context), {
      workIds: profile.workIds,
    });
    return NextResponse.json({ id });
  } catch (error) {
    // Regra de negócio recusada volta como 400 com a mensagem; falha de infraestrutura é registrada.
    const message = error instanceof Error ? error.message : 'Falha ao aplicar o comando.';
    if (/Falha ao ler|Conflito de concorrência|fetch failed/i.test(message))
      logRouteError('POST /api/planning/commands', error, { actorId: profile.id, type: command?.type });
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
