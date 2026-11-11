/** Endereço público pelo qual o navegador chegou ao sistema (`https://site`), para montar
 * redirecionamentos absolutos e links que saem do sistema (e-mail).
 *
 * Por que não `request.nextUrl.origin`: fora da Vercel (`next start` atrás de um proxy ou túnel), o Next
 * monta a URL da requisição com o endereço em que o servidor escuta. No servidor da ATR isso dá
 * `https://0.0.0.0:3000`: o retorno do login mandava o navegador para um endereço que não existe, e o
 * link do e-mail de pendência saía apontando para lá. Os desvios do proxy (`src/proxy.ts`) não sofrem
 * disso, porque o Next os devolve como caminho relativo.
 *
 * O endereço certo está no cabeçalho `Host`, que o proxy da frente (Vercel, túnel da Cloudflare) repassa
 * como o navegador mandou e usa para rotear a requisição até aqui; o protocolo vem de `x-forwarded-proto`.
 * `x-forwarded-host` fica de fora: é um cabeçalho que quem chama pode escrever à vontade.
 * Sem `Host` válido, vale o `fallback` (a origem que o Next informou). Função pura. */

export type HeaderReader = { get(name: string): string | null };

// Nome de máquina ou IP, com porta opcional. Nada de barra, arroba ou espaço: o valor vira origem de URL.
const HOST = /^(?:[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?|\[[0-9a-f:]+\])(?::\d{1,5})?$/i;

export function publicOrigin(headers: HeaderReader, fallback: string): string {
  const host = headers.get('host')?.trim() ?? '';
  if (!HOST.test(host)) return fallback;
  const forwarded = headers.get('x-forwarded-proto')?.split(',')[0].trim().toLowerCase();
  const protocol = forwarded === 'http' || forwarded === 'https' ? forwarded : new URL(fallback).protocol.slice(0, -1);
  return `${protocol}://${host}`;
}
