/**
 * Importa a planilha "SST - Controle geral" (aba SST) para a aba 6, Segurança do trabalho.
 *
 * 1. Exportar a aba SST em CSV (Arquivo → Fazer download → Valores separados por vírgula). As imagens
 *    coladas nas células não vêm no CSV; o texto digitado nas colunas de foto vem e vira observação.
 * 2. Simular e depois gravar:
 *      node --import tsx scripts/import-seguranca.ts <sst.csv> --actor-email <e-mail> [--env-file <arquivo>]
 *        [--obras '{"My Sunset":"<id ou código da obra>"}'] [--only "Atmos,Tauá"] [--photos fotos.json] [--apply]
 *
 * Sem --apply é SIMULAÇÃO: lê o banco, monta tudo em memória e imprime o relatório por obra, sem gravar
 * nada. Se a migração 0040 ainda não foi aplicada, a simulação segue com o catálogo semeado de 16 tipos e
 * nenhum apontamento gravado, e avisa; a gravação exige a migração.
 *
 * As regras são as da tela (`planSafetyCommand` com `importing: true`, via
 * `src/application/use-cases/import-safety.ts`): o apontamento nasce com origem "planilha" e entra finalizado
 * quando a planilha tem a data de correção, sem exigir a foto. Obra é achada pelo nome ou código (ou por
 * --obras); a que não achar fica de fora, relatada — o script nunca cria obra. Rodar de novo não duplica:
 * só acrescenta apontamentos, finalizações e fotos novos, e nunca sobrescreve apontamento já gravado.
 *
 * --photos: passada posterior das fotos, por linha da planilha (JSON inline ou arquivo):
 *   { "<linha>": { "issue": ["https://…"], "correction": ["https://…"] } }
 * Cada endereço é baixado, comprimido como no navegador (escada de `compress-image.ts`), enviado ao bucket
 * `seguranca` e registrado (`add_photo`). Foto já registrada (mesmo apontamento e endereço) é pulada.
 *
 * Ambiente: NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY, do processo ou de --env-file. Sem padrão
 * de propósito: o .env.local deste repositório aponta para o Supabase antigo. Nenhum segredo é impresso.
 * O ator precisa ser admin.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { parseArgs } from 'node:util';
import {
  matchWorks,
  parseCsv,
  planSafetyImport,
  readSheet,
  SAFETY_IMPORT_ERRORS,
  SAFETY_IMPORT_WARNINGS,
  safetyKey,
  seededSafetyTypes,
  type ImportIssue,
  type PhotoSources,
  type PhotoUpload,
  type SafetyImportPlan,
  type WorkMatch,
  type WorkRef,
  type WorkTarget,
} from '../src/application/use-cases/import-safety';
import { SAFETY_BUCKET, SAFETY_LIMITS, type SafetyType } from '../src/domain/safety';
import { commandContext } from '../src/infrastructure/clock';
import { getServiceClient } from '../src/infrastructure/repositories/supabase/client';
import { applyMutation, loadSafety, SafetyUnavailableError } from '../src/infrastructure/repositories/supabase/safety-repository';
import { IMAGE_LADDER, MAX_SOURCE_BYTES, THUMB_LADDER, type CompressionStep } from '../src/modules/terminalidade/compress-image';

const USAGE =
  'Uso: node --import tsx scripts/import-seguranca.ts <sst.csv> (--actor-email <e-mail> | --actor <profileId>) [--env-file <arquivo>] [--obras <json>] [--only "Obra A,Obra B"] [--photos <json>] [--apply]';

/** Obras da planilha que ficam de fora por decisão do usuário (05/11/2026): não existem no sistema e não
 * devem ser criadas por aqui. Sem destino, aparecem como "fora por decisão", sem erro. */
const OUT_BY_DECISION = ['My Sunset', 'Amariles'];

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const { values, positionals } = (() => {
  try {
    return parseArgs({
      allowPositionals: true,
      options: {
        actor: { type: 'string' },
        'actor-email': { type: 'string' },
        'env-file': { type: 'string' },
        obras: { type: 'string' },
        only: { type: 'string' },
        photos: { type: 'string' },
        apply: { type: 'boolean', default: false },
        help: { type: 'boolean', default: false },
      },
    });
  } catch (error) {
    return fail(`${(error as Error).message}\n${USAGE}`);
  }
})();
if (values.help) {
  console.log(USAGE);
  process.exit(0);
}
const [csvPath] = positionals;
if (!csvPath || positionals.length > 1) fail(USAGE);
if (!values.actor && !values['actor-email']) fail(`Informe --actor-email ou --actor.\n${USAGE}`);
if (!fs.existsSync(csvPath)) fail(`CSV não encontrado: ${csvPath}`);

