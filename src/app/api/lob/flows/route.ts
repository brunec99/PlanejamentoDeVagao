import { NextResponse } from 'next/server';
import { requireModuleAccess } from '@/infrastructure/auth/supabase-server';
import { isLobError, validateFlowDocument } from '@/domain/lob';
import {
  deleteFlow,
  getFlow,
  insertFlow,
  listFlows,
  LobConflictError,
  LobUnavailableError,
  updateFlow,
} from '@/infrastructure/repositories/supabase/lob-repository';
import { logRouteError } from '@/infrastructure/log';

export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'no-store' };
const responseError = (error: string, status: number) => NextResponse.json({ error }, { status, headers });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Fluxos de serviços da empresa (regra 3): lista, cria, altera com trava de revisão e exclui.
 * Planejador, gestor e admin escrevem; consulta só lê (regra 4). */
async function gate(write: boolean) {
  const result = await requireModuleAccess('longo-prazo');
  if (result.error) return { error: result.error };
  const { profile } = result.access;
  if (!profile) return { error: responseError('Perfil não provisionado. Contate o gestor.', 403) };
  if (write && profile.role === 'viewer') return { error: responseError('Seu perfil permite apenas consulta.', 403) };
  return { profile };
}
function handle(route: string, error: unknown, actorId: string) {
  if (error instanceof LobUnavailableError) return responseError(error.message, 503);
  if (error instanceof LobConflictError) return responseError(error.message, 409);
  if (isLobError(error)) return responseError(error.message, 400);
  logRouteError(route, error, { actorId });
  return responseError('Não foi possível acessar os fluxos de serviços. Tente novamente.', 502);
}

export async function GET() {
  const g = await gate(false);
  if (g.error) return g.error;
  try {
    return NextResponse.json({ available: true, flows: await listFlows() }, { headers });
  } catch (error) {
    if (error instanceof LobUnavailableError) return NextResponse.json({ available: false, flows: [] }, { headers });
    return handle('GET /api/lob/flows', error, g.profile.id);
  }
}

export async function POST(request: Request) {
  const g = await gate(true);
  if (g.error) return g.error;
  const body = (await request.json().catch(() => null)) as { flowId?: unknown; document?: unknown } | null;
  const flowId = typeof body?.flowId === 'string' && UUID.test(body.flowId) ? body.flowId : crypto.randomUUID();
  try {
    const document = validateFlowDocument(body?.document);
    const flow = await insertFlow(flowId, document, g.profile.id);
    return NextResponse.json({ flow }, { headers });
  } catch (error) {
    return handle('POST /api/lob/flows', error, g.profile.id);
  }
}

export async function PUT(request: Request) {
  const g = await gate(true);
  if (g.error) return g.error;
  const body = (await request.json().catch(() => null)) as { flowId?: unknown; revision?: unknown; document?: unknown } | null;
  if (typeof body?.flowId !== 'string' || !body.flowId) return responseError('Fluxo não informado.', 400);
  if (typeof body.revision !== 'number' || !Number.isInteger(body.revision) || body.revision < 1)
    return responseError('Revisão inválida.', 400);
  try {
    const document = validateFlowDocument(body.document);
    if (!(await getFlow(body.flowId))) return responseError('Fluxo não encontrado. Ele pode ter sido excluído.', 404);
    const flow = await updateFlow(body.flowId, body.revision, document, g.profile.id);
    return NextResponse.json({ flow }, { headers });
  } catch (error) {
    return handle('PUT /api/lob/flows', error, g.profile.id);
  }
}

export async function DELETE(request: Request) {
  const g = await gate(true);
  if (g.error) return g.error;
  const body = (await request.json().catch(() => null)) as { flowId?: unknown } | null;
  if (typeof body?.flowId !== 'string' || !body.flowId) return responseError('Fluxo não informado.', 400);
  try {
    await deleteFlow(body.flowId);
    return NextResponse.json({ ok: true }, { headers });
  } catch (error) {
    return handle('DELETE /api/lob/flows', error, g.profile.id);
  }
}
