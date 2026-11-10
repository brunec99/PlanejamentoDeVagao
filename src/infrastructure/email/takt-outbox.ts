import { PENDING_STATUS_LABELS } from '../../domain/pending-board';
import type { PendingNotification } from '../../application/use-cases/pending-commands';
import { getServiceClient } from '../repositories/supabase/client';

/** E-mails do Obra 360 pela fila do Takt Hub (mesmo projeto Supabase, schema `takt`): aqui só se
 * enfileira com `takt.email_enqueue`; quem envia é a Edge Function do Takt Hub, a cada 5 minutos.
 * O tipo e o modelo `obra360.pendencia` são do Takt Hub: enquanto não estiverem publicados lá, a RPC
 * devolve erro, e quem chama trata como aviso perdido, nunca como falha do comando. */

export const PENDING_EMAIL_KIND = 'obra360.pendencia';
const MAX_TEXT = 1200;
const MAX_SUBJECT = 200;

/** Contrato do modelo `obra360.pendencia` (fica bem abaixo dos 4096 bytes do payload). */
export interface PendingEmailPayload {
  motivo: 'mencao' | 'atribuicao';
  autorNome: string;
  primeiroNome?: string;
  obra: string;
  cardTitulo: string;
  texto?: string;
  truncado?: boolean;
  entrega: string;
  status: string;
  responsavelNome: string;
  link: string;
}
export interface PendingEmail {
  toUserId: string;
  subject: string;
  idempotencyKey: string;
  payload: PendingEmailPayload;
}

/** Endereço do card na aba 2. `origin` é a origem da requisição (`request.nextUrl.origin`). */
export const pendingCardLink = (origin: string, workId: string, cardId: string) =>
  `${origin}/obras/${encodeURIComponent(workId)}/vagoes?visao=pendencias&card=${cardId}`;

const subjectLine = (text: string) =>
  text
    .replace(/[\r\n]+/g, ' ')
    .trim()
    .slice(0, MAX_SUBJECT);

/** Assunto, chave de idempotência e payload de um aviso. Puro: a obra, a origem do endereço e o instante
 * vêm de fora. A chave identifica o evento e não leva nome nem endereço: a menção é única por mensagem e
 * pessoa; a atribuição leva o instante, porque o mesmo card pode voltar para a mesma pessoa. */
export function pendingEmail(
  notification: PendingNotification,
  ctx: { workId: string; workName: string; origin: string; now: string },
): PendingEmail {
  const { reason, userId, cardId, cardTitle, authorName } = notification;
  const obra = ctx.workName;
  const firstName = notification.userName.trim().split(/\s+/)[0];
  const text = notification.text ?? '';
  return {
    toUserId: userId,
    subject: subjectLine(
      reason === 'mencao'
        ? `${authorName} marcou você em "${cardTitle}" (${obra})`
        : `${authorName} atribuiu a você "${cardTitle}" (${obra})`,
    ),
    idempotencyKey:
      reason === 'mencao'
        ? `${PENDING_EMAIL_KIND}:mencao:${notification.messageId}:${userId}`
        : `${PENDING_EMAIL_KIND}:atribuicao:${cardId}:${userId}:${ctx.now}`,
    payload: {
      motivo: reason,
      autorNome: authorName,
      ...(firstName ? { primeiroNome: firstName } : {}),
      obra,
      cardTitulo: cardTitle,
      ...(reason === 'mencao' && text ? { texto: text.slice(0, MAX_TEXT), ...(text.length > MAX_TEXT ? { truncado: true } : {}) } : {}),
      entrega: notification.dueDate,
      status: PENDING_STATUS_LABELS[notification.status],
      responsavelNome: notification.responsibleName,
      link: pendingCardLink(ctx.origin, ctx.workId, cardId),
    },
  };
}

/** Enfileira um aviso. O endereço vem do Supabase Auth (`profiles` não tem e-mail). Lança em qualquer
 * falha, só com o código: a mensagem do Postgres ou do Auth pode citar o endereço, e ele não vai a log. */
export async function enqueuePendingEmail(email: PendingEmail): Promise<{ created: boolean }> {
  const client = getServiceClient();
  const user = await client.auth.admin.getUserById(email.toUserId);
  const address = user.data?.user?.email;
  if (user.error || !address) throw new Error(`Destinatário sem e-mail no Supabase Auth (${user.error?.code ?? 'sem endereço'}).`);
  const { data, error } = await client.schema('takt').rpc('email_enqueue', {
    p_kind: PENDING_EMAIL_KIND,
    p_to_email: address,
    p_subject: email.subject,
    p_idempotency_key: email.idempotencyKey,
    p_payload: email.payload,
    p_template: PENDING_EMAIL_KIND,
    p_to_user_id: email.toUserId,
    p_available_at: null,
  });
  if (error) throw new Error(`Falha ao enfileirar e-mail (${error.code ?? 'sem código'}).`);
  const row = (Array.isArray(data) ? data[0] : data) as { created?: boolean } | null | undefined;
  return { created: row?.created === true };
}
