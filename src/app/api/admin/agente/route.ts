import { NextResponse, type NextRequest } from 'next/server';
import { getRouteProfile } from '@/infrastructure/auth/supabase-server';
import { getServiceClient } from '@/infrastructure/repositories/supabase/client';
import { todayInSaoPaulo } from '@/infrastructure/clock';
import { logRouteError } from '@/infrastructure/log';
import { agentConfigFromEnv, monthKey, workBudgetOf } from '@/domain/agent-cost';
import { allUserSettings, monthUsage, type MonthUsage, type UserAgentSettings } from '@/infrastructure/agent/ledger';

export const runtime = 'nodejs';

/** Painel do admin para o agente de IA (27/10/2026): gasto do mês por pessoa e por obra, limites
 * individuais e corte de acesso. Só leitura aqui; o PUT em `[userId]` grava os limites. */

const headers = { 'Cache-Control': 'no-store' };
const fail = (error: string, status: number) => NextResponse.json({ error }, { status, headers });
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
type ProfileRow = { id: string; name: string; role: string };
type WorkRow = { id: string; code: string; name: string; active: boolean };

export async function GET(request: NextRequest) {
  const profile = await getRouteProfile();
  if (profile?.role !== 'admin') return fail('Somente administradores podem ver o uso do agente de IA.', 403);
  const requested = request.nextUrl.searchParams.get('month');
  if (requested !== null && !MONTH.test(requested)) return fail('Mês inválido: use YYYY-MM.', 400);
  const month = requested ?? monthKey(todayInSaoPaulo());
  const config = agentConfigFromEnv(process.env);

  const client = getServiceClient();
  const [usage, settings, profiles, works] = await Promise.all([
    monthUsage(month),
    allUserSettings(),
    client.from('profiles').select('id, name, role').order('name'),
    client.from('works').select('id, code, name, active').order('code'),
  ]);
  if (profiles.error || works.error) {
    logRouteError('GET /api/admin/agente', profiles.error ?? works.error, { actorId: profile.id, month });
    return fail('Não foi possível listar usuários e obras. Tente de novo em instantes.', 502);
  }
  const migrationMissing = (!usage.ok && usage.missing) || (!settings.ok && settings.missing);
  if (!migrationMissing && (!usage.ok || !settings.ok)) {
    logRouteError('GET /api/admin/agente', !usage.ok ? usage.error : !settings.ok ? settings.error : 'erro', {
      actorId: profile.id,
      month,
    });
    return fail('Não foi possível ler o uso do agente de IA. Tente de novo em instantes.', 502);
  }
  const used: MonthUsage = usage.ok ? usage.value : { byWork: new Map(), byUser: new Map(), totalUsd: 0, totalCalls: 0 };
  const limits = new Map<string, UserAgentSettings>((settings.ok ? settings.value : []).map(s => [s.userId, s]));
  const workRows = (works.data ?? []) as WorkRow[];
  const activeWorks = workRows.filter(w => w.active).length;
  const workBudgetUsd = workBudgetOf(config.budgetUsd, activeWorks);

  const users = ((profiles.data ?? []) as ProfileRow[])
    .map(row => {
      const spent = used.byUser.get(row.id);
      const limit = limits.get(row.id);
      return {
        id: row.id,
        name: row.name,
        role: row.role,
        usd: spent?.usd ?? 0,
        calls: spent?.calls ?? 0,
        leituras: spent?.leituras ?? 0,
        perguntas: spent?.perguntas ?? 0,
        lastAt: spent?.lastAt ?? null,
        monthlyLimitUsd: limit?.monthlyLimitUsd ?? null,
        blocked: limit?.blocked ?? false,
      };
    })
    .sort((a, b) => b.usd - a.usd || a.name.localeCompare(b.name, 'pt-BR'));
  const workList = workRows
    .map(row => {
      const spent = used.byWork.get(row.id);
      return {
        id: row.id,
        code: row.code,
        name: row.name,
        active: row.active,
        usd: spent?.usd ?? 0,
        calls: spent?.calls ?? 0,
        workBudgetUsd,
      };
    })
    .sort((a, b) => b.usd - a.usd || Number(b.active) - Number(a.active) || a.code.localeCompare(b.code, 'pt-BR'));

  return NextResponse.json(
    {
      month,
      budgetUsd: config.budgetUsd,
      model: config.model,
      configured: !!config.apiKey,
      migrationMissing,
      totals: { monthUsd: used.totalUsd, calls: used.totalCalls },
      users,
      works: workList,
    },
    { headers },
  );
}
