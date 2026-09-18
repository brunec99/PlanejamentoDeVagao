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
- Repositório de modelos IFC por obra: cada envio transcreve o arquivo em tabelas e converte a geometria para Fragments, com histórico de versões.
- Quantitativo do modelo: quantidades somadas por tipo, distribuição por classe IFC e por pavimento, consulta elemento a elemento e exportação em CSV.
- Vinculação de elementos IFC a serviços por regras de propriedade, com marcação das regras que precisam de revisão.
- BIM 4D: modelo federado, consulta por data, recorte por pavimento e comparação com a linha de base escolhida.
- Consulta de obras/atividades e importação revisada do Prevision.

A liberação excepcional cria a autorização e as dívidas na mesma transação. Falhas descartam todo o rascunho. Dívidas herdadas mantêm o prazo original, e uma nova autorização registra seu reconhecimento. Resolver a pendência encerra a dívida sem apagar sua origem. Restrições impeditivas não podem ser contornadas por liberação excepcional. Correções que reduzam progresso exigem justificativa.

Datas são datas civis ISO. O calendário de dias úteis considera segunda a sexta, sem feriados. Atividades devem caber integralmente no período do vagão. Replanejar vagões liberados não é permitido nesta versão.

## Níveis de planejamento

A navegação da obra fica na barra lateral (`src/modules/layout/work-nav.tsx`), que deduz a obra pela URL e mostra o nome dela junto das seções: "Planejamento de longo prazo", "Planejamento de médio prazo", "Planejamento de curto prazo", "Vagões", "Modelos IFC", "BIM 4D", "Dívidas" e "Integrações". Fora de uma obra, a lateral não mostra essas seções.

**Longo prazo** (`/obras/{obraId}/longo-prazo`): define e lista as linhas de base da obra. Cada acionamento cria um registro novo, que copia o número e as datas planejadas dos vagões e as datas, o local e o peso das atividades. Reprogramar o planejamento atual nunca altera uma linha de base já salva — planejamento atual, linha de base e realizado permanecem registros distintos. A mesma tela traz o gráfico de Linha de Balanço: cada serviço é uma linha avançando pelos locais ao longo do tempo, com marcação de hoje, alternância para visão de tabela e sobreposição pontilhada da linha de base escolhida para comparação.

Também é aqui que fica o **quadro de pendências**, em três colunas. Cada pendência é ligada a uma atividade e a um lead time em dias, e o limite de resolução não é digitado: o servidor calcula a partir do **início previsto da atividade menos o lead time**, porque o prazo de obtenção precisa caber antes de a frente começar. O card abre em detalhe com a descrição completa, a atividade vinculada, o lead time e a origem da data. Se a atividade for reprogramada depois, o card mostra o limite recalculado e sinaliza a divergência em relação à data gravada. Quem preferir continuar digitando a data pode deixar o lead time em branco.

**Médio prazo** (`/obras/{obraId}/medio-prazo`): o **plano do mês**, escrito do zero. A tela nasce em branco — nada vem importado — e o planejador cria um plano por mês e escreve as linhas: nome, início, término, duração, recurso, predecessora e anotação. A leitura é a do MS Project: numeração de linha, sumário recolhível, predecessoras pelo número da linha, setas da rede e a barra na régua de tempo.

Cada linha pode apontar para uma atividade do longo prazo, sem obrigar — é o rastro entre o mês detalhado e o serviço macro, e a mesma frouxidão existe na planilha semanal.

**A linha de base é o próprio plano congelado**: "Definir linha de base" duplica o plano com `frozenAt` marcado, e o congelado não aceita edição. Por ser um plano como outro qualquer, ele abre no mesmo cronograma e serve de comparação — as linhas são pareadas **pelo nome**, já que a cópia tem ids próprios.

Nesta tela também fica o cadastro de equipes, que carrega empresa e equipe e abastece tanto o recurso do cronograma quanto as colunas Empresa e Equipe da planilha semanal. Excluir equipe é recusado enquanto ela estiver em uso.

As datas não se movem sozinhas, por decisão de escopo: a rede aponta a incoerência (sucessora que começa antes do término da predecessora) e a reprogramação é manual. Ligações que fechariam um ciclo são recusadas.

