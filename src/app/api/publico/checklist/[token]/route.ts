import { NextResponse, type NextRequest } from 'next/server';
import { parseOperatorRun, planOperatorRun, type ChecklistMutation } from '@/application/use-cases/checklist-commands';
import {
  CHECKLIST_TOKEN,
  CHECKLIST_WINDOW_DAYS,
  nonConformities,
  operatorDues,
  shiftDay,
  type ChecklistEquipment,
  type OperatorChecklistView,
  type OperatorRunInput,
} from '@/domain/equipment-checklist';
import {
  applyChecklistMutation,
  ChecklistConflictError,
  ChecklistUnavailableError,
  findEquipmentByToken,
  findWorkLabel,
  loadChecklist,
} from '@/infrastructure/repositories/supabase/checklist-repository';
import { commandContext } from '@/infrastructure/clock';
import { logRouteError } from '@/infrastructure/log';

export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' };
const responseError = (error: string, status: number) => NextResponse.json({ error }, { status, headers });
const unavailable = (reason: 'not_found' | 'inactive' | 'unavailable') =>
  NextResponse.json({ available: false, reason } satisfies OperatorChecklistView, { headers });

/** Quem grava pelo link não tem perfil: a autoria fica marcada assim, e o nome do operador vai na inspeção. */
const LINK_ACTOR = 'qr';
/** Corpo máximo do envio: 4 fotos comprimidas, a assinatura e as respostas. */
const MAX_BODY = 6 * 1024 * 1024;
/** Freio por link: o segredo é a única chave, então um link não aceita mais que isto. Em memória, por
 * processo — o sistema roda num servidor só. */
const WINDOW_MS = 10 * 60 * 1000;
const MAX_POSTS = 20;
const posts = new Map<string, number[]>();
function throttled(token: string): boolean {
  const now = Date.now();
  const recent = (posts.get(token) ?? []).filter(at => now - at < WINDOW_MS);
  if (recent.length >= MAX_POSTS) {
    posts.set(token, recent);
    return true;
  }
  recent.push(now);
  posts.set(token, recent);
  if (posts.size > 5000) for (const [key, times] of posts) if (!times.some(at => now - at < WINDOW_MS)) posts.delete(key);
  return false;
}

async function viewFor(equipment: ChecklistEquipment, today: string): Promise<OperatorChecklistView> {
  const [data, work] = await Promise.all([
    loadChecklist(equipment.workId, shiftDay(today, -CHECKLIST_WINDOW_DAYS)),
    findWorkLabel(equipment.workId),
  ]);
  return {
    available: true,
    today,
    work: work ?? { code: '', name: '' },
    equipment: { name: equipment.name, equipmentType: equipment.equipmentType },
    dues: operatorDues(data, equipment.id, today),
  };
}

/** O checklist de equipamentos pelo QR (12/11/2026), SEM login: o segredo do endereço identifica o
 * equipamento, e a resposta traz só ele — obra, nome, tipo e os checklists com a situação do período. O
 * proxy deixa `/api/publico/` passar sem sessão; nada aqui lê perfil. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!CHECKLIST_TOKEN.test(token)) return unavailable('not_found');
  try {
    const equipment = await findEquipmentByToken(token);
    if (!equipment) return unavailable('not_found');
    if (!equipment.active) return unavailable('inactive');
    return NextResponse.json(await viewFor(equipment, commandContext(LINK_ACTOR).today), { headers });
  } catch (error) {
    if (error instanceof ChecklistUnavailableError) return unavailable('unavailable');
    logRouteError('GET /api/publico/checklist', error, {});
    return responseError('Não foi possível carregar o checklist. Tente de novo.', 502);
  }
}

/** Registra UMA inspeção nova, de hoje, de um checklist pendente deste equipamento, com nome e assinatura
 * (`planOperatorRun`). Obra, equipamento, data e autoria são do servidor; o corpo só traz o modelo, as
 * respostas, o nome, a assinatura e as fotos. Devolve a tela atualizada. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!CHECKLIST_TOKEN.test(token)) return responseError('Link inválido. Leia o QR do equipamento de novo.', 404);
  if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY) return responseError('Envio grande demais. Remova uma foto.', 413);
  if (throttled(token)) return responseError('Muitos envios por este link. Aguarde alguns minutos.', 429);

  let input: OperatorRunInput;
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY) return responseError('Envio grande demais. Remova uma foto.', 413);
    input = parseOperatorRun(JSON.parse(raw));
  } catch (error) {
    return responseError(
      error instanceof SyntaxError ? 'Envio inválido.' : error instanceof Error ? error.message : 'Envio inválido.',
      400,
    );
  }

  try {
    const equipment = await findEquipmentByToken(token);
    if (!equipment) return responseError('Link inválido. Leia o QR do equipamento de novo.', 404);
    const context = commandContext(LINK_ACTOR);
    const data = await loadChecklist(equipment.workId, shiftDay(context.today, -CHECKLIST_WINDOW_DAYS));
    let mutation: ChecklistMutation;
    try {
      mutation = planOperatorRun(data, input, context, equipment);
    } catch (error) {
      return responseError(error instanceof Error ? error.message : 'Envio inválido.', 400);
    }
    await applyChecklistMutation(mutation);
    const saved = mutation.insert.runs[0];
    return NextResponse.json(
      {
        view: await viewFor(equipment, context.today),
        saved: { modelName: saved.modelName, at: context.now, nonConformities: nonConformities(saved) },
      },
      { headers },
    );
  } catch (error) {
    if (error instanceof ChecklistUnavailableError)
      return responseError('O checklist pelo QR ainda não está disponível. Avise o técnico de segurança.', 503);
    if (error instanceof ChecklistConflictError) return responseError('Este checklist acabou de ser preenchido. Atualize a página.', 409);
    logRouteError('POST /api/publico/checklist', error, {});
    return responseError('Não foi possível enviar. Confira a internet e tente de novo.', 502);
  }
}
