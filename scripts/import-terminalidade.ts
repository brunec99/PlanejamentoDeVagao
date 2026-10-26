/**
 * Importa a "Lista de pendências" do Sheets (aba Terminalidades da planilha PCP) para a aba 5.
 *
 * 1. Exportar a planilha em .xlsx (Arquivo → Fazer download → Microsoft Excel) e extrair:
 *      python3 -I scripts/terminalidade/extrair-planilha.py PCP-MZN.xlsx /tmp/mzn
 * 2. Simular e depois gravar:
 *      node --import tsx scripts/import-terminalidade.ts /tmp/mzn --work-code MZN --actor-email <e-mail>
 *        [--work-name Mozine --create-work] [--ajustes ajustes.json] [--env-file .env.local] [--apply]
 *
 * Sem --apply é SIMULAÇÃO: lê o banco, monta tudo em memória e imprime o relatório. Com --apply,
 * e só se a simulação não tiver erro: cria a obra (se pedido, pelo `create_work` da tela, que dá
 * acesso ao ator), comprime as fotos como o navegador (~1600 px e miniatura de 320 px, JPEG), envia ao
 * bucket `terminalidade` e grava cadastro, pendências, fotos e resoluções.
 *
 * As regras são as da tela (`planTerminalityCommand`, via `src/application/use-cases/import-terminality.ts`):
 * a resolução exige foto da correção, a data não pode estar no futuro etc. Rodar de novo não duplica;
 * só acrescenta pendências, fotos e resoluções novas da planilha.
 *
 * --ajustes: JSON { "<linha da planilha>": { "observado": "2026-10-08", ... } | { "ignorar": true } }
 * para corrigir o que a planilha digitou errado sem mexer nela.
 *
 * Ambiente: NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY, do processo ou de --env-file
 * (padrão .env.local). Nenhum segredo é impresso. O ator precisa ser admin.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { applyCommand } from '../src/application/use-cases/commands';
import {
  planTerminalityImport,
  type ImportIssue,
  type PhotoUpload,
  type RowAdjustment,
  type SheetExport,
} from '../src/application/use-cases/import-terminality';
import { TERMINALITY_LIMITS, type TerminalityData } from '../src/domain/terminality';
import { commandContext } from '../src/infrastructure/clock';
import { getServiceClient } from '../src/infrastructure/repositories/supabase/client';
import { SupabasePlanningRepository } from '../src/infrastructure/repositories/supabase/planning-repository';
import { applyMutation, loadTerminality, TERMINALITY_BUCKET } from '../src/infrastructure/repositories/supabase/terminality-repository';
import { IMAGE_LADDER, THUMB_LADDER, type CompressionStep } from '../src/modules/terminalidade/compress-image';

const USAGE =
  'Uso: node --import tsx scripts/import-terminalidade.ts <pasta-extraida> --work-code <código> (--actor <profileId> | --actor-email <e-mail>) [--work-name <nome> --create-work] [--ajustes ajustes.json] [--env-file .env.local] [--apply]';

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const { values, positionals } = (() => {
  try {
    return parseArgs({
      allowPositionals: true,
      options: {
        'work-code': { type: 'string' },
        'work-name': { type: 'string' },
        'create-work': { type: 'boolean', default: false },
        actor: { type: 'string' },
        'actor-email': { type: 'string' },
        ajustes: { type: 'string' },
        'env-file': { type: 'string' },
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
const [folder] = positionals;
if (!folder || positionals.length > 1) fail(USAGE);
const workCode = values['work-code'] ?? fail(`Informe --work-code.\n${USAGE}`);
if (!values.actor && !values['actor-email']) fail(`Informe --actor ou --actor-email.\n${USAGE}`);
if (values['create-work'] && !values['work-name']) fail('Com --create-work, informe --work-name.');

const envFile = values['env-file'] ?? '.env.local';
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);
else if (values['env-file']) fail(`Arquivo de ambiente não encontrado: ${envFile}`);
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)
  fail('Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (no ambiente ou em --env-file).');

const sheet = JSON.parse(fs.readFileSync(path.join(folder, 'pendencias.json'), 'utf8')) as SheetExport;
const adjustments = values.ajustes ? (JSON.parse(fs.readFileSync(values.ajustes, 'utf8')) as Record<string, RowAdjustment>) : {};

/** UUID estável (formato v5) a partir de um texto: é o que torna a importação repetível. */
function stableId(seed: string) {
  const hex = createHash('sha1').update(`obra360-terminalidade|${seed}`).digest('hex');
  const variant = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

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

async function findWork() {
  const { data, error } = await getServiceClient().from('works').select('id, name, code');
  if (error) fail(`Falha ao ler as obras: ${error.message}`);
  return ((data ?? []) as { id: string; name: string; code: string }[]).find(w => w.code.toLowerCase() === workCode.toLowerCase());
}

const emptyData = (): TerminalityData => ({ floors: [], units: [], types: [], people: [], items: [], photos: [] });
const formatIssue = (issue: ImportIssue) => `${issue.line ? `linha ${issue.line}: ` : ''}${issue.message}`;

function plan(workId: string, data: TerminalityData, actorId: string) {
  return planTerminalityImport(data, workId, sheet, { ...commandContext(actorId), idFor: stableId }, adjustments);
}

function printReport(result: ReturnType<typeof plan>) {
  const r = result.report;
  console.log(`Linhas: ${r.rows} | pendências novas: ${r.created} | já importadas: ${r.existing}`);
  console.log(`Fotos novas: ${r.issuePhotos} do problema, ${r.correctionPhotos} da correção | resolvidas agora: ${r.resolved}`);
  console.log(
    `Cadastro novo: ${r.floorsCreated.length} pavimentos, ${r.unitsCreated} unidades, ${r.typesCreated.length} tipos, ${r.peopleCreated.length} responsáveis ATR`,
  );
  if (r.floorsCreated.length) console.log(`  Pavimentos: ${r.floorsCreated.join(', ')}`);
  if (r.peopleCreated.length) console.log(`  Responsáveis ATR: ${r.peopleCreated.join(', ')}`);
  for (const warning of r.warnings) console.log(`  aviso — ${formatIssue(warning)}`);
  for (const error of r.errors) console.log(`  ERRO — ${formatIssue(error)}`);
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

async function uploadPhotos(uploads: PhotoUpload[], sizes: Map<string, { width: number; height: number; bytes: number }>) {
  const sharp = await loadSharp();
  const bucket = getServiceClient().storage.from(TERMINALITY_BUCKET);
  let done = 0;
  const queue = [...uploads];
  const worker = async () => {
    for (let upload = queue.shift(); upload; upload = queue.shift()) {
      const source = fs.readFileSync(path.join(folder, 'fotos', upload.arquivo));
      const image = await encode(sharp, source, IMAGE_LADDER, TERMINALITY_LIMITS.maxPhotoBytes);
      const thumb = await encode(sharp, source, THUMB_LADDER, TERMINALITY_LIMITS.maxThumbBytes);
      if (!image || !thumb) throw new Error(`linha ${upload.line}: a foto ${upload.arquivo} não coube no limite mesmo comprimida.`);
      for (const [target, file] of [
        [upload.storagePath, image.data],
        [upload.thumbPath, thumb.data],
      ] as const) {
        // upsert: um envio interrompido é refeito por cima, no mesmo caminho estável.
        const { error } = await bucket.upload(target, file, { contentType: 'image/jpeg', upsert: true });
        if (error) throw new Error(`linha ${upload.line}: falha ao enviar ${upload.arquivo}: ${error.message}`);
      }
      sizes.set(upload.photoId, { width: image.width, height: image.height, bytes: image.data.length });
      if (++done % 25 === 0 || done === uploads.length) console.log(`  fotos enviadas: ${done}/${uploads.length}`);
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
}

async function main() {
  console.log(`${values.apply ? 'GRAVAÇÃO' : 'SIMULAÇÃO (use --apply para gravar)'} — ${folder}`);
  console.log(`Banco: ${new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).host}`);
  const actor = await findActor();
  console.log(`Ator: ${actor.name} (${actor.role})`);

  let work = await findWork();
  if (!work && !values['create-work']) fail(`Obra de código ${workCode} não encontrada. Use --create-work --work-name <nome>.`);
  if (work) console.log(`Obra: ${work.name} (${work.code})`);
  else console.log(`Obra NOVA: "${values['work-name']}", código ${workCode}`);

  // Na simulação de obra nova, um id provisório: os ids das pendências mudam com o da obra real.
  const simulated = plan(work?.id ?? stableId(`obra-simulada|${workCode}`), work ? await loadTerminality(work.id) : emptyData(), actor.id);
  printReport(simulated);
  if (!values.apply) return;
  if (simulated.report.errors.length) fail('Nada foi gravado: corrija os erros acima (na planilha ou em --ajustes) e rode de novo.');

  if (!work) {
    const repository = new SupabasePlanningRepository();
    const workId = await repository.transaction(
      draft => applyCommand(draft, { type: 'create_work', name: values['work-name']!, code: workCode }, commandContext(actor.id)),
      { workIds: [] },
    );
    work = { id: workId, name: values['work-name']!, code: workCode };
    console.log(`Obra criada: ${work.name} (${work.id})`);
  }

  const result = plan(work.id, await loadTerminality(work.id), actor.id);
  if (result.report.errors.length) fail('Erros ao montar a gravação; nada foi gravado.');
  const sizes = new Map<string, { width: number; height: number; bytes: number }>();
  await uploadPhotos(result.uploads, sizes);
  for (const photo of result.mutation.insert.photos) Object.assign(photo, sizes.get(photo.id));
  await applyMutation(result.mutation);

  const after = await loadTerminality(work.id);
  const resolved = after.items.filter(i => i.status === 'resolved').length;
  console.log(
    `Gravado: ${after.items.length} pendências (${resolved} resolvidas), ${after.photos.length} fotos, ${after.floors.length} pavimentos, ${after.units.length} unidades, ${after.types.length} tipos, ${after.people.length} responsáveis ATR.`,
  );
}

main().catch(error => fail(`Falha: ${error instanceof Error ? error.message : String(error)}`));
