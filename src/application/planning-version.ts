/** Sinal barato de mudança do planejamento: `planning_meta.version` sobe a cada `commit_planning`.
 * Antes, cada aba aberta baixava o planejamento inteiro (3,9 MB; ~350 KB comprimidos) a cada 2 min,
 * ao voltar para a aba e depois de cada comando, e com poucos usuários isso estourava a cota grátis
 * de tráfego da Vercel e do Supabase (12/10/2026). Agora a tela confere a versão (uns bytes) e só
 * baixa tudo quando ela mudou. Funções puras: o provedor e os testes usam as mesmas. */

/** Decide se vale baixar o planejamento inteiro. Sem versão conhecida (nunca carregou, ou a leitura
 * que antecedeu a carga falhou) ou sem versão atual (a conferência falhou) a resposta é recarregar:
 * a carga completa é quem sabe marcar os dados como desatualizados e restabelecer a base. */
export function shouldReload(lastVersion: number | undefined, currentVersion: number | undefined): boolean {
  if (lastVersion === undefined || currentVersion === undefined) return true;
  return lastVersion !== currentVersion;
}

/** Lê a versão da resposta de `/api/planning/version`; qualquer outra coisa é "desconhecida". */
export function parseVersion(body: unknown): number | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  const { version } = body as { version?: unknown };
  return typeof version === 'number' && Number.isFinite(version) ? version : undefined;
}

/** Depois de um comando, a resposta traz a versão gravada. Se ela é exatamente a conhecida + 1, a única
 * gravação desde a última carga foi a nossa, e a projeção local (`applyCommandLocally`) já é o que o
 * banco tem: não vale baixar os 3,9 MB nem redesenhar a planilha. Qualquer outra situação (versão
 * desconhecida, resposta sem versão, salto maior porque alguém gravou no meio) pede a recarga. */
export function confirmsOwnWrite(lastVersion: number | undefined, committedVersion: unknown): boolean {
  if (lastVersion === undefined) return false;
  return typeof committedVersion === 'number' && Number.isFinite(committedVersion) && committedVersion === lastVersion + 1;
}