if (values['env-file']) {
  if (!fs.existsSync(values['env-file'])) fail(`Arquivo de ambiente não encontrado: ${values['env-file']}`);
  process.loadEnvFile(values['env-file']);
}
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)
  fail('Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (no ambiente ou em --env-file).');

/** JSON inline (começa com "{") ou caminho de arquivo. */
function readJsonOption<T>(value: string | undefined, label: string): T | undefined {
  if (!value) return undefined;
  try {
    const text = value.trim().startsWith('{') ? value : fs.readFileSync(value, 'utf8');
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('esperado um objeto JSON');
    return parsed as T;
  } catch (error) {
    return fail(`--${label} inválido: ${(error as Error).message}`);
  }
}
const overrides = readJsonOption<Record<string, string>>(values.obras, 'obras') ?? {};
const photoSources = readJsonOption<PhotoSources>(values.photos, 'photos');

/** UUID estável (formato v5) a partir de um texto: é o que torna a importação repetível. */
function stableId(seed: string) {
  const hex = createHash('sha1').update(`obra360-seguranca|${seed}`).digest('hex');
  const variant = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

const number = (n: number) => n.toLocaleString('pt-BR');

async function findActor() {
  const client = getServiceClient();
  let id = values.actor;
  if (!id) {
    const email = values['actor-email']!.toLowerCase();
    for (let page = 1; !id; page++) {
      const { data, error } = await client.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) fail(`Falha ao procurar o e-mail no Auth: ${error.message}`);
      id = data.users.find(u => u.email?.toLowerCase() === email)?.id;
      if (data.users.length < 1000) break;
    }
    if (!id) fail(`Nenhuma conta com o e-mail ${values['actor-email']}.`);
  }
  const { data, error } = await client.from('profiles').select('id, name, role').eq('id', id).maybeSingle();
  if (error) fail(`Falha ao ler o perfil: ${error.message}`);
  if (!data) fail(`Perfil ${id} não encontrado no Obra 360.`);
  const profile = data as { id: string; name: string; role: string };
  if (profile.role !== 'admin') fail(`O perfil ${profile.name} é ${profile.role}; a importação exige admin.`);
  return profile;
}

async function loadWorks(): Promise<WorkRef[]> {
  const { data, error } = await getServiceClient().from('works').select('id, name, code');
  if (error) fail(`Falha ao ler as obras: ${error.message}`);
  return (data ?? []) as WorkRef[];
}

/** Dados atuais de cada obra e a lista única de tipos. Sem a migração 0040, segue com o catálogo semeado. */
async function loadTargets(matched: WorkMatch[], now: string) {
  let types: SafetyType[] | undefined;
  let unavailable = false;
  const targets: WorkTarget[] = [];
  for (const { obra, work } of matched) {
    let items: WorkTarget['items'] = [];
    let photos: WorkTarget['photos'] = [];
    if (!unavailable)
      try {
        const data = await loadSafety(work.id);
        types = data.types;
        items = data.items;
        photos = data.photos;
      } catch (error) {
        if (!(error instanceof SafetyUnavailableError)) throw error;
        unavailable = true;
      }
    targets.push({ obra, workId: work.id, workName: work.name, items, photos });
  }
  return { targets, types: unavailable || !types ? seededSafetyTypes(now) : types, unavailable };
}

