/** Regras do pedido de acesso (14/10/2026): funções puras, usadas pela tela de login, pela ação de
 * servidor e pelos testes. Só contas da ATR e da Takt podem pedir; nome e mensagem têm limite para o
 * pedido caber na lista do admin. */

/** Domínios aceitos no login, no cadastro pelo admin e no pedido de acesso. A Takt entrou em 28/10/2026:
 * a equipe dela usa e-mail próprio, também no Google Workspace. Estar no domínio não basta para entrar;
 * continua valendo o cadastro feito por um admin. */
export const ACCESS_DOMAINS = ['atrincorporadora.com.br', 'taktengenharia.com.br'] as const;
export const ACCESS_DOMAINS_LABEL = ACCESS_DOMAINS.map(d => `@${d}`).join(' ou ');

export function isAllowedEmail(email: string | null | undefined): boolean {
  const normalized = (email ?? '').trim().toLowerCase();
  return ACCESS_DOMAINS.some(domain => normalized.endsWith(`@${domain}`));
}

export const NOT_REGISTERED_REASON = 'sem-cadastro';

export interface AccessRequestInput {
  email: string;
  name: string;
  message?: string;
}
export type AccessRequestStatus = 'pending' | 'approved' | 'dismissed';
export interface AccessRequest {
  id: string;
  email: string;
  name: string;
  message: string | null;
  verified: boolean;
  status: AccessRequestStatus;
  createdAt: string;
  updatedAt: string;
}

/** Pedido limpo e conferido; erro com a frase para a tela. */
export function validateAccessRequest(input: Partial<AccessRequestInput>): { value?: AccessRequestInput; error?: string } {
  const email = String(input.email ?? '')
    .trim()
    .toLowerCase();
  const name = String(input.name ?? '')
    .trim()
    .replace(/\s+/g, ' ');
  const message = String(input.message ?? '').trim();
  if (!/^[^\s@]+@[^\s@]+$/.test(email)) return { error: 'Informe um e-mail válido.' };
  if (!isAllowedEmail(email)) return { error: `Só contas ${ACCESS_DOMAINS_LABEL} podem pedir acesso.` };
  if (!name) return { error: 'Informe seu nome.' };
  if (name.length > 120) return { error: 'Nome muito longo.' };
  if (message.length > 500) return { error: 'A mensagem passa de 500 caracteres.' };
  return { value: { email, name, ...(message ? { message } : {}) } };
}
