import type { SupabaseClient } from '@supabase/supabase-js';
import type { LocalDate } from '../../domain/entities';
import { addDays, startOfWeek } from '../../domain/validation';
import {
  buildWeeklySummary,
  manualIdempotencyKey,
  WEEKLY_SUMMARY_KIND,
  weeklyDashboardLink,
  weeklyIdempotencyKey,
  weeklyPayload,
  type WeeklyLine,
  type WeeklySummary,
  type WeeklyWorkInput,
} from '../../domain/weekly-summary';
import type { WorkExtras } from '../../modules/dashboard/extras/types';
import { logRouteError } from '../log';
import { getServiceClient } from '../repositories/supabase/client';
import { readDashboardExtras } from '../repositories/supabase/dashboard-extras';

/** Resumo semanal por e-mail (12/11/2026, regras 12 a 20 do modelo): lê a semana no servidor, monta o resumo
 * (`domain/weekly-summary.ts`) e o enfileira na fila do Takt Hub (`takt.email_enqueue`, mesmo banco), com o
 * modelo `obra360.resumo_semanal`. Quem envia é a Edge Function `email-dispatch` do Takt Hub. Enquanto o modelo
 * não estiver publicado lá, a RPC recusa e o envio falha sem derrubar nada. O endereço de quem recebe vem do
 * Supabase Auth e nunca vai a log. */

const LABEL = 'resumo-semanal';
const PAGE = 1000;
const missingColumn = (code?: string) => code === '42703' || code === 'PGRST204';

export interface WeeklyRecipient {
  userId: string;
  name: string;
}

/** Os admins com a chave "Receber o resumo semanal" ligada (`profiles.weekly_summary`, migração 0050).
 * `null` = a migração ainda não foi aplicada (ninguém recebe). */
export async function loadWeeklyRecipients(client: SupabaseClient = getServiceClient()): Promise<WeeklyRecipient[] | null> {
  const { data, error } = await client.from('profiles').select('id, name').eq('role', 'admin').eq('weekly_summary', true);
  if (error) {
    if (missingColumn(error.code)) return null;
    throw new Error(`Falha ao ler os destinatários do resumo semanal (${error.code ?? 'sem código'}).`);
  }
  return ((data ?? []) as { id: string; name: string }[]).map(row => ({ userId: row.id, name: row.name }));
}

/** Liga ou desliga a chave de um admin. `false` = perfil não existe ou não é admin. Lança
 * `WeeklySummaryUnavailableError` sem a migração 0050. Não mexe em `updated_at`, como `setTst`: o
 * `commit_planning` não conhece a coluna e as duas gravações não se atropelam. */
export class WeeklySummaryUnavailableError extends Error {
  constructor() {
    super('Aplique a migração 0050 para ligar o resumo semanal.');
    this.name = 'WeeklySummaryUnavailableError';
  }
}
export async function setWeeklySummary(userId: string, enabled: boolean): Promise<boolean> {
  const { data, error } = await getServiceClient()
    .from('profiles')
    .update({ weekly_summary: enabled })
    .eq('id', userId)
    .eq('role', 'admin')
    .select('id');
  if (error) {
    if (missingColumn(error.code)) throw new WeeklySummaryUnavailableError();
    throw new Error(`Falha ao gravar a chave do resumo semanal (${error.code ?? 'sem código'}).`);
  }
  return Boolean(data?.length);
}

/** As linhas do curto prazo de todas as obras na semana: só a obra, o Status e a causa. */
async function loadWeekLines(client: SupabaseClient, week: LocalDate): Promise<Map<string, WeeklyLine[]>> {
  const byWork = new Map<string, WeeklyLine[]>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await client
      .from('weekly_commitments')
      .select('work_id, fulfilled, cause')
      .eq('week_start', week)
      .order('id')
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`Falha ao ler weekly_commitments (${error.code ?? 'sem código'}).`);
    const rows = (data ?? []) as { work_id: string; fulfilled: boolean | null; cause: string | null }[];
    for (const row of rows) {
      const line: WeeklyLine = {
        ...(row.fulfilled === null ? {} : { fulfilled: row.fulfilled }),
        ...(row.cause ? { cause: row.cause } : {}),
      };
      const list = byWork.get(row.work_id);
      if (list) list.push(line);
      else byWork.set(row.work_id, [line]);
    }
    if (rows.length < PAGE) return byWork;
  }
}

/** O resumo da semana `week` com os dados de agora. Entram as obras ativas (regra 15; obra encerrada não é
 * cobrada). A falha dos blocos (histograma, produtividade…) não impede o resumo: os itens saem "Indisponível". */
