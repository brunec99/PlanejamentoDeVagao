# Exclusão de obra pelo administrador (30/10/2026)

O usuário pediu que administradores possam excluir obras. Até aqui não havia como: o manual da Claudia respondia "Não há botão para isso na tela".

**Estado:** código e migração **criados** em 30/10/2026, sem commit. A migração `0037_delete_work.sql` **não foi aplicada** no `takt-hub`. A tela nunca foi aberta logada.

## O que a pessoa vê

Em **Configurações da obra** (grupo Apoio), no fim da página, um bloco **"Excluir obra"** que só aparece para quem tem o papel **admin**. Gestor cadastra obra, mas não exclui.

1. **"Excluir esta obra…"** abre o resumo do que sai junto, contado no planejamento já carregado: linhas do curto prazo, vagões, planos do médio prazo, equipes, modelos IFC e quantas pessoas perdem o acesso. A terminalidade, os arquivos e o longo prazo não estão no planejamento carregado e aparecem sem número.
2. A pessoa digita o **código da obra**. A comparação ignora maiúsculas e espaços nas pontas. **"Excluir definitivamente"** só habilita com o código certo.
3. Deu certo: aviso "Obra CÓDIGO · Nome excluída.", volta para a lista de obras e recarrega o planejamento. Se algum arquivo não sair do Storage, o aviso diz isso.
4. Deu errado: a mensagem aparece no próprio bloco e nada é apagado. Exemplos: "O código digitado não é o desta obra.", "Obra não encontrada. Ela pode já ter sido excluída.", ou o pedido para aplicar a 0037.

Não há lixeira nem restauração. Também não existe "desativar": o campo `works.active` continua sem uso.

## O que sai e o que fica

**Sai, numa transação só:**

- Curto prazo: `weekly_commitments`, inclusive linha antiga sem `work_id` ligada a uma atividade da obra.
- Vagões: `production_sequences`, `wagons`, `activities`, `activity_dependencies`, `progress_entries`, `terminality_criteria`, `pending_items`, `restrictions`, `releases` e `terminality_debts`.
- Médio prazo: `medium_term_plans`, `plan_tasks` e `plan_dependencies`, **inclusive as linhas de base congeladas**.
- Longo prazo e cadastros: `long_term_plans`, `baselines`, `teams`, `locations`, `prevision_activities` e `work_settings`.
- IFC: `ifc_models`, `ifc_model_versions`, `ifc_elements`, `ifc_properties`, `ifc_quantities`, `ifc_fragments`, `ifc_federations` e `link_rules`.
- Terminalidade: `terminality_floors`, `terminality_units`, `terminality_types`, `terminality_people`, `terminality_items` e `terminality_photos`.
- `agent_insights`, a leitura da obra guardada pela Claudia.
- O id da obra sai de `profiles.work_ids` de todo mundo.
- Por fim, a própria linha de `works`.

Depois do commit, a rota apaga a pasta da obra nos buckets `ifc` e `terminalidade`.

**Fica, de propósito:**

- **`history_events`.** O histórico é append-only, protegido por gatilho desde a 0023, e não tem chave estrangeira. Ele continua como trilha de auditoria. A exclusão grava mais um evento, `delete_work` (`entity_type = 'work'`), com nome, código, autor e a contagem de linhas apagadas por tabela.
- **`agent_usage`.** É o livro-razão do custo da IA. Apagar as linhas da obra faria o teto do mês (`AGENT_MONTHLY_BUDGET_USD`) contar menos do que foi gasto. Por isso a 0037 tira a chave estrangeira `agent_usage_work_id_fkey`, e o `work_id` fica como texto, igual a `actor_id`. Efeito colateral: até o mês virar, o painel Configurações → Agente de IA pode listar consumo de uma obra que não existe mais.

## Como funciona

