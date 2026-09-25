import { NextResponse } from 'next/server';
import { applyCommand, type Command } from '@/application/use-cases/commands';
import { SupabasePlanningRepository } from '@/infrastructure/repositories/supabase/planning-repository';
import { getRouteProfile } from '@/infrastructure/auth/supabase-server';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  const profile = await getRouteProfile();
  if (!profile) return NextResponse.json({ error: 'Perfil não provisionado. Contate o gestor.' }, { status: 403 });
  let command: Command;
  try { command = await request.json(); }
  catch { return NextResponse.json({ error: 'Corpo da requisição inválido.' }, { status: 400 }); }
  // Gerar vagões pelo plano só pela rota própria, que lê o plano salvo em vez de aceitar pavimentos do navegador.
  if (command?.type === 'sync_long_term_plan') return NextResponse.json({ error: 'Gere os vagões pelo planejador de longo prazo.' }, { status: 400 });
  if (['create_plan_task','update_plan_task','delete_plan_task','indent_plan_task','outdent_plan_task','set_plan_task_note','link_plan_tasks','unlink_plan_tasks','replace_plan_predecessors'].includes(command?.type)) return NextResponse.json({ error: 'Use a revisão do cronograma para salvar tarefas, vínculos e anotações juntos, com motivo.' }, { status: 400 });
  try {
    const context = { actorId: profile.id, today: new Intl.DateTimeFormat('en-CA', {timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()), now: new Date().toISOString(), newId: () => crypto.randomUUID() };
    const id = await new SupabasePlanningRepository().transaction(draft => applyCommand(draft, command, context));
    return NextResponse.json({ id }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Falha ao aplicar o comando.' }, { status: 400 });
  }
}
