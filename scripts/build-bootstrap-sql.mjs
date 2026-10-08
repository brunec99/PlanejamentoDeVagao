// Gera supabase/bootstrap/obra360-schema.sql: todas as migrações de supabase/migrations, em ordem,
// num arquivo só, para montar um projeto Supabase VAZIO numa única execução do SQL Editor.
//
//   npm run bootstrap:sql              regrava o arquivo
//   node scripts/build-bootstrap-sql.mjs --check   só confere se o arquivo está em dia (sai com 1 se não)
//
// As migrações não são alteradas. O gerador:
//   1. confere cada arquivo (termina em `;`, aspas-dólar balanceadas, nenhum BEGIN/COMMIT/ROLLBACK
//      solto — o SQL Editor já roda o texto inteiro como uma transação implícita);
//   2. concatena com um separador `-- ===== 00NN_nome.sql =====`;
//   3. acrescenta, no fim, a seção de ajustes do bootstrap (FIXUPS abaixo), que existe só aqui.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const MIGRATIONS_DIR = path.join(root, 'supabase/migrations');
export const OUTPUT = path.join(root, 'supabase/bootstrap/obra360-schema.sql');

// Ajustes que só fazem sentido num banco montado de uma vez. Cada um é idempotente.
const FIXUPS = `-- ===== Ajustes do bootstrap (gerados por scripts/build-bootstrap-sql.mjs; não são migração) =====

-- 1) Remove a sobrecarga antiga commit_planning(bigint, jsonb), criada pela 0001 e reescrita pela 0002.
--    A partir da 0005 a função passou a ter três parâmetros (p_deletes), e "create or replace" com
--    outra assinatura cria uma função NOVA em vez de substituir: a de dois parâmetros ficava para trás,
--    com o corpo da 0002 (que grava profiles) e SECURITY DEFINER. A 0001 só tirou o EXECUTE de PUBLIC;
--    no Supabase os privilégios padrão do schema public dão EXECUTE direto a anon e authenticated, e a
--    0023 só revogou isso da versão de três parâmetros. Resultado: qualquer um com a chave anônima
--    poderia chamar a versão antiga pela API. A aplicação sempre chama a de três parâmetros.
drop function if exists public.commit_planning(bigint, jsonb);

-- 2) Garante à service_role o acesso às tabelas que o servidor lê e grava pela API (PostgREST).
--    No Supabase isso já vem dos privilégios padrão do schema public; fica explícito para o banco
--    novo não depender dessa configuração do projeto. anon e authenticated continuam barrados pela
--    RLS ligada sem nenhuma política em todas as tabelas.
grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;

-- 3) Pede ao PostgREST que releia o esquema já, para a API enxergar tabelas e funções novas.
notify pgrst, 'reload schema';
`;

/** Tira comentários e corpos entre aspas-dólar, para procurar comandos no nível de cima. */
function topLevel(sql) {
  return sql
    .replace(/\$([A-Za-z_]*)\$[\s\S]*?\$\1\$/g, ' ')
    .replace(/--[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/'(?:[^']|'')*'/g, "''");
}

function checkMigration(name, sql) {
  const problems = [];
  if (sql.includes('\r')) problems.push('tem quebras de linha CRLF');
  const tags = sql.match(/\$[A-Za-z_]*\$/g) ?? [];
  if (tags.length % 2 !== 0) problems.push('aspas-dólar desbalanceadas');
  const top = topLevel(sql);
  if (!/;\s*$/.test(top)) problems.push('o último comando não termina em ";"');
  const tx = top.match(/(^|;)\s*(begin|commit|rollback|start\s+transaction|end)\s*(;|$)/i);
  if (tx) problems.push(`controle de transação no nível de cima ("${tx[2]}")`);
  if (/\bcreate\s+extension\b/i.test(top)) problems.push('create extension (conferir se o Supabase permite)');
  if (problems.length) throw new Error(`${name}: ${problems.join('; ')}`);
}

export function listMigrations() {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter(n => n.endsWith('.sql'))
    .sort();
}

export function buildBootstrapSql() {
  const files = listMigrations();
  const header = `-- =====================================================================================
-- Obra360 — esquema completo do banco (bootstrap)
--
-- O QUE É: todas as migrações de supabase/migrations concatenadas em ordem, mais uma seção final
-- de ajustes do bootstrap. Monta do zero as 32 tabelas, as funções commit_planning e
-- planning_snapshot, os gatilhos de imutabilidade e o bucket privado 'ifc' do Storage.
--
-- GERADO AUTOMATICAMENTE — não edite à mão. Fonte: ${files.length} migrações, de ${files[0]} a ${files.at(-1)}.
-- Para regenerar depois de criar uma migração nova:  npm run bootstrap:sql
--
-- COMO USAR: só num projeto Supabase VAZIO (recém-criado). Abra o SQL Editor do projeto, cole o
-- arquivo INTEIRO e clique em Run UMA vez. O editor roda o texto todo numa transação: se algum
-- comando falhar, nada fica gravado. Não rode de novo num banco que já tem o esquema — várias
-- migrações usam "create table" sem "if not exists" e falham com "already exists".
-- Depois, rode supabase/bootstrap/conferencia.sql para conferir o resultado.
--
-- Num banco que já existe, continue aplicando só as migrações novas, uma a uma.
-- =====================================================================================

`;
  const parts = files.map(name => {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, name), 'utf8');
    checkMigration(name, sql);
    return `-- ===== ${name} =====\n\n${sql.trimEnd()}\n`;
  });
  return `${header}${parts.join('\n')}\n${FIXUPS}`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const sql = buildBootstrapSql();
  const rel = path.relative(root, OUTPUT);
  if (process.argv.includes('--check')) {
    const current = fs.existsSync(OUTPUT) ? fs.readFileSync(OUTPUT, 'utf8') : '';
    if (current !== sql) {
      console.error(`${rel} está desatualizado. Rode: npm run bootstrap:sql`);
      process.exit(1);
    }
    console.log(`${rel} em dia (${listMigrations().length} migrações).`);
  } else {
    fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
    fs.writeFileSync(OUTPUT, sql);
    console.log(`${rel}: ${listMigrations().length} migrações, ${Buffer.byteLength(sql)} bytes.`);
  }
}
