# Sistema de Planejamento Vagão

Aplicação em Next.js, TypeScript, Tailwind CSS e App Router. O vagão é um **período temporal**, sem pavimento ou local próprio. Os locais pertencem às atividades.

A interface está organizada em três níveis de planejamento — longo, médio e curto prazo — mais o módulo de vagões, que continua sendo onde a execução é registrada. Veja [Níveis de planejamento](#níveis-de-planejamento).

## Executar

Node.js 22 ou superior e npm:

```sh
npm ci
npm run dev -- --hostname 127.0.0.1
```

Login é obrigatório e feito só por Google Workspace (domínio `atrincorporadora.com.br`) — configure o Supabase e o provedor Google antes de testar, veja as seções [Supabase](#supabase) e [Login com Google](#login-com-google) abaixo. Depois acesse http://127.0.0.1:3000/login. O ambiente de validação usa a data fixa **08/09/2026**, indicada na interface. Os dados persistem no Postgres do Supabase, não mais em memória do navegador.

```sh
npm test
npm run typecheck
npm run build
```

## Funcionalidades

- Cadastro de obras, sequências temporais, vagões e locais de atividade.
- Planejamento por período; navegação entre predecessor e sucessor.
- Sub-navegação por obra com os três níveis de planejamento, os vagões, as dívidas e as integrações.
- Atividades com responsável, peso, local, datas, progresso, status e obrigatoriedade.
- Equipes executoras com capacidade semanal e alocação de atividades, com sinalização de sobrecarga.
- Lançamento datado de percentual executado, mantendo o histórico separado do valor corrente.
- Compromissos semanais com meta, apuração de cumprimento, causa de não cumprimento e PPC.
- Linhas de base imutáveis, com cópia das datas planejadas de vagões e atividades.
- Quadro de restrições em três colunas: identificada, em tratativa e resolvida.
- Cadastro e confirmação de critérios de terminalidade.
- Pendências e restrições com responsável, prazo e resolução.
- Liberações inicial, normal e excepcional, com validação, justificativa e histórico.
- Dívidas próprias e herdadas, sem duplicação; filtros de abertas, vencidas e resolvidas.
- Reabertura de terminalidade exige gestor e justificativa, preserva liberações e alerta sucessores.
- Login real via Google Workspace (domínio restrito), com papéis de gestor, planejador, consulta e admin; autorização por obra aplicada no servidor a cada comando.
- Administradores concedem/retiram o acesso de qualquer usuário a qualquer obra em `/admin`, sem mexer em planejamento.
- Consulta de obras/atividades e importação revisada do Prevision.

A liberação excepcional cria a autorização e as dívidas na mesma transação. Falhas descartam todo o rascunho. Dívidas herdadas mantêm o prazo original, e uma nova autorização registra seu reconhecimento. Resolver a pendência encerra a dívida sem apagar sua origem. Restrições impeditivas não podem ser contornadas por liberação excepcional. Correções que reduzam progresso exigem justificativa.

Datas são datas civis ISO. O calendário de dias úteis considera segunda a sexta, sem feriados. Atividades devem caber integralmente no período do vagão. Replanejar vagões liberados não é permitido nesta versão.

## Níveis de planejamento

Cada obra tem uma sub-navegação própria (`src/app/(app)/obras/[obraId]/layout.tsx`, com o menu em `src/modules/layout/work-nav.tsx`) com seis seções: "Planejamento de longo prazo", "Planejamento de médio prazo", "Planejamento de curto prazo", "Vagões", "Dívidas" e "Integrações".

**Longo prazo** (`/obras/{obraId}/longo-prazo`): define e lista as linhas de base da obra. Cada acionamento cria um registro novo, que copia o número e as datas planejadas dos vagões e as datas, o local e o peso das atividades. Reprogramar o planejamento atual nunca altera uma linha de base já salva — planejamento atual, linha de base e realizado permanecem registros distintos. A mesma tela traz o gráfico de Linha de Balanço: cada serviço é uma linha avançando pelos locais ao longo do tempo, com marcação de hoje, alternância para visão de tabela e sobreposição pontilhada da linha de base escolhida para comparação.

**Médio prazo** (`/obras/{obraId}/medio-prazo`): Look Ahead de três meses, com janela deslizante de hoje até 90 dias à frente — a janela anda com o dia atual, não é uma revisão trimestral. Nessa tela ficam o cadastro de equipes e sua capacidade, a alocação de atividades a equipes, a carga por equipe na janela, o lançamento de progresso e o histórico datado desses lançamentos. Abaixo dela fica o quadro de restrições da obra.

**Curto prazo** (`/obras/{obraId}/curto-prazo`): compromisso semanal do Last Planner. Cada compromisso liga uma atividade a uma semana, com responsável e meta de percentual; a semana é sempre normalizada para a segunda-feira. A apuração registra cumprido ou não cumprido, e o não cumprimento exige causa. O PPC da semana conta compromissos cumpridos sobre compromissos assumidos — nunca é a média dos percentuais executados. Compromissos ainda não apurados aparecem separados dos cumpridos e dos não cumpridos.

**Vagões** (`/obras/{obraId}/vagoes`): a visão de vagões que antes respondia em `/obras/{obraId}/planejamento`. O detalhe de cada vagão segue em `/obras/{obraId}/vagoes/{vagaoId}`.

Regras dos comandos novos, aplicadas no servidor como as demais:

- `record_progress` exige vagão liberado para aumentar o percentual e é bloqueado por restrição aberta que impeça a execução. Reduzir o percentual exige justificativa. Sair de 100% num vagão terminal exige gestor e justificativa de reabertura. Cada lançamento grava uma entrada datada, e o campo da atividade guarda só o valor corrente.
- `create_team` recusa capacidade não inteira ou não positiva e nome repetido na mesma obra. `assign_team` só aceita equipe da própria obra e admite desalocar.
- `create_commitment` exige meta acima do percentual já executado e recusa um segundo compromisso para a mesma atividade na mesma semana.
- `record_fulfillment` não reapura um compromisso já apurado e exige causa quando o compromisso não foi cumprido.
- `create_baseline` exige ao menos um vagão cadastrado e nunca sobrescreve uma linha de base anterior.
- `move_restriction` move a restrição entre "identificada" e "em tratativa" e recusa a coluna "Resolvida": ela só é alcançada por `resolve_restriction`, que exige o registro de como a restrição foi resolvida. Restrição resolvida não volta ao quadro.

### Decisões iniciais

Pontos que ainda não foram confirmados e valem como decisão inicial, sujeita a revisão:

- Capacidade de equipe medida em atividades simultâneas por semana, e não em homem-hora ou em quantidade de serviço.
- Quadro de restrições com três colunas (identificada, em tratativa, resolvida).
- A linha de base guarda cópia das datas planejadas de vagões e atividades, não um retrato completo do planejamento.

### O que ainda não existe

O repositório de arquivos IFC e o BIM 4D previstos para a evolução do produto não têm código nesta etapa. As telas dos três níveis estão na primeira versão: registram e mostram o que está descrito acima, sem curva S e sem comparação automática entre linha de base e realizado (no longo prazo a comparação com a linha de base é visual, sobreposta ao gráfico).

## Prevision

A credencial é lida exclusivamente no servidor da variável `PREVISION_API_TOKEN`. Configure em `.env.local` conforme `.env.example`; o arquivo é ignorado pelo Git. Nunca use prefixo `NEXT_PUBLIC_` para a credencial.

Documentação oficial: https://api.prevision.com.br/ e https://api.prevision.com.br/openapi.json.

Endpoints de consulta usados, com Bearer JWT:

- `GET /construction/api/v1/projects`
- `GET /construction-schedule/api/v1/project/{projectId}/activities`

A tela de integrações da obra (`/obras/{obraId}/importar`, aberta pela seção "Integrações") consulta obras, permite criar sua contraparte local e selecionar atividades para um vagão. Na primeira importação, a obra local fica vinculada ao projeto externo; importações de outro projeto são recusadas. Atividades são identificadas por `projeto:atividade`; duplicatas são recusadas, sem sobrescrever execução local. Apenas o nível de atividade da API é importado, sem duplicar jobs e partes.

Datas, local e progresso vêm do Prevision. Responsável local é escolhido na revisão, peso inicial é 1 e a atividade é obrigatória. Cada atividade importada recebe um critério de conferência local não atendido, mesmo quando o progresso externo é 100%. Atividades com progresso exigem vagão liberado. Atividades que atravessam períodos não são cortadas ou distribuídas automaticamente. Registros inválidos são contados e excluídos da prévia.

Consultas têm timeout, mensagens sem credenciais, cache local de um minuto e intervalo mínimo de 11 segundos entre chamadas externas. Não há sincronização automática nem escrita no Prevision.

**A rota com credencial do Prevision continua bloqueada em produção**, independente do login — esse bloqueio antecede a autenticação real e não foi revisto nesta etapa. O login agora é real (Supabase Auth, veja a seção [Supabase](#supabase)), mas essa rota específica mantém o 403 em produção até essa decisão ser revisitada. Não publique o protótipo como sistema multiusuário com dados reais sem revisar esse ponto.

## Supabase

1. Crie um projeto em https://supabase.com/dashboard.
2. Rode as migrações de `supabase/migrations/`, nessa ordem, no SQL Editor do projeto (ou `supabase db push` pela CLI): `0001_init.sql`, `0002_commit_planning_profiles.sql`, `0003_admin_role.sql`, `0004_prevision_schedule.sql`, `0005_commit_planning_delete.sql`, `0006_sequence_start_date.sql` e `0007_teams_progress_baselines.sql`. A `0007` cria as tabelas `teams`, `progress_entries`, `weekly_commitments` e `baselines`, adiciona `activities.team_id` e `restrictions.board_status` e reescreve a função `commit_planning` para cobrir as tabelas novas — sem ela os comandos dos três níveis de planejamento falham.
3. Em Project Settings → API, copie a URL e as chaves `anon` e `service_role` para `.env.local` (a partir de `.env.example`): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
4. Configure o login com Google — veja [Login com Google](#login-com-google) abaixo. Não há mais login por senha nem script de seed com usuários fictícios: o primeiro acesso via Google já provisiona o usuário.
5. `npm run dev` e acesse `/login`.

`SUPABASE_SERVICE_ROLE_KEY` nunca deve ter o prefixo `NEXT_PUBLIC_` — ela ignora Row Level Security e só é usada no servidor (repositório e rota de callback). O navegador nunca acessa o Postgres diretamente, só as rotas `/api/planning` e `/api/planning/commands`, autenticadas pela sessão do Supabase Auth.

Para publicar na Vercel, configure as mesmas variáveis (`PREVISION_API_TOKEN`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) em Project Settings → Environment Variables.

## Login com Google

Autenticação exclusivamente via Google OAuth, restrita ao domínio `atrincorporadora.com.br` (checado no servidor em `src/app/auth/callback/route.ts`, não só pelo parâmetro `hd` do Google). Não existe mais login por e-mail/senha.

1. No [Google Cloud Console](https://console.cloud.google.com/), crie (ou reaproveite) um projeto → **APIs & Services → Credentials → Create Credentials → OAuth client ID** → tipo *Web application*.
2. Em **Authorized redirect URIs**, adicione exatamente: `https://<seu-projeto>.supabase.co/auth/v1/callback` (URL do próprio Supabase, não do app — pegue o `<seu-projeto>` da URL do seu `NEXT_PUBLIC_SUPABASE_URL`).
3. Copie o **Client ID** e o **Client Secret** gerados.
4. No Supabase Dashboard → **Authentication → Providers → Google**, ative o provedor e cole as duas credenciais.
5. Acesse `/login` e entre com uma conta `@atrincorporadora.com.br`. O primeiro login de `bruno.engenharia@atrincorporadora.com.br` cria automaticamente o perfil administrador (com acesso a todas as obras já cadastradas); qualquer outra conta do domínio é criada como "Consulta" sem acesso a nenhuma obra até um admin liberar em `/admin`.

Contas fora do domínio configurado são barradas e deslogadas no próprio callback, mesmo que completem o login no Google.

## Arquitetura e evolução

- `src/domain`: entidades, datas e regras puras.
- `src/application`: consultas, comandos e contrato de transação.
- `src/infrastructure/repositories/mock`: armazenamento em memória com cópias isoladas, usado pelos testes de unidade (`npm test`).
- `src/infrastructure/repositories/supabase`: adaptador Postgres real (Supabase) usado pela aplicação em execução — `getSnapshot`/`transaction` sobre a mesma interface `PlanningRepository`.
- `src/infrastructure/auth`: sessão do Supabase Auth no servidor (usuário autenticado, perfil, papel).
- `src/infrastructure/integrations/prevision`: cliente HTTP no servidor e normalização testável.
- `src/modules`: interface por funcionalidade — `planejamento` (vagões, dívidas, formulários e componentes reaproveitados), `longo-prazo`, `medio-prazo`, `curto-prazo`, `layout` (sub-navegação da obra), `integracoes`, `obras`, `configuracoes` e `tour`.
- `src/app`: App Router, login e rotas intermediárias (`/api/planning`, `/api/planning/commands`, `/api/prevision`).

As entidades novas do domínio são `Team` (capacidade em atividades simultâneas por semana), `ProgressEntry` (percentual executado com data), `WeeklyCommitment` (compromisso semanal, com `weekStart` sempre na segunda-feira e cumprimento indefinido enquanto não apurado) e `Baseline` (cópia imutável das datas planejadas). As regras `ppc` e `teamLoad` ficam em `src/domain/rules.ts`, junto das demais regras puras.

Persistência em PostgreSQL/Supabase e autenticação real já estão implementadas: comandos rodam no servidor autenticados pela sessão, e a função `commit_planning` aplica cada transação de forma atômica com controle de concorrência otimista (versão em `planning_meta`). Hospedagem na Vercel e o relógio de produção (hoje fixo em 08/09/2026) permanecem como próximos passos.

## Rotas e cenários

- `/obras`: obras e cadastro.
- `/obras/obra-1/longo-prazo`: linhas de base.
- `/obras/obra-1/medio-prazo`: Look Ahead, equipes e quadro de restrições.
- `/obras/obra-1/curto-prazo`: compromissos da semana e PPC.
- `/obras/obra-1/vagoes`: planejamento completo por vagão.
- `/obras/obra-1/vagoes/v2`: pendência e dívida própria.
- `/obras/obra-1/vagoes/v3`: restrição e dívida herdada.
- `/obras/obra-1/vagoes/v5`: não iniciado, aguardando liberação.
- `/obras/obra-1/vagoes/v6`: 100% de progresso aguardando critério.
- `/obras/obra-1/dividas`: gestão das dívidas.
- `/obras/obra-1/importar`: Prevision.

Validação: testes de terminalidade, permissões, rollback, importação, normalização, vínculos, datas, dívidas e reabertura. A conectividade real foi verificada com a consulta de obras e de atividades de uma obra, sem alterar o Prevision.
