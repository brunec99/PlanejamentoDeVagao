import { createHmac, timingSafeEqual } from 'node:crypto';

/** Identidade confirmada pelo Google de quem entrou sem cadastro, guardada num cookie assinado por 30
 * minutos entre o retorno do login e o pedido de acesso. Sem ela, o e-mail do pedido seria só digitado,
 * e qualquer um poderia pedir em nome de outra pessoa. A chave é a de serviço, que só o servidor tem. */
export const ACCESS_REQUEST_COOKIE = 'obra360_pedido_acesso';
const TTL_MS = 30 * 60 * 1000;

export interface VerifiedIdentity {
  email: string;
  name: string;
}

const secret = () => {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY ausente.');
  return key;
};
const sign = (payload: string, key: string) => createHmac('sha256', key).update(payload).digest('base64url');

export function signIdentity(identity: VerifiedIdentity, now = Date.now(), key = secret()): string {
  const payload = Buffer.from(JSON.stringify({ ...identity, exp: now + TTL_MS })).toString('base64url');
  return `${payload}.${sign(payload, key)}`;
}

export function readIdentity(token: string | undefined, now = Date.now(), key = secret()): VerifiedIdentity | null {
  if (!token) return null;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(payload, key));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (typeof data.email !== 'string' || typeof data.name !== 'string' || typeof data.exp !== 'number' || data.exp < now) return null;
    return { email: data.email, name: data.name };
  } catch {
    return null;
  }
}
