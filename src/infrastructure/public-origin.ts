/** Endereço público pelo qual o navegador chegou ao sistema (`https://site`), para montar
 * redirecionamentos absolutos e links que saem do sistema (e-mail).
 *
 * Por que não `request.nextUrl.origin`: fora da Vercel (`next start` atrás de um proxy ou túnel), o Next
 * monta a URL da requisição com o endereço em que o servidor escuta. No servidor da ATR isso dá
 * `https://0.0.0.0:3000`: o retorno do login mandava o navegador para um endereço que não existe, e o
 * link do e-mail de pendência saía apontando para lá. Os desvios do proxy (`src/proxy.ts`) não sofrem
 * disso, porque o Next os devolve como caminho relativo.
 *
 * De onde vem o endereço, em ordem:
 * 1. `configured`, o endereço oficial da instalação (variável `PUBLIC_SITE_URL`). Com ele nenhum cabeçalho
 *    é lido: é o recomendado fora da Vercel, porque o link do e-mail sai do sistema e não deve depender
 *    do que a requisição diz.
 * 2. O cabeçalho `Host`, que o proxy da frente (Vercel, túnel da Cloudflare) repassa como o navegador
 *    mandou e usa para rotear a requisição até aqui; o protocolo vem de `x-forwarded-proto`.
 *    `x-forwarded-host` fica de fora: é um cabeçalho que quem chama pode escrever à vontade.
 * 3. O `fallback` (a origem que o Next informou), quando não há `Host` válido.
 * Função pura: quem chama passa a variável de ambiente. */

export type HeaderReader = { get(name: string): string | null };

// Nome de máquina ou IP, com porta opcional. Nada de barra, arroba ou espaço: o valor vira origem de URL.
const HOST = /^(?:[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?|\[[0-9a-f:]+\])(?::\d{1,5})?$/i;

/** Origem (`https://site`) de um endereço configurado; `null` se estiver vazio ou não for http(s). */
function configuredOrigin(value: string | undefined): string | null {
  const text = value?.trim();
  if (!text) return null;
  try {
    const url = new URL(text);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.origin : null;
  } catch {
    return null;
  }
}

export function publicOrigin(headers: HeaderReader, fallback: string, configured?: string): string {
  const fixed = configuredOrigin(configured);
  if (fixed) return fixed;
  const host = headers.get('host')?.trim() ?? '';
  if (!HOST.test(host)) return fallback;
  const forwarded = headers.get('x-forwarded-proto')?.split(',')[0].trim().toLowerCase();
  const protocol = forwarded === 'http' || forwarded === 'https' ? forwarded : new URL(fallback).protocol.slice(0, -1);
  return `${protocol}://${host}`;
}

/** Endereço para os links de e-mail que saem sem requisição (o resumo semanal de sábado é disparado pelo
 * relógio do servidor): `PUBLIC_SITE_URL` se o servidor a definir; senão `SITE_URL_PADRAO`, que a imagem
 * Docker traz da variável de mesmo nome do GitHub (12/11/2026). O padrão vale só para e-mail: o retorno do
 * login continua pelo `Host` da requisição, para não prender o login a um endereço embutido na imagem. */
export const emailSiteOrigin = (env: Record<string, string | undefined> = process.env): string | undefined =>
  configuredOrigin(env.PUBLIC_SITE_URL) ?? configuredOrigin(env.SITE_URL_PADRAO) ?? undefined;