**Curto prazo** (`/obras/{obraId}/curto-prazo`): a planilha de produção que a equipe preenche toda semana, com a mesma estrutura do Sheets que ela substitui — empresa, semana, início, término, atividade, equipe, os dias marcados de segunda a sábado, e no fechamento o Status (Sim/Não), a causa e a justificativa.

A semana é montada do zero, como o plano do mês. A coluna Atividade é **texto livre**, porque a planilha real mistura frentes de obra com tarefas que não existem no cronograma ("Diário de obra", "GFIP", "Visita", "NF - ..."); o vínculo com uma atividade é opcional e serve de rastro. A mesma linha pode repetir na semana. "Copiar a semana anterior" traz as linhas da semana passada com as datas deslocadas em sete dias e sem apontamento, para o que é recorrente não ser redigitado.

A semana é sempre normalizada para a segunda-feira, e o período da linha tem de cair dentro dela. O número da semana é cumulativo, contado a partir da primeira semana planejada da obra — a planilha de origem pode ter outra origem de contagem, e a tela diz isso. As causas de não cumprimento são uma lista fechada de 17 itens, em `NON_FULFILLMENT_CAUSES` (`src/domain/entities.ts`), vinda da planilha; "Falha de Equipamento" e "Falta de equipamento" são causas distintas de propósito.

O PPC da semana conta compromissos cumpridos sobre compromissos assumidos — nunca é a média dos percentuais executados. A planilha é editável célula a célula, Status incluído: corrigir um apontamento é trocar a célula, não excluir a linha.

## Modelos IFC e BIM 4D

**Modelos IFC** (`/obras/{obraId}/ifc`): repositório de modelos da obra. Cada envio do mesmo modelo cria uma versão nova e nenhuma versão anterior é substituída ou apagada.

O IFC é tratado como o que ele é — uma base de dados, não um desenho — e o envio o parte em duas metades. Os **dados** viram tabelas (`ifc_elements`, `ifc_properties`, `ifc_quantities`): o navegador lê o STEP com `web-ifc` e manda as linhas em lote para `/api/ifc/elements`. A **geometria** é convertida para o formato Fragments (`@thatopen/fragments`) e guardada como um `.frag` no Storage, com o ponteiro em `ifc_fragments`. As duas metades se reencontram pelo GlobalId do IFC, que é a única identidade estável entre versões.

Guardar o `.ifc` original é opcional, e essa é a razão da divisão: o limite por arquivo do Storage trava em 50 MB no plano gratuito, enquanto um modelo de obra passa disso com folga — prender a versão ao arquivo faria esse limite decidir o que a obra pode planejar. A geometria convertida, ao contrário, cabe: um IFC de 217 MB medido virou 15 MB de `.frag`. Quando a versão tem o arquivo guardado, a tabela de versões oferece o download por URL assinada na hora; o bucket `ifc` é privado e a chave de serviço não sai do servidor.

Nada disso entra no snapshot do planejamento. Um modelo real tem centenas de milhares de linhas, e o snapshot trafega inteiro a cada comando: as tabelas transcritas têm rotas próprias (`/api/ifc/elements`, `/api/ifc/fragments`, `/api/ifc/status`) e são escritas pela ingestão, não pelo comando.

**Visualizador** (mesma tela): desenha a geometria convertida, que vem do Storage e é processada num worker — nunca o `.ifc` sendo relido no navegador. Por isso abre em qualquer tamanho de modelo. A cor sai do pavimento ou da classe IFC, dá para isolar um pavimento e clicar num elemento para ver o que a transcrição diz dele: classe IFC, nome, GlobalId e pavimento. Uma versão transcrita antes da conversão existir não tem geometria: a tela diz isso e pede o reenvio, em vez de mostrar um canvas vazio como se tivesse funcionado.

**Quantitativo** (mesma tela): as quantidades declaradas no modelo somadas por nome e tipo, a distribuição dos elementos por classe IFC e por pavimento, e a consulta elemento a elemento com filtros e exportação em CSV. A soma é feita no banco pela função `ifc_version_summary`, sobre o modelo inteiro — contar no navegador receberia só as primeiras mil linhas que a API REST devolve, uma amostra com cara de total.

