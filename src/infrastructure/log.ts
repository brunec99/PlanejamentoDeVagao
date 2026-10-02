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