const ROW_LIST_LIMIT = 40;
const MESSAGE_LIMIT = 12;
function printIssues(title: string, issues: ImportIssue[], labels: Record<string, string>) {
  if (!issues.length) return;
  console.log(`\n${title}:`);
  const byKind = new Map<string, ImportIssue[]>();
  for (const issue of issues) byKind.set(issue.kind, [...(byKind.get(issue.kind) ?? []), issue]);
  for (const [kind, list] of byKind) {
    console.log(`  ${labels[kind] ?? kind} (${number(list.length)}):`);
    if (list.length <= MESSAGE_LIMIT)
      for (const issue of list) console.log(`    ${issue.row ? `linha ${issue.row}: ` : ''}${issue.message}`);
    else {
      const rows = list.map(i => i.row).filter((r): r is number => r !== undefined);
      const shown = rows.slice(0, ROW_LIST_LIMIT).join(', ');
      console.log(`    linhas ${shown}${rows.length > ROW_LIST_LIMIT ? ` … (+${number(rows.length - ROW_LIST_LIMIT)})` : ''}`);
    }
  }
}

function printReport(
  plan: SafetyImportPlan,
  ctx: { matched: WorkMatch[]; obraRows: Map<string, number>; selected: Set<string>; typesInSystem: number },
) {
  const how: Record<WorkMatch['how'], string> = {
    nome: 'pelo nome',
    código: 'pelo código',
    indicada: 'indicada em --obras',
    aproximada: 'por aproximação, confira',
  };
  console.log('\nObras da planilha:');
  for (const [obra, rows] of ctx.obraRows) {
    const match = ctx.matched.find(m => m.obra === obra);
    let destination: string;
    if (match) destination = `${match.work.name} [${match.work.code}] (${how[match.how]})`;
    else if (!ctx.selected.has(obra)) destination = 'fora do --only';
    else if (OUT_BY_DECISION.some(o => safetyKey(o) === safetyKey(obra))) destination = 'fora por decisão';
    else destination = 'NÃO ENCONTRADA no sistema; ficou de fora (indique com --obras se for o caso)';
    console.log(`  ${obra} (${number(rows)} linhas) → ${destination}`);
  }

  const created = plan.types.created;
  console.log(`\nTipos (lista única): ${number(ctx.typesInSystem)} no sistema; ${number(created.length)} novos.`);
  const renamed = plan.typeMappings.filter(m => m.how !== 'novo' && m.spelling !== m.type).sort((a, b) => b.rows - a.rows);
  if (renamed.length) {
    console.log('  Grafias levadas a um tipo existente:');
    for (const m of renamed) console.log(`    "${m.spelling}" (${number(m.rows)}) → ${m.type}${m.how === 'sinônimo' ? ' [sinônimo]' : ''}`);
  }
  if (created.length) {
    console.log('  Tipos novos:');
    for (const t of [...created].sort((a, b) => b.rows - a.rows)) {
      const others = t.spellings.filter(s => s !== t.name);
      console.log(`    ${t.name} (${number(t.rows)} linhas)${others.length ? ` — grafias: ${others.map(s => `"${s}"`).join(', ')}` : ''}`);
    }
  }

  console.log(
    `\nLocais distintos nas obras importadas: ${number(plan.locations.before)} como digitados → ${number(plan.locations.after)} depois da correção.`,
  );
  console.log('\nPor obra:');
  const total = { rows: 0, created: 0, existing: 0, resolved: 0, resolvedNow: 0, open: 0, errors: 0, warnings: 0, photos: 0 };
  for (const { report: r } of plan.works) {
    const errored = new Set(r.errors.map(e => e.row)).size;
    console.log(
      `  ${r.obra} → ${r.workName}: ${number(r.rows)} linhas | novos ${number(r.created)} | já no sistema ${number(r.existing)} | finalizados ${number(r.resolved)} (${number(r.resolvedNow)} agora) | abertos ${number(r.open)} | com erro ${number(errored)}`,
    );
    console.log(
      `    observações: ${number(r.notesInDescription)} na descrição, ${number(r.resolutionNotes)} em "como foi corrigido" | fotos novas: ${number(r.issuePhotos)} do apontamento, ${number(r.correctionPhotos)} da correção | locais ${number(r.locationsBefore)} → ${number(r.locationsAfter)} | avisos ${number(r.warnings.length)}`,
    );
    total.rows += r.rows;
    total.created += r.created;
    total.existing += r.existing;
    total.resolved += r.resolved;
    total.resolvedNow += r.resolvedNow;
    total.open += r.open;
    total.errors += errored;
    total.warnings += r.warnings.length;
    total.photos += r.issuePhotos + r.correctionPhotos;
  }
  const skippedRows = plan.skipped.reduce((sum, s) => sum + s.rows, 0);
  console.log(
    `  TOTAL: ${number(total.rows)} linhas | novos ${number(total.created)} | já no sistema ${number(total.existing)} | finalizados ${number(total.resolved)} (${number(total.resolvedNow)} agora) | abertos ${number(total.open)} | com erro ${number(total.errors)} | avisos ${number(total.warnings)} | fotos novas ${number(total.photos)} | fora: ${number(skippedRows)} linhas`,
  );

  printIssues('Avisos por tipo', [...plan.works.flatMap(w => w.report.warnings), ...plan.photoIssues], SAFETY_IMPORT_WARNINGS);
  printIssues(
    'ERROS por tipo (a linha não entra)',
    plan.works.flatMap(w => w.report.errors),
    SAFETY_IMPORT_ERRORS,
  );
  return total;
}