**Vinculação por regras** (mesma tela): as regras ligam elementos a um serviço por propriedade, em vez de seleção manual elemento por elemento. Entre as regras que casam, vale a de menor ordem. A tela mostra quais regras precisam de revisão — aquelas cujo pavimento não existe em nenhum modelo atual — e tem um teste local de regra, que responde qual serviço seria vinculado a um pavimento e tipo informados, sem gravar nada.

Os vínculos elemento a elemento **não são armazenados**: só as regras são. Cada comando trafega o snapshot inteiro do planejamento, e materializar dezenas de milhares de elementos tornaria toda gravação proporcional ao tamanho do modelo. O vínculo é resolvido na visualização, a partir das regras.

**BIM 4D** (`/obras/{obraId}/quatro-d`): reúne as versões escolhidas num modelo federado — a mesma geometria convertida do visualizador —, colore os elementos pelo serviço vinculado por regra e responde a uma data. O executado até a data vem do histórico datado (o último lançamento de cada atividade até aquele dia), e uma linha de base pode ser escolhida para comparação. Há recorte por pavimento e uma tabela serviço × vagão com a mesma informação do 3D, para a tela seguir utilizável sem WebGL. O modelo só é carregado por ação explícita.

### O que ainda não existe

As telas dos três níveis estão na primeira versão: registram e mostram o que está descrito acima, sem curva S e sem comparação automática entre linha de base e realizado (no longo prazo e no 4D a comparação é visual). As regras cobrem pavimento e tipo de elemento; as demais propriedades IFC e as regras avançadas seguem para uma etapa posterior. A federação é a soma dos modelos numa mesma cena, sem detecção de interferência. O relógio de produção continua fixo em 08/09/2026.

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
2. Rode as migrações de `supabase/migrations/`, nessa ordem, no SQL Editor do projeto (ou `supabase db push` pela CLI): `0001_init.sql`, `0002_commit_planning_profiles.sql`, `0003_admin_role.sql`, `0004_prevision_schedule.sql`, `0005_commit_planning_delete.sql`, `0006_sequence_start_date.sql` `0007_teams_progress_baselines.sql`, `0008_ifc_repository.sql`, `0009_restriction_lead_time.sql` e `0010_activity_network.sql`. A `0007` cria as tabelas `teams`, `progress_entries`, `weekly_commitments` e `baselines`, adiciona `activities.team_id` e `restrictions.board_status` e reescreve a função `commit_planning` para cobrir as tabelas novas. A `0008` cria `ifc_models`, `ifc_model_versions` e `link_rules`, o bucket privado `ifc` no Storage, e reescreve `commit_planning` de novo. A `0009` adiciona `restrictions.lead_time_days`. A `0010` cria `activity_dependencies` e `activities.notes`. A `0011` reformata `weekly_commitments` para a planilha de produção. A `0012` leva a empresa para o cadastro de equipes, liga o compromisso à equipe e libera exclusão de equipe e de linha. A `0013` cria `medium_term_plans`, `plan_tasks` e `plan_dependencies` para o plano do mês. A `0014` deixa a linha da planilha ser escrita do zero (`work_id`, `name`, atividade opcional). A `0015` cria `ifc_elements`, `ifc_properties` e `ifc_quantities` — é a primeira que **não** reescreve `commit_planning`, porque as tabelas transcritas ficam fora do snapshot de propósito. A `0016` acrescenta as colunas de caixa envolvente em `ifc_elements`, hoje sem uso: elas são de uma tentativa anterior de guardar geometria como seis números por elemento, substituída pela conversão para Fragments. A `0017` solta o `not null` de `ifc_model_versions.storage_path`, que é o que torna o arquivo original opcional. A `0018` cria a função `ifc_version_summary`, que soma o quantitativo no banco. A `0019` cria `ifc_fragments`, o ponteiro para a geometria convertida. Cada migração é obrigatória antes de subir o código correspondente: o snapshot lê todas as tabelas em cada requisição, então uma tabela ausente derruba qualquer tela, não só as novas.
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
- `src/modules`: interface por funcionalidade — `planejamento` (vagões, dívidas, formulários e componentes reaproveitados), `longo-prazo`, `medio-prazo`, `curto-prazo`, `ifc`, `quatro-d`, `layout` (sub-navegação da obra), `integracoes`, `obras`, `configuracoes` e `tour`.
- `src/app`: App Router, login e rotas intermediárias (`/api/planning`, `/api/planning/commands`, `/api/prevision`, `/api/ifc/upload-url`, `/api/ifc/download-url`, `/api/ifc/elements`, `/api/ifc/fragments`, `/api/ifc/status`).

