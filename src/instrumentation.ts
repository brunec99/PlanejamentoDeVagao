/** Chamado pelo Next uma vez, quando o servidor sobe. Só inicia o agendador do resumo semanal por e-mail
 * (12/11/2026): no runtime Node, em produção, fora do build (`weeklySchedulerEnabled`). O módulo é importado
 * aqui dentro, e não no topo, para o runtime Edge não carregar código de Node. Falhar aqui não pode impedir o
 * servidor de subir. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  try {
    const { startWeeklySummaryScheduler } = await import('./infrastructure/weekly-summary-scheduler');
    startWeeklySummaryScheduler();
  } catch (cause) {
    console.error(
      JSON.stringify({ level: 'error', route: 'instrumentation', message: cause instanceof Error ? cause.message : String(cause) }),
    );
  }
}