export async function composeWeeklySummary(week: LocalDate, today: LocalDate, actorId = 'agendador'): Promise<WeeklySummary> {
  const monday = startOfWeek(week);
  const client = getServiceClient();
  const [works, lines] = await Promise.all([client.from('works').select('id, name, code, active'), loadWeekLines(client, monday)]);
  if (works.error) throw new Error(`Falha ao ler works (${works.error.code ?? 'sem código'}).`);
  const listed = (works.data as { id: string; name: string; code: string; active: boolean }[]).filter(work => work.active);
  let extras = new Map<string, WorkExtras>();
  try {
    const response = await readDashboardExtras({
      workIds: listed.map(work => work.id),
      range: { start: monday, end: addDays(monday, 5), today },
      access: 'all',
      includeSafety: true,
      actorId,
      label: LABEL,
    });
    extras = new Map(response.works.map(item => [item.workId, item]));
  } catch (cause) {
    logRouteError(LABEL, cause, { part: 'extras', week: monday });
  }
  const inputs: WeeklyWorkInput[] = listed.map(work => ({
    work: { id: work.id, name: work.name, code: work.code },
    lines: lines.get(work.id) ?? [],
    ...(extras.has(work.id) ? { extras: extras.get(work.id) } : {}),
  }));
  return buildWeeklySummary({ week: monday, works: inputs });
}

async function enqueue(
  client: SupabaseClient,
  summary: WeeklySummary,
  recipient: WeeklyRecipient,
  options: { origin?: string; idempotencyKey: string; manual?: boolean },
): Promise<{ created: boolean }> {
  const user = await client.auth.admin.getUserById(recipient.userId);
  const address = user.data?.user?.email;
  if (user.error || !address) throw new Error(`Destinatário sem e-mail no Supabase Auth (${user.error?.code ?? 'sem endereço'}).`);
  const firstName = recipient.name.trim().split(/\s+/)[0];
  const payload = weeklyPayload(summary, {
    ...(firstName ? { firstName } : {}),
    link: weeklyDashboardLink(options.origin, summary.week),
    manual: options.manual,
  });
  const { data, error } = await client.schema('takt').rpc('email_enqueue', {
    p_kind: WEEKLY_SUMMARY_KIND,
    p_to_email: address,
    p_subject: summary.subject.slice(0, 200),
    p_idempotency_key: options.idempotencyKey,
    p_payload: payload,
    p_template: WEEKLY_SUMMARY_KIND,
    p_to_user_id: recipient.userId,
    p_available_at: null,
  });
  if (error) throw new Error(`Falha ao enfileirar e-mail (${error.code ?? 'sem código'}).`);
  const row = (Array.isArray(data) ? data[0] : data) as { created?: boolean } | null | undefined;
  return { created: row?.created === true };
}

export type WeeklySendResult =
  { status: 'migration-missing' } | { status: 'no-recipients' } | { status: 'sent'; recipients: number; created: number; failed: number };

/** O envio de sábado: um e-mail por admin com a chave ligada. A chave de idempotência é a semana e a pessoa,
 * então rodar de novo (outro ciclo do temporizador, outro processo) não duplica. A falha de uma pessoa não
 * impede as outras; `failed` > 0 faz o agendador tentar de novo no próximo ciclo. */
export async function sendWeeklySummary(input: { week: LocalDate; today: LocalDate; origin?: string }): Promise<WeeklySendResult> {
  const client = getServiceClient();
  const recipients = await loadWeeklyRecipients(client);
  if (recipients === null) return { status: 'migration-missing' };
  if (!recipients.length) return { status: 'no-recipients' };
  const summary = await composeWeeklySummary(input.week, input.today);
  let created = 0;
  let failed = 0;
  for (const recipient of recipients) {
    try {
      const result = await enqueue(client, summary, recipient, {
        origin: input.origin,
        idempotencyKey: weeklyIdempotencyKey(summary.week, recipient.userId),
      });
      if (result.created) created++;
    } catch (cause) {
      failed++;
      logRouteError(LABEL, cause, { part: 'enqueue', userId: recipient.userId, week: summary.week });
    }
  }
  return { status: 'sent', recipients: recipients.length, created, failed };
}

/** O envio avulso (regra 19): só para quem pediu, com chave própria (não consome a do sábado). */
export async function sendWeeklySummaryTo(input: {
  week: LocalDate;
  today: LocalDate;
  origin?: string;
  recipient: WeeklyRecipient;
  now: string;
}): Promise<{ week: LocalDate; subject: string }> {
  const summary = await composeWeeklySummary(input.week, input.today, input.recipient.userId);
  await enqueue(getServiceClient(), summary, input.recipient, {
    origin: input.origin,
    idempotencyKey: manualIdempotencyKey(input.recipient.userId, input.now),
    manual: true,
  });
  return { week: summary.week, subject: summary.subject };
}
