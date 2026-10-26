/** Registro estruturado de falhas nas rotas. Uma linha JSON por erro, com a rota, a mensagem e o
 * contexto que ajuda a reproduzir: é o que a Vercel guarda e o que se procura quando alguém diz
 * "deu erro". Nunca registra o corpo da requisição nem credenciais. */
export function logRouteError(route: string, cause: unknown, context: Record<string, unknown> = {}) {
  const error =
    cause instanceof Error
      ? { message: cause.message, name: cause.name, stack: cause.stack?.split('\n').slice(0, 4).join(' | ') }
      : { message: String(cause) };
  console.error(JSON.stringify({ level: 'error', route, at: new Date().toISOString(), ...context, error }));
}

/** A partir deste tempo total, a rota deixa uma linha de tempos no registro (`logRouteTiming`): abaixo
 * disso a gravação é imperceptível na obra e a linha só faria ruído. */
export const SLOW_ROUTE_MS = 1500;

/** Valor do cabeçalho `Server-Timing` (`fase;dur=ms`, uma por fase), que o painel de rede do navegador
 * mostra por requisição: foi o que faltou para saber se os segundos de cada gravação estavam na
 * autenticação ou no banco. */
export function serverTimingHeader(durations: Record<string, number>): string {
  return Object.entries(durations)
    .map(([phase, ms]) => `${phase};dur=${ms.toFixed(1)}`)
    .join(', ');
}

/** Tempos por fase de uma requisição lenta, uma linha JSON como a de `logRouteError`, com o contexto que
 * situa (quem, tipo do comando, status). Nunca o corpo nem credenciais. */
export function logRouteTiming(route: string, durations: Record<string, number>, context: Record<string, unknown> = {}) {
  const rounded = Object.fromEntries(Object.entries(durations).map(([phase, ms]) => [phase, Math.round(ms)]));
  console.warn(JSON.stringify({ level: 'warn', route, at: new Date().toISOString(), ...context, durations: rounded }));
}
