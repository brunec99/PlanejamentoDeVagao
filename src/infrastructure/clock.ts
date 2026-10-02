/** Data civil de hoje no fuso da obra. Todas as rotas que escrevem usam esta função: o domínio
 * decide o que é passado e o que é cauda a partir dela, e duas rotas com relógios diferentes
 * produziam vagões congelados em datas diferentes. */
export function todayInSaoPaulo(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** Contexto de execução de um comando, montado sempre do mesmo jeito. */
export function commandContext(actorId: string) {
  return { actorId, today: todayInSaoPaulo(), now: new Date().toISOString(), newId: () => crypto.randomUUID() };
}
