import { NextResponse } from 'next/server';
import { getRouteProfile } from '@/infrastructure/auth/supabase-server';
import { logRouteError } from '@/infrastructure/log';
import { sendWeeklySummaryTo, setWeeklySummary, WeeklySummaryUnavailableError } from '@/infrastructure/email/weekly-summary';
import { brasiliaClock, lastClosedWeek } from '@/domain/weekly-summary';

export const runtime = 'nodejs';
const ROUTE = '/api/dashboard/resumo-semanal';
const headers = { 'Cache-Control': 'no-store' };
const responseError = (error: string, status: number) => NextResponse.json({ error }, { status, headers });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** No máximo um envio avulso por minuto por pessoa (regra 19). Por processo: basta para o clique repetido. */
const MIN_INTERVAL_MS = 60_000;
const lastSent = new Map<string, number>();

/** Resumo semanal por e-mail (12/11/2026). Só admin.
 * - `POST` sem corpo (ou `{}`): "Enviar o resumo agora para mim" (regra 19). Cobre a última semana encerrada (no
 *   sábado e no domingo, a que acabou de terminar; de segunda a sexta, a anterior) e não consome o envio do sábado.
 * - `POST { userId, enabled }`: liga ou desliga a chave "Receber o resumo semanal" de um admin
 *   (`profiles.weekly_summary`, migração 0050), fora do `commit_planning`, como a marca de TST. */
export async function POST(request: Request) {
  const profile = await getRouteProfile().catch(() => null);
  if (!profile) return responseError('Perfil não provisionado. Contate o gestor.', 403);
  if (profile.role !== 'admin') return responseError('Só administradores usam o resumo semanal.', 403);

  const body = (await request.json().catch(() => null)) as { userId?: unknown; enabled?: unknown } | null;
  if (body && (body.userId !== undefined || body.enabled !== undefined)) {
    const userId = typeof body.userId === 'string' ? body.userId : '';
    if (!UUID.test(userId)) return responseError('Usuário não informado.', 400);
    if (typeof body.enabled !== 'boolean') return responseError('Informe se a pessoa recebe o resumo semanal.', 400);
    try {
      if (!(await setWeeklySummary(userId, body.enabled))) return responseError('Só administradores recebem o resumo semanal.', 404);
      return NextResponse.json({ userId, weeklySummary: body.enabled }, { headers });
    } catch (cause) {
      if (cause instanceof WeeklySummaryUnavailableError) return responseError(cause.message, 503);
      logRouteError(`POST ${ROUTE}`, cause, { actorId: profile.id, userId, enabled: body.enabled });
      return responseError('Não foi possível gravar. Tente novamente.', 502);
    }
  }

  const now = Date.now();
  const previous = lastSent.get(profile.id);
  if (previous && now - previous < MIN_INTERVAL_MS)
    return responseError('O resumo acabou de ser enviado. Aguarde um minuto para pedir de novo.', 429);
  lastSent.set(profile.id, now);
  const today = brasiliaClock(new Date(now)).day;
  try {
    const sent = await sendWeeklySummaryTo({
      week: lastClosedWeek(today),
      today,
      origin: process.env.PUBLIC_SITE_URL,
      recipient: { userId: profile.id, name: profile.name },
      now: new Date(now).toISOString(),
    });
    return NextResponse.json({ sent: true, week: sent.week, subject: sent.subject }, { headers });
  } catch (cause) {
    lastSent.delete(profile.id);
    logRouteError(`POST ${ROUTE}`, cause, { actorId: profile.id });
    return responseError(
      'Não foi possível enviar o resumo. Se o modelo do e-mail ainda não foi publicado no Takt Hub, o envio não sai; tente de novo em instantes.',
      502,
    );
  }
}
