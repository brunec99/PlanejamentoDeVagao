# Sistema de Planejamento Vagão

MVP local em Next.js, TypeScript, Tailwind CSS e App Router. O vagão é um **período temporal**, sem pavimento ou local próprio. Os locais pertencem às atividades.

## Executar

Node.js 22 ou superior e npm:

```sh
npm ci
npm run dev -- --hostname 127.0.0.1
```

Login é obrigatório (Supabase Auth) — crie o projeto Supabase e rode o seed antes de testar, veja a seção [Supabase](#supabase) abaixo. Depois acesse http://127.0.0.1:3000/login. O ambiente de validação usa a data fixa **08/09/2026**, indicada na interface. Os dados agora persistem no Postgres do Supabase, não mais em memória do navegador.

```sh
npm test
npm run typecheck
npm run build
```

## Funcionalidades

- Cadastro de obras, sequências temporais, vagões e locais de atividade.
- Planejamento por período; navegação entre predecessor e sucessor.
- Atividades com responsável, peso, local, datas, progresso, status e obrigatoriedade.
- Cadastro e confirmação de critérios de terminalidade.
- Pendências e restrições com responsável, prazo e resolução.
- Liberações inicial, normal e excepcional, com validação, justificativa e histórico.
- Dívidas próprias e herdadas, sem duplicação; filtros de abertas, vencidas e resolvidas.
- Reabertura de terminalidade exige gestor e justificativa, preserva liberações e alerta sucessores.
- Login real (Supabase Auth) com papéis de gestor, planejador e consulta; autorização por obra aplicada no servidor a cada comando.
- Consulta de obras/atividades e importação revisada do Prevision.

A liberação excepcional cria a autorização e as dívidas na mesma transação. Falhas descartam todo o rascunho. Dívidas herdadas mantêm o prazo original, e uma nova autorização registra seu reconhecimento. Resolver a pendência encerra a dívida sem apagar sua origem. Restrições impeditivas não podem ser contornadas por liberação excepcional. Correções que reduzam progresso exigem justificativa.

Datas são datas civis ISO. O calendário de dias úteis considera segunda a sexta, sem feriados. Atividades devem caber integralmente no período do vagão. Replanejar vagões liberados não é permitido nesta versão.

## Prevision

A credencial é lida exclusivamente no servidor da variável `PREVISION_API_TOKEN`. Configure em `.env.local` conforme `.env.example`; o arquivo é ignorado pelo Git. Nunca use prefixo `NEXT_PUBLIC_` para a credencial.

Documentação oficial: https://api.prevision.com.br/ e https://api.prevision.com.br/openapi.json.

Endpoints de consulta usados, com Bearer JWT:

- `GET /construction/api/v1/projects`
- `GET /construction-schedule/api/v1/project/{projectId}/activities`

A tela `/integracoes` consulta obras, permite criar sua contraparte local e selecionar atividades para um vagão. Na primeira importação, a obra local fica vinculada ao projeto externo; importações de outro projeto são recusadas. Atividades são identificadas por `projeto:atividade`; duplicatas são recusadas, sem sobrescrever execução local. Apenas o nível de atividade da API é importado, sem duplicar jobs e partes.

Datas, local e progresso vêm do Prevision. Responsável local é escolhido na revisão, peso inicial é 1 e a atividade é obrigatória. Cada atividade importada recebe um critério de conferência local não atendido, mesmo quando o progresso externo é 100%. Atividades com progresso exigem vagão liberado. Atividades que atravessam períodos não são cortadas ou distribuídas automaticamente. Registros inválidos são contados e excluídos da prévia.

Consultas têm timeout, mensagens sem credenciais, cache local de um minuto e intervalo mínimo de 11 segundos entre chamadas externas. Não há sincronização automática nem escrita no Prevision.

**A rota com credencial do Prevision continua bloqueada em produção**, independente do login — esse bloqueio antecede a autenticação real e não foi revisto nesta etapa. O login agora é real (Supabase Auth, veja a seção [Supabase](#supabase)), mas essa rota específica mantém o 403 em produção até essa decisão ser revisitada. Não publique o protótipo como sistema multiusuário com dados reais sem revisar esse ponto.

## Supabase

1. Crie um projeto em https://supabase.com/dashboard.
2. Rode a migração `supabase/migrations/0001_init.sql` no SQL Editor do projeto (ou `supabase db push` pela CLI).
3. Em Project Settings → API, copie a URL e as chaves `anon` e `service_role` para `.env.local` (a partir de `.env.example`): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
4. Rode `npm run seed` uma única vez: cria os três usuários de demonstração (gestor, planejador, consulta) via Supabase Auth e os mesmos dados fictícios do protótipo anterior. As credenciais de login são impressas no terminal ao final.
5. `npm run dev` e acesse `/login`.

`SUPABASE_SERVICE_ROLE_KEY` nunca deve ter o prefixo `NEXT_PUBLIC_` — ela ignora Row Level Security e só é usada no servidor (repositório e script de seed). O navegador nunca acessa o Postgres diretamente, só as rotas `/api/planning` e `/api/planning/commands`, autenticadas pela sessão do Supabase Auth.

Para publicar na Vercel, configure as mesmas variáveis (`PREVISION_API_TOKEN`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) em Project Settings → Environment Variables.

## Arquitetura e evolução

- `src/domain`: entidades, datas e regras puras.
- `src/application`: consultas, comandos e contrato de transação.
- `src/infrastructure/repositories/mock`: armazenamento em memória com cópias isoladas, usado pelos 35 testes de unidade.
- `src/infrastructure/repositories/supabase`: adaptador Postgres real (Supabase) usado pela aplicação em execução — `getSnapshot`/`transaction` sobre a mesma interface `PlanningRepository`.
- `src/infrastructure/auth`: sessão do Supabase Auth no servidor (usuário autenticado, perfil, papel).
- `src/infrastructure/integrations/prevision`: cliente HTTP no servidor e normalização testável.
- `src/modules`: interface por funcionalidade.
- `src/app`: App Router, login e rotas intermediárias (`/api/planning`, `/api/planning/commands`, `/api/prevision`).

Persistência em PostgreSQL/Supabase e autenticação real já estão implementadas: comandos rodam no servidor autenticados pela sessão, e a função `commit_planning` aplica cada transação de forma atômica com controle de concorrência otimista (versão em `planning_meta`). Hospedagem na Vercel e o relógio de produção (hoje fixo em 08/09/2026) permanecem como próximos passos.

## Rotas e cenários

- `/obras`: obras e cadastro.
- `/obras/obra-1/planejamento`: planejamento completo.
- `/obras/obra-1/vagoes/v2`: pendência e dívida própria.
- `/obras/obra-1/vagoes/v3`: restrição e dívida herdada.
- `/obras/obra-1/vagoes/v5`: não iniciado, aguardando liberação.
- `/obras/obra-1/vagoes/v6`: 100% de progresso aguardando critério.
- `/obras/obra-1/dividas`: gestão das dívidas.
- `/integracoes`: Prevision.

Validação: testes de terminalidade, permissões, rollback, importação, normalização, vínculos, datas, dívidas e reabertura. A conectividade real foi verificada com a consulta de obras e de atividades de uma obra, sem alterar o Prevision.