As entidades novas do domínio são `Team` (capacidade em atividades simultâneas por semana), `ProgressEntry` (percentual executado com data), `WeeklyCommitment` (compromisso semanal, com `weekStart` sempre na segunda-feira e cumprimento indefinido enquanto não apurado), `Baseline` (cópia imutável das datas planejadas), `IfcModel`/`IfcModelVersion` (modelo e histórico de versões, com o arquivo original opcional no Storage) e `LinkRule` (regra de vínculo por propriedade). As regras `ppc`, `teamLoad`, `matchesRule`, `serviceForElement` e `rulesNeedingReview` ficam em `src/domain/rules.ts`, junto das demais regras puras.

O snapshot pagina as tabelas com ordenação explícita por `id`. Sem isso a paginação não é determinística: cada comando regrava a tabela inteira e muda a ordem física das linhas, então uma escrita entre duas páginas faria o snapshot repetir ou perder registros — o que passou a importar quando as obras reais cruzaram as mil atividades.

Dois ativos de terceiro são buscados por URL pelo navegador: `public/wasm/web-ifc.wasm`, que lê o STEP, e `public/fragments/worker.mjs`, que processa a geometria fora da thread principal. Os dois são **versionados no repositório** de propósito: depender de um passo de build para copiá-los já falhou em produção sem aviso — o arquivo não aparecia no deploy e o visualizador abria sem conseguir carregar modelo. Servi-los de CDN tem o problema oposto: a versão mudaria sem aviso, e ela tem que casar com a do `package.json`. O script `copy-assets` (ganchos `predev` e `prebuild`) re-sincroniza os dois; rode-o e commite o resultado ao subir a versão de `web-ifc` ou de `@thatopen/fragments`. O `buildCommand` do `vercel.json` chama `copy-assets` explicitamente porque ele invoca `next build` direto, e aí o gancho `prebuild` do npm não dispara: renomear o script sem atualizar o `vercel.json` derruba o deploy — já aconteceu.

Persistência em PostgreSQL/Supabase e autenticação real já estão implementadas: comandos rodam no servidor autenticados pela sessão, e a função `commit_planning` aplica cada transação de forma atômica com controle de concorrência otimista (versão em `planning_meta`). Hospedagem na Vercel e o relógio de produção (hoje fixo em 08/09/2026) permanecem como próximos passos.

## Rotas e cenários

- `/obras`: obras e cadastro.
- `/obras/obra-1/longo-prazo`: Linha de Balanço e linhas de base.
- `/obras/obra-1/medio-prazo`: Look Ahead, equipes e quadro de restrições.
- `/obras/obra-1/curto-prazo`: compromissos da semana e PPC.
- `/obras/obra-1/vagoes`: planejamento completo por vagão.
- `/obras/obra-1/vagoes/v2`: pendência e dívida própria.
- `/obras/obra-1/vagoes/v3`: restrição e dívida herdada.
- `/obras/obra-1/vagoes/v5`: não iniciado, aguardando liberação.
- `/obras/obra-1/vagoes/v6`: 100% de progresso aguardando critério.
- `/obras/obra-1/ifc`: modelos IFC, versões e regras de vínculo.
- `/obras/obra-1/quatro-d`: modelo federado e comparação na data escolhida.
- `/obras/obra-1/dividas`: gestão das dívidas.
- `/obras/obra-1/importar`: Prevision.

Validação: testes de terminalidade, permissões, rollback, importação, normalização, vínculos, datas, dívidas e reabertura. A conectividade real foi verificada com a consulta de obras e de atividades de uma obra, sem alterar o Prevision.