type Sharp = (typeof import('sharp'))['default'];
async function loadSharp(): Promise<Sharp> {
  try {
    return (await import('sharp')).default;
  } catch {
    return fail('A compressão usa o sharp (vem com o Next). Rode npm install e tente de novo.');
  }
}

/** A mesma escada do navegador (`compress-image.ts`): o primeiro passo que cabe no limite. */
async function encode(sharp: Sharp, source: Buffer, ladder: readonly CompressionStep[], maxBytes: number) {
  for (const step of ladder) {
    const { data, info } = await sharp(source)
      .rotate()
      .resize({ width: step.maxSide, height: step.maxSide, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: Math.round(step.quality * 100) })
      .toBuffer({ resolveWithObject: true });
    if (data.length <= maxBytes) return { data, width: info.width, height: info.height };
  }
  return null;
}

async function download(url: string): Promise<Buffer> {
  const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const declared = Number(response.headers.get('content-length') ?? 0);
  if (declared > MAX_SOURCE_BYTES) throw new Error('arquivo grande demais');
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > MAX_SOURCE_BYTES) throw new Error('arquivo grande demais');
  return buffer;
}

/** Baixa, comprime e envia cada foto; devolve as medidas das que subiram e as falhas (que saem da gravação). */
async function uploadPhotos(uploads: PhotoUpload[]) {
  const sizes = new Map<string, { width: number; height: number; bytes: number }>();
  const failures: { upload: PhotoUpload; reason: string }[] = [];
  if (!uploads.length) return { sizes, failures };
  const sharp = await loadSharp();
  const bucket = getServiceClient().storage.from(SAFETY_BUCKET);
  let done = 0;
  const queue = [...uploads];
  const worker = async () => {
    for (let upload = queue.shift(); upload; upload = queue.shift()) {
      try {
        const source = await download(upload.url);
        const image = await encode(sharp, source, IMAGE_LADDER, SAFETY_LIMITS.maxPhotoBytes);
        const thumb = await encode(sharp, source, THUMB_LADDER, SAFETY_LIMITS.maxThumbBytes);
        if (!image || !thumb) throw new Error('não coube no limite mesmo comprimida');
        for (const [target, file] of [
          [upload.storagePath, image.data],
          [upload.thumbPath, thumb.data],
        ] as const) {
          // upsert: um envio interrompido é refeito por cima, no mesmo caminho estável.
          const { error } = await bucket.upload(target, file, { contentType: 'image/jpeg', upsert: true });
          if (error) throw new Error(`falha ao enviar: ${error.message}`);
        }
        sizes.set(upload.photoId, { width: image.width, height: image.height, bytes: image.data.length });
      } catch (error) {
        failures.push({ upload, reason: error instanceof Error ? error.message : String(error) });
      }
      if (++done % 25 === 0 || done === uploads.length) console.log(`  fotos processadas: ${done}/${uploads.length}`);
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  return { sizes, failures };
}

async function main() {
  console.log(`${values.apply ? 'GRAVAÇÃO' : 'SIMULAÇÃO (use --apply para gravar)'} — ${csvPath}`);
  const sheet = readSheet(parseCsv(fs.readFileSync(csvPath, 'utf8')));
  const obraRows = new Map<string, number>();
  for (const row of sheet.rows) {
    const obra = row.obra.replace(/\s+/g, ' ').trim() || '(sem obra)';
    obraRows.set(obra, (obraRows.get(obra) ?? 0) + 1);
  }
  console.log(`Planilha: ${number(sheet.rows.length)} linhas com dados; ${number(sheet.blank)} em branco ignoradas.`);

  let selected = new Set(obraRows.keys());
  if (values.only) {
    const wanted = values.only
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    const unknown = wanted.filter(w => ![...obraRows.keys()].some(o => safetyKey(o) === safetyKey(w)));
    if (unknown.length) fail(`--only: obra(s) fora da planilha: ${unknown.join(', ')}. Na planilha: ${[...obraRows.keys()].join(', ')}.`);
    selected = new Set([...obraRows.keys()].filter(o => wanted.some(w => safetyKey(w) === safetyKey(o))));
  }

  console.log(`Banco: ${new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).host}`);
  const actor = await findActor();
  console.log(`Ator: ${actor.name} (${actor.role})`);

  const works = await loadWorks();
  const { matched, badOverrides } = matchWorks([...selected], works, overrides);
  if (badOverrides.length) fail(`--obras aponta para obra inexistente: ${badOverrides.join('; ')}.`);

  const ctx = { ...commandContext(actor.id), idFor: stableId };
  const loaded = await loadTargets(matched, ctx.now);
  if (loaded.unavailable)
    console.log(
      '\nATENÇÃO: as tabelas da aba 6 ainda não existem (migração 0040 não aplicada). A simulação usa o catálogo semeado de 16 tipos e considera que nenhum apontamento foi gravado; a gravação exige a migração.',
    );
  const plan = planSafetyImport({ rows: sheet.rows, types: loaded.types, works: loaded.targets, photos: photoSources }, ctx);
  const total = printReport(plan, { matched, obraRows, selected, typesInSystem: loaded.types.length });
  if (photoSources && !values.apply) console.log('\nFotos: a simulação não baixa nada; só conta as que seriam enviadas.');
  if (!values.apply) return;

  if (loaded.unavailable) fail('\nNada foi gravado: aplique a migração 0040_safety.sql e rode de novo.');
  if (total.errors) fail('\nNada foi gravado: corrija os erros acima na planilha e rode de novo.');
  if (!matched.length) fail('\nNenhuma obra para gravar.');

  // Monta de novo com os dados do momento da gravação.
  const fresh = await loadTargets(matched, ctx.now);
  const final = planSafetyImport(
    { rows: sheet.rows, types: fresh.types, works: fresh.targets, photos: photoSources },
    { ...commandContext(actor.id), idFor: stableId },
  );
  if (final.works.some(w => w.report.errors.length)) fail('Erros ao montar a gravação; nada foi gravado.');

  const uploads = final.works.flatMap(w => w.uploads);
  if (uploads.length) console.log(`\nFotos: ${number(uploads.length)} a baixar, comprimir e enviar.`);
  const { sizes, failures } = await uploadPhotos(uploads);
  for (const { upload, reason } of failures)
    console.log(`  foto da linha ${upload.row} não entrou (${reason}): ${upload.url.slice(0, 100)}`);
  for (const { mutation } of final.works) {
    // Foto que não subiu sai da gravação: a linha só existe com o arquivo no bucket.
    mutation.insert.photos = mutation.insert.photos.filter(p => sizes.has(p.id));
    for (const photo of mutation.insert.photos) Object.assign(photo, sizes.get(photo.id));
  }

  if (final.types.mutation.insert.types.length) {
    await applyMutation(final.types.mutation);
    console.log(`Tipos novos gravados: ${final.types.mutation.insert.types.map(t => t.name).join(', ')}`);
  }
  for (const { target, mutation } of final.works) {
    console.log(`Gravando ${target.obra} → ${target.workName}…`);
    await applyMutation(mutation);
    const after = await loadSafety(target.workId);
    const resolved = after.items.filter(i => i.status === 'resolved').length;
    const fromSheet = after.items.filter(i => i.origin === 'planilha').length;
    console.log(
      `  ${target.workName}: ${number(after.items.length)} apontamentos (${number(fromSheet)} da planilha, ${number(resolved)} finalizados), ${number(after.photos.length)} fotos.`,
    );
  }
  if (failures.length)
    console.log(`\n${number(failures.length)} fotos não entraram; rode de novo com o mesmo --photos para tentar outra vez.`);
}

main().catch(error => fail(`Falha: ${error instanceof Error ? error.message : String(error)}`));
