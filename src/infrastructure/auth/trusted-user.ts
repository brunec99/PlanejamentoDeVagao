import { createHmac, timingSafeEqual } from 'node:crypto';

/** Identidade que o proxy repassa às rotas depois de validar a sessão, para cada requisição ir ao
 * Supabase Auth uma vez só (a segunda ida era boa parte dos segundos de cada gravação do curto prazo).
 *
 * Por que assinar, e não só apagar o que vem do navegador: o `matcher` do proxy deixa passar endereços
 * com sufixo de imagem (`/api/admin/users/x.png` cai na rota `[id]` sem proxy), e nesses a rota receberia
 * um cabeçalho forjado intacto. A assinatura HMAC com um segredo que só o servidor tem fecha isso: sem
 * ela, ou com ela errada, a rota ignora os cabeçalhos e lê a sessão dos cookies como antes.
 *
 * Funções puras (sem rede nem estado): quem chama passa o segredo. */

export const TRUSTED_HEADER_PREFIX = 'x-obra360-';
export const TRUSTED_USER_ID_HEADER = 'x-obra360-user-id';
export const TRUSTED_USER_EMAIL_HEADER = 'x-obra360-user-email';
export const TRUSTED_USER_SIGNATURE_HEADER = 'x-obra360-user-sig';

export type TrustedUser = { id: string; email: string | undefined };
export type HeaderReader = { get(name: string): string | null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Valor de cabeçalho HTTP sem risco: só ASCII imprimível, sem espaço nem quebra de linha (que `Headers.set` rejeita).
const HEADER_SAFE = /^[\x21-\x7e]+$/;

/** Segredo da assinatura: um dedicado, se existir, senão a chave de serviço do Supabase, que já é
 * exclusiva do servidor. Sem nenhum dos dois o proxy não repassa identidade e as rotas seguem lendo a
 * sessão (mais lento, igualmente seguro). */
export function trustedHeaderSecret(env: Record<string, string | undefined> = process.env): string | undefined {
  return env.OBRA360_TRUSTED_HEADER_SECRET || env.SUPABASE_SERVICE_ROLE_KEY || undefined;
}

function signature(id: string, email: string, secret: string): string {
  // Separador que nunca aparece num valor de cabeçalho, para `a` + `bc` não assinar igual a `ab` + `c`.
  return createHmac('sha256', secret).update(`${id}\n${email}`).digest('hex');
}

/** Cabeçalhos a escrever na requisição encaminhada, ou `null` quando não há como assiná-la (sem segredo,
 * id fora do formato, e-mail que não cabe num cabeçalho): nesse caso a rota lê a sessão por conta própria. */
export function trustedUserHeaders(user: { id: string; email?: string | null }, secret: string | undefined): Record<string, string> | null {
  if (!secret || !UUID.test(user.id)) return null;
  const email = user.email ?? '';
  if (email && !HEADER_SAFE.test(email)) return null;
  const headers: Record<string, string> = {
    [TRUSTED_USER_ID_HEADER]: user.id,
    [TRUSTED_USER_SIGNATURE_HEADER]: signature(user.id, email, secret),
  };
  if (email) headers[TRUSTED_USER_EMAIL_HEADER] = email;
  return headers;
}

/** Lê a identidade repassada pelo proxy. Devolve `null` se faltar id, se ele não for UUID, se não houver
 * segredo ou se a assinatura não bater com id + e-mail: aí a rota volta ao Supabase Auth. */
export function trustedUserFrom(headers: HeaderReader, secret: string | undefined): TrustedUser | null {
  if (!secret) return null;
  const id = headers.get(TRUSTED_USER_ID_HEADER);
  const signed = headers.get(TRUSTED_USER_SIGNATURE_HEADER);
  if (!id || !signed || !UUID.test(id)) return null;
  const email = headers.get(TRUSTED_USER_EMAIL_HEADER) ?? '';
  const expected = Buffer.from(signature(id, email, secret), 'utf8');
  const received = Buffer.from(signed, 'utf8');
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;
  return { id, email: email || undefined };
}

/** Apaga todo `x-obra360-*` dos cabeçalhos (os que o navegador tenha mandado), para só o proxy escrevê-los.
 * Altera e devolve o mesmo objeto. */
export function stripTrustedHeaders(headers: Headers): Headers {
  for (const name of [...headers.keys()]) if (name.toLowerCase().startsWith(TRUSTED_HEADER_PREFIX)) headers.delete(name);
  return headers;
}
