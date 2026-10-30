import { NextResponse, type NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getRouteProfile } from '@/infrastructure/auth/supabase-server';
import { getServiceClient } from '@/infrastructure/repositories/supabase/client';
import { logRouteError } from '@/infrastructure/log';
import { startOfWeek, validateDate } from '@/domain/validation';
import { buildRanking, MIN_RANKED_WEEKS, type ClosingRankingResponse, type PpcLine, type RankingWork } from '@/domain/closing-ranking';

export const runtime = 'nodejs';
const ROUTE = 'GET /api/curto-prazo/ranking';
const noStore = { 'Cache-Control': 'no-store' };
const PAGE = 1000;
/** Páginas lidas ao mesmo tempo: a Blentt sozinha passa de 6 mil linhas. */
const PARALLEL = 6;
const responseError = (error: string, status: number) => NextResponse.json({ error }, { status, headers: noStore });
const unavailable = (message: string) =>
  NextResponse.json({ available: false, message } satisfies ClosingRankingResponse, { headers: noStore });

interface LineRow {
  work_id: string;
  week_start: string;
  fulfilled: boolean | null;
}

/** Só as três colunas que o PPC lê, de todas as obras, até a semana. O PostgREST devolve no máximo
 * 1000 linhas por vez: a primeira página traz a contagem, e as demais vêm em lotes paralelos. */
async function fetchLines(client: SupabaseClient, until: string): Promise<PpcLine[]> {
  const page = (from: number, count?: 'exact') =>
    client
      .from('weekly_commitments')
      .select('work_id, week_start, fulfilled', count ? { count } : undefined)
      .lte('week_start', until)
      .order('id')
      .range(from, from + PAGE - 1);
  const first = await page(0, 'exact');
  if (first.error) throw new Error(`Falha ao ler weekly_commitments: ${first.error.message}`);
  const rows: LineRow[] = [...(first.data as LineRow[])];
  const offsets: number[] = [];
  for (let from = PAGE; from < (first.count ?? 0); from += PAGE) offsets.push(from);
  for (let i = 0; i < offsets.length; i += PARALLEL) {
    const pages = await Promise.all(offsets.slice(i, i + PARALLEL).map(from => page(from)));
    for (const result of pages) {
      if (result.error) throw new Error(`Falha ao ler weekly_commitments: ${result.error.message}`);
      rows.push(...(result.data as LineRow[]));
    }
  }
  return rows.map(row => ({
    workId: row.work_id,
    weekStart: row.week_start,
    ...(row.fulfilled === null ? {} : { fulfilled: row.fulfilled }),
  }));
}

/** Ranking do PPC das obras para a primeira página do PDF do fechamento. Vale para qualquer pessoa
 * com obra liberada, e por decisão do usuário (30/10/2026) mostra todas as obras ativas pelo nome; de
 * outra obra só saem números agregados, nunca linhas, empreiteiros ou justificativas. A obra do PDF
 * (`obra`) entra mesmo inativa, se a pessoa tiver acesso a ela. Falha depois da autorização responde
 * 200 com `available: false`: o PDF sai com o ranking indisponível, nunca deixa de sair. */
export async function GET(request: NextRequest) {
  const semana = request.nextUrl.searchParams.get('semana') ?? '';
  if (!semana) return responseError('Semana não informada.', 400);
  let week: string;
  try {
    validateDate(semana);
    week = startOfWeek(semana);
  } catch {
    return responseError('Semana inválida: use AAAA-MM-DD.', 400);
  }
  const profile = await getRouteProfile();
  if (!profile) return responseError('Perfil não provisionado. Contate o gestor.', 403);
  if (!profile.workIds.length) return responseError('Nenhuma obra liberada para você.', 403);
  const own = request.nextUrl.searchParams.get('obra') ?? '';
  try {
    const client = getServiceClient();
    const [works, lines] = await Promise.all([client.from('works').select('id, name, code, active'), fetchLines(client, week)]);
    if (works.error) throw new Error(`Falha ao ler works: ${works.error.message}`);
    const listed: RankingWork[] = (works.data as { id: string; name: string; code: string; active: boolean }[])
      .filter(work => work.active || (work.id === own && profile.workIds.includes(own)))
      .map(work => ({ workId: work.id, name: work.name, code: work.code }));
    const body: ClosingRankingResponse = { available: true, week, minWeeks: MIN_RANKED_WEEKS, entries: buildRanking(listed, lines, week) };
    return NextResponse.json(body, { headers: noStore });
  } catch (cause) {
    logRouteError(ROUTE, cause, { actorId: profile.id, week });
    return unavailable('Ranking das obras indisponível no momento.');
  }
}
