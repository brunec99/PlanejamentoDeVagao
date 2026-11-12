import { weeklySendDue } from '../domain/weekly-summary';
import { logRouteError } from './log';

/** Agendador do resumo semanal (12/11/2026, regra 20): um temporizador dentro do próprio servidor do Obra 360,
 * iniciado por `src/instrumentation.ts`. A cada 5 minutos confere o relógio de Brasília; no sábado, das 08:00
 * em diante, monta o resumo e o enfileira na fila de e-mail do Takt Hub. Se o servidor estava fora do ar às
 * 08:00, envia ao voltar, ainda no sábado. Nunca duplica: a fila recusa a mesma semana para a mesma pessoa
 * (chave de idempotência), e este processo lembra a semana que já enviou. Qualquer falha vai para o log e a
 * tentativa se repete no ciclo seguinte; nada aqui derruba o servidor. */

const LABEL = 'resumo-semanal';
export const WEEKLY_TICK_MS = 5 * 60_000;
const FIRST_TICK_MS = 30_000;
/** A chave de serviço que o Dockerfile passa só para o `next build` passar. */
const BUILD_KEY = 'apenas-para-o-build';

type Env = Record<string, string | undefined>;

/** O agendador roda neste processo? Só em produção, no runtime Node, com as credenciais do servidor, fora do
 * build e sem `WEEKLY_SUMMARY_DISABLED=1`. Puro. */
export function weeklySchedulerEnabled(env: Env): boolean {
  if (env.NODE_ENV !== 'production') return false;
  if (env.NEXT_RUNTIME && env.NEXT_RUNTIME !== 'nodejs') return false;
  if (env.NEXT_PHASE === 'phase-production-build') return false;
  if (env.WEEKLY_SUMMARY_DISABLED === '1' || env.WEEKLY_SUMMARY_DISABLED === 'true') return false;
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY === BUILD_KEY) return false;
  return true;
}

export type WeeklyTickOutcome = 'not-due' | 'already-sent' | 'sent' | 'retry' | 'skipped';
export interface WeeklyTickState {
  /** Semana (segunda-feira) que este processo já enviou por inteiro. */
  sentWeek?: string;
  /** Semana em que o motivo de não enviar (migração ausente, ninguém com a chave) já foi registrado. */
  notedWeek?: string;
  running?: boolean;
}
type SendResult =
  { status: 'migration-missing' } | { status: 'no-recipients' } | { status: 'sent'; recipients: number; created: number; failed: number };

/** Um ciclo. `send` e `log` vêm de fora para o teste. Sem destinatário ou sem a migração 0050, o ciclo não marca
 * a semana como enviada (alguém pode ligar a chave ainda no sábado) e registra o motivo uma vez por semana. */
export async function weeklyTick(
  now: Date,
  state: WeeklyTickState,
  send: (input: { week: string; today: string }) => Promise<SendResult>,
  log: (message: string, context: Record<string, unknown>) => void = () => {},
): Promise<WeeklyTickOutcome> {
  const due = weeklySendDue(now);
  if (!due) return 'not-due';
  if (state.sentWeek === due.week) return 'already-sent';
  if (state.running) return 'skipped';
  state.running = true;
  try {
    const result = await send(due);
    if (result.status !== 'sent') {
      if (state.notedWeek !== due.week) {
        state.notedWeek = due.week;
        log(
          result.status === 'migration-missing'
            ? 'Resumo semanal não enviado: migração 0050 não aplicada.'
            : 'Resumo semanal não enviado: nenhum admin com a chave ligada.',
          { week: due.week },
        );
      }
      return 'skipped';
    }
    if (result.failed > 0) return 'retry';
    state.sentWeek = due.week;
    log('Resumo semanal enfileirado.', { week: due.week, recipients: result.recipients, created: result.created });
    return 'sent';
  } finally {
    state.running = false;
  }
}

const STARTED = Symbol.for('obra360.weeklySummaryScheduler');

/** Inicia o temporizador uma vez por processo. O envio é importado só na hora do ciclo, para o servidor subir
 * sem carregar as leituras do dashboard. */
export function startWeeklySummaryScheduler(env: Env = process.env): boolean {
  if (!weeklySchedulerEnabled(env)) return false;
  const holder = globalThis as unknown as Record<symbol, boolean | undefined>;
  if (holder[STARTED]) return false;
  holder[STARTED] = true;
  const state: WeeklyTickState = {};
  const tick = () => {
    weeklyTick(
      new Date(),
      state,
      async due => {
        const { sendWeeklySummary } = await import('./email/weekly-summary');
        return sendWeeklySummary({ ...due, origin: process.env.PUBLIC_SITE_URL });
      },
      (message, context) => console.log(JSON.stringify({ level: 'info', route: LABEL, at: new Date().toISOString(), message, ...context })),
    ).catch(cause => logRouteError(LABEL, cause, { part: 'tick' }));
  };
  setTimeout(tick, FIRST_TICK_MS).unref?.();
  setInterval(tick, WEEKLY_TICK_MS).unref?.();
  return true;
}
