import { NextResponse, type NextRequest } from 'next/server';
import { getRouteProfile } from '@/infrastructure/auth/supabase-server';
import { getServiceClient } from '@/infrastructure/repositories/supabase/client';
import { logRouteError } from '@/infrastructure/log';
import { saveUserSettings, userSettings } from '@/infrastructure/agent/ledger';

export const runtime = 'nodejs';

/** Limites do agente de IA por pessoa (27/10/2026): o admin define um teto mensal individual em dólares
 * (nulo = só os tetos gerais valem) e pode cortar o acesso. Só o que vier no corpo muda; o resto fica. */

const headers = { 'Cache-Control': 'no-store' };
const fail = (error: string, status: number) => NextResponse.json({ error }, { status, headers });
const MIGRATION_MESSAGE = 'Aplique a migração 0035_agent.sql no Supabase para usar o agente de IA.';

/** `undefined` = não veio; `null` = sem limite; número ≥ 0 com duas casas; `false` = inválido. */
function parseLimit(value: unknown): number | null | undefined | false {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1_000_000) return false;
  return Math.round(value * 100) / 100;
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const profile = await getRouteProfile();
  if (profile?.role !== 'admin') return fail('Somente administradores podem alterar os limites do agente de IA.', 403);
  const { userId } = await params;
  if (!userId) return fail('Usuário não informado.', 400);
  let body: { monthlyLimitUsd?: unknown; blocked?: unknown };
  try {
    body = await request.json();
  } catch {
    return fail('Corpo da requisição inválido.', 400);
  }
  if (!body || typeof body !== 'object') return fail('Corpo da requisição inválido.', 400);
  const limit = parseLimit(body.monthlyLimitUsd);
  if (limit === false) return fail('Limite mensal inválido: use um número em dólares maior ou igual a zero, ou nulo para sem limite.', 400);
  if (body.blocked !== undefined && typeof body.blocked !== 'boolean') return fail('"blocked" deve ser verdadeiro ou falso.', 400);
  if (limit === undefined && body.blocked === undefined) return fail('Nada a alterar.', 400);

  const target = await getServiceClient().from('profiles').select('id').eq('id', userId).maybeSingle();
  if (target.error) {
    logRouteError('PUT /api/admin/agente/[userId]', target.error, { actorId: profile.id, userId });
    return fail('Não foi possível conferir o usuário. Tente de novo em instantes.', 502);
  }
  if (!target.data) return fail('Usuário não encontrado.', 404);

  const current = await userSettings(userId);
  if (!current.ok) {
    if (current.missing) return fail(MIGRATION_MESSAGE, 503);
    logRouteError('PUT /api/admin/agente/[userId]', current.error, { actorId: profile.id, userId });
    return fail('Não foi possível ler os limites atuais. Tente de novo em instantes.', 502);
  }
  const saved = await saveUserSettings({
    userId,
    monthlyLimitUsd: limit === undefined ? (current.value?.monthlyLimitUsd ?? null) : limit,
    blocked: typeof body.blocked === 'boolean' ? body.blocked : (current.value?.blocked ?? false),
    updatedBy: profile.id,
  });
  if (!saved.ok) {
    if (saved.missing) return fail(MIGRATION_MESSAGE, 503);
    logRouteError('PUT /api/admin/agente/[userId]', saved.error, { actorId: profile.id, userId });
    return fail('Não foi possível gravar os limites. Tente de novo em instantes.', 502);
  }
  return NextResponse.json(
    { id: saved.value.userId, monthlyLimitUsd: saved.value.monthlyLimitUsd, blocked: saved.value.blocked },
    { headers },
  );
}
