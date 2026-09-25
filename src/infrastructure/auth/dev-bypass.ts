/** Acesso local sem login, temporário, para testar as telas sem passar pelo Google. Só vale com
 * `next dev` (NODE_ENV=development) e fora da Vercel: em produção a variável é ignorada mesmo que
 * alguém a configure, porque abrir o sistema publicado exporia dados reais sem saber quem alterou. */
export function devBypassProfileId(): string | undefined {
  if (process.env.NODE_ENV !== 'development' || process.env.VERCEL) return undefined;
  return process.env.DEV_AUTH_BYPASS_PROFILE_ID || undefined;
}