- **Tela:** `src/modules/configuracoes/delete-work.tsx`, no fim de `src/app/(app)/obras/[obraId]/configuracoes/page.tsx`. O resumo e a regra do código estão em `delete-work-view.ts`.
- **Rota:** `DELETE /api/admin/works/[id]`, com corpo `{ code }`, em `src/app/api/admin/works/[id]/route.ts`. Confere o papel de admin, chama a RPC e depois limpa o Storage. Sem a função no banco (`PGRST202`/`42883`), responde 503 pedindo a 0037.
- **Banco:** a função `delete_work(p_work_id, p_code, p_actor_id)`, `security definer`, executável só pela `service_role`. Ela confere de novo que o ator é admin e que o código bate, e só então tranca `planning_meta` (a mesma fila de `commit_planning`). Apaga filhos antes dos pais, soma 1 à versão para as telas abertas recarregarem e devolve `{ version, removed }`.
- **Linha de base congelada:** o gatilho `guard_plan_baseline` (0023) recusa apagar uma base congelada. A 0037 o reescreve com uma única exceção: `delete_work` grava o id da obra em `obra360.deleting_work`, uma configuração **local da transação**. O gatilho só libera o `DELETE` das linhas dessa obra. A configuração some no commit ou no rollback; fora disso, a base continua imutável, e o teste confere isso.
- **Storage:** `removeWorkFiles` (`src/infrastructure/repositories/supabase/work-files.ts`) lista a pasta `<obra>/` de cada bucket, descendo nas subpastas e paginando de 1000 em 1000, e apaga em lotes de 100. Listar a pasta, em vez de ler os caminhos das linhas, leva junto o envio que nunca foi registrado. O Storage não entra na transação: se falhar, as linhas já saíram, e o arquivo fica órfão no bucket privado, sem aparecer em tela nenhuma. A resposta diz em quais buckets falhou e o registro da rota anota.
- **Saúde do banco:** `MIGRATION_CHECKS` ganhou a 0037 (não crítica). A sondagem chama `delete_work` com um ator fictício, e a função recusa com `not_admin` antes de tocar em qualquer linha ou trava. `conferencia.sql` passou a conferir a função e o privilégio da `service_role`.

## Decisões

- A confirmação é o **código digitado**, e não o diálogo "Confirmar", porque a exclusão leva meses de apontamento e não tem volta. O servidor confere o código de novo: a regra mora na função, não só na tela.
- A exclusão é uma **função SQL**, e não um comando de `applyCommand` com `p_deletes`. `commit_planning` só apaga as tabelas que `diffDeletedIds` cobre (não `works`, `locations`, `releases` etc.), e metade das tabelas da obra fica fora do snapshot. Estender `commit_planning` obrigaria a reescrevê-lo de novo, junto da 0036 de outra sessão.
- O lugar é a página da obra, e não a grade de usuários: o admin já está olhando a obra que vai excluir.

## Validações feitas

- `tests/delete-work.test.ts`: PGlite com todas as migrações, duas obras com uma linha em **cada** tabela.
  - A obra excluída some de todas as tabelas, salvo histórico e `agent_usage`, e a outra fica idêntica.
  - Sai a linha antiga sem `work_id`, e a linha de base congelada também.
  - O evento `delete_work` é gravado, ninguém mantém acesso e a versão sobe 1.
  - Ficam recusados: código errado, código vazio, obra inexistente, gestor e chamada como `authenticated`. Em todos esses casos nada é apagado.
  - O teste falha se aparecer uma tabela nova com `work_id` sem semente, e assim lembra de incluí-la na `delete_work`.
  - A limpeza do Storage é testada com pastas aninhadas, mais de 1000 arquivos numa pasta e um bucket que falha.
- `npm run validate:migrations` e `node scripts/validate-bootstrap-sql.mjs`, com o bootstrap regenerado (37 migrações): 31 de 31 sondagens e 66 de 66 itens da conferência OK.
- Em 30/10/2026, com o trabalho de outras sessões no mesmo diretório:
  - `typecheck`: sem erro.
  - `lint`: sem erro e sem aviso nos arquivos desta entrega.
  - `npm test`: 764 de 764.
  - `build` e `test:e2e`: build sem erro e 8 de 8 no e2e.
  - `format:check`: OK nos arquivos desta entrega. Acusou só dois arquivos novos de outra sessão, que montava o painel do PDF do fechamento ao mesmo tempo.
- **Não validado:** a tela não foi aberta logada no navegador, e a função nunca rodou no Supabase real.

## Pendências

1. **Aplicar `supabase/migrations/0037_delete_work.sql` no `takt-hub`**, pelo SQL Editor. A migração é reexecutável. Aplicar antes de publicar não quebra nada; publicar antes só deixa o botão respondendo que falta a migração.
2. Conferir em Configurações → Banco de dados que a `0037_delete_work` aparece como aplicada.
3. Primeiro uso real: excluir uma obra de teste, nunca uma com histórico. Conferir que ela some da lista, que outra pessoa com a tela aberta vê a obra sumir na recarga seguinte e que a pasta da obra sai dos buckets no painel do Storage.
4. O tour da página não tem passo para o bloco: ele tem `data-tour="obra-config-delete"`, mas os tours estavam sendo editados por outra sessão.
