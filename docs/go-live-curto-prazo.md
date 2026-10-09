# Go-live do curto prazo — 07/10/2026

Continuidade entre os modelos de IA. Este documento registra o que foi entregue para colocar **só o curto prazo** em produção num Supabase novo, o que foi validado e o que falta. A seção [Pendências](#pendências) separa o que está pronto em código do que ainda depende do usuário.

## Decisões do usuário (07/10/2026)

- **Banco novo** no Supabase pago da ATR. O banco antigo (`fanktscgrprylqqnwjje`) é **abandonado**, sem migração de dados. **Atualização de 08/10/2026:** para não pagar outro projeto, o banco é o **mesmo projeto `takt-hub`** (ref `guoipstyngcylfyfzoup`), dividido com o Takt Hub. Veja [Projeto compartilhado com o Takt Hub](#projeto-compartilhado-com-o-takt-hub-08102026).
- **Mesmo endereço** na Vercel (`obra360-atr.vercel.app`). A virada é feita trocando as três variáveis do Supabase.
- **Histórico do Sheets importado:** os planejamentos semanais de cada obra entram no sistema para que o passado não se perca. As planilhas são lidas pelo conector Google Drive.
- **Curto prazo aberto a todos.** Longo prazo, vagões, médio prazo e todo o grupo Apoio (federado, IFC, dívidas, integrações) ficam **restritos ao desenvolvedor**, e serão liberados em etapas, conforme ficarem prontos.

## 1. Restrição dos módulos ao desenvolvedor

Ser desenvolvedor **não é um papel**. A condição se soma ao papel (consulta, planejador, gestor, admin) e às obras liberadas, que continuam valendo. Quem é desenvolvedor vem da variável `DEVELOPER_EMAILS` (e-mails separados por vírgula). Sem a variável, vale o admin inicial `bruno.engenharia@atrincorporadora.com.br`. O acesso local sem login (`DEV_AUTH_BYPASS_PROFILE_ID`) conta como desenvolvedor.

A regra está numa só função pura, `src/application/module-access.ts`, usada pelo proxy, pelas rotas e pelos testes (`tests/module-access.test.ts`). A proteção tem três camadas:

| Camada | O que faz com quem não é desenvolvedor |
| --- | --- |
| `src/proxy.ts` | Redireciona `longo-prazo`, `vagoes` (e `vagoes/<id>`), `medio-prazo`, `federacao`, `ifc`, `dividas` e `importar` para `/obras/<id>/curto-prazo`. Responde 403 em `/api/long-term-plan`, `/api/prevision`, `/api/ifc` e `/api/history`. |
| `POST /api/planning/commands` | Aceita só os comandos `create_commitment`, `update_commitment`, `delete_commitment` e `record_fulfillment`; os de equipe (`create_team`, `update_team`, `delete_team`); e os de administração (`set_role`, `grant_access`, `revoke_access`, `create_work`). Os demais recebem 403 "Módulo disponível apenas para desenvolvimento.". |
| Interface | A lateral e a faixa do celular mostram só a aba 4 e as Configurações da obra. O cartão da obra abre o curto prazo. O botão "Gerar restrição" do curto prazo é escondido, porque cria restrição em vagão. Os atalhos para o médio prazo nas equipes e o bloco "Takt por obra" das Configurações também ficam escondidos. |

O servidor obtém a condição de desenvolvedor por `getRouteAccess()` (`src/infrastructure/auth/supabase-server.ts`), com uma única leitura da sessão. O layout repassa o resultado ao `PlanningProvider`, e os componentes o leem com `useDeveloper()`. Esconder elementos na interface é só cosmético: a proteção real são o proxy e a conferência dos comandos.

Ficam abertos a todos, sujeitos às regras de papel já existentes: `/obras`, `/obras/<id>/curto-prazo`, `/obras/<id>/configuracoes` e `/configuracoes` (admin), além das APIs `/api/planning`, `/api/work-settings`, `/api/admin/*` e `/api/health`.

**Limite conhecido:** `GET /api/planning` continua devolvendo o snapshot inteiro a quem tem a obra, porque o curto prazo depende dele. Com o banco novo vazio, não há dados dos outros módulos a expor, exceto o que o desenvolvedor criar nas obras.

**Liberar um módulo depois:** basta tirá-lo de `RESTRICTED_SECTIONS`/`RESTRICTED_API_PREFIXES` e pôr os comandos dele em `NON_DEVELOPER_COMMANDS`.

## 2. Esquema do banco novo num arquivo só

- **`supabase/bootstrap/obra360-schema.sql`** (288 KB): as migrações 0001 a 0027, em ordem, mais uma seção de ajustes. É gerado por `npm run bootstrap:sql` (`scripts/build-bootstrap-sql.mjs`). Com `--check`, o script falha se o arquivo estiver desatualizado.
- **`supabase/bootstrap/conferencia.sql`**: consulta somente de leitura com 57 itens (tabelas, RLS, funções e privilégios, gatilhos de imutabilidade, bucket `ifc`). A última linha deve dizer "57 de 57 itens OK".
- **`scripts/validate-bootstrap-sql.mjs`**: aplica o arquivo num PGlite vazio que simula os papéis e privilégios padrão do Supabase. Em seguida grava obra, equipe e compromisso por `commit_planning`, lê tudo por `planning_snapshot` e roda as sondagens de `migrations.ts`, que dão 22 de 22.

O arquivo roda **uma vez**, num projeto vazio. O SQL Editor executa tudo numa transação: se falhar, nada fica aplicado. Rodar de novo falha com "already exists", porque a 0023 cria funções e gatilhos sem `or replace`.

### Falha de segurança encontrada nas migrações

A 0001 criou `commit_planning(bigint, jsonb)` com `security definer` e só tirou o EXECUTE de `public`. A partir da 0005, a função passou a ter três parâmetros. Como `create or replace` com outra assinatura cria uma função **nova**, a versão de dois parâmetros continuou existindo, com o corpo da 0002 (que grava `profiles`). No Supabase, os privilégios padrão dão EXECUTE direto a `anon` e `authenticated`, e a 0023 só revogou isso da versão de três parâmetros. Resultado: quem tivesse a chave anônima (pública, embutida no site) podia chamar a versão antiga pela API, inclusive para promover o próprio perfil.

- **Banco novo:** o arquivo de bootstrap remove essa versão (`drop function if exists public.commit_planning(bigint, jsonb)`). A aplicação sempre chama a de três parâmetros.
- **Banco antigo:** é provável que tenha a falha. Depois da virada, **pausar o projeto antigo** no painel do Supabase. Para conferir: `select has_function_privilege('anon','public.commit_planning(bigint,jsonb)','execute');`.

Os ajustes também dão à `service_role`, de forma explícita, acesso às tabelas e recarregam o esquema do PostgREST.

## 3. Importação do histórico do Sheets

- **Lógica pura** (sem banco, testável): `src/application/use-cases/import-commitments.ts`. Testes em `tests/import-commitments.test.ts` (11, um deles de ponta a ponta no repositório em memória).
- **Linha de comando:** `scripts/import-curto-prazo.ts`. Exemplo em `scripts/exemplo-curto-prazo.csv`.

```
node --import tsx scripts/import-curto-prazo.ts <arquivo.csv> --actor <id do perfil> [--work-id <id>] [--create-works] [--causes-map mapa.json] [--env-file .env.local] [--apply]
```

**Formato normalizado** (UTF-8, separador `;`, com cabeçalho, uma linha por linha da planilha):

`obra;empresa;semana;inicio;termino;atividade;equipe;status;causa;justificativa`

- **semana:** segunda-feira em ISO. Outra data é levada à segunda da mesma semana.
- **inicio/termino:** datas dentro da semana. Em branco, valem a segunda.
- **status:** `Sim`, `Não` ou em branco.
- **causa:** obrigatória com `Não`. Precisa estar na lista oficial de 17 causas (acento e caixa são ignorados) ou constar do `--causes-map`.
- **equipe:** reaproveita a equipe da obra com o mesmo nome e empresa, ou cria uma com capacidade 3.

**Funcionamento:**
- **Simulação:** sem `--apply`, o script só simula, aplicando tudo a uma cópia, e imprime o relatório por obra. O relatório mostra linhas, semanas, Sim/Não/sem registro, empresas, equipes a criar, amostra do PPC e erros com número de linha.
- **Gravação:** com `--apply`, nada é gravado se a simulação tiver erro. Cada obra é gravada numa única transação (`SupabasePlanningRepository.transaction`), com os mesmos comandos e validações da tela: `create_work`, `create_team`, `create_commitment` e `record_fulfillment`.
- **Reexecução:** rodar o mesmo CSV de novo não duplica. A chave natural é (obra, semana, início, término, atividade, empresa, equipe), e repetições legítimas na mesma semana continuam separadas. Uma linha corrigida no texto vira um compromisso novo. Nada é apagado.
- **Data do registro:** o `recordedAt` do cumprimento vai para o sábado da semana; o histórico de eventos guarda a hora real da importação.
- **Semanas passadas:** o domínio já aceitava semanas passadas, então nenhuma regra foi afrouxada.

O ator (`--actor`) precisa ser **admin** com acesso à obra: desde 08/10/2026 as semanas passadas ficam encerradas para os demais. No banco novo, esse perfil é o do admin inicial, criado no primeiro login com o Google.

## Projeto compartilhado com o Takt Hub (08/10/2026)

O Takt Hub (repositório `~/Applications/App-Takt`) foi desenhado desde a primeira migração para dividir o projeto com este sistema. Tudo dele mora nos schemas `takt` e `takt_private`, e o Obra 360 fica no `public`. Antes de colar o bootstrap, o usuário confirmou que o `public` do `takt-hub` estava vazio, ou seja, a consulta a `information_schema.tables` não devolveu linhas.

**O que não colide:**
- **Tabelas:** os dois sistemas têm `profiles`, mas em schemas diferentes.
- **Permissões:** o Takt revoga privilégios só no `takt`, e os ajustes do bootstrap só tocam o `public`.
- **Buckets:** os do Takt são `obra-capas`, `rh-fotos` e `rh-documents`; o nosso é `ifc`.
- **Gatilho de novos usuários:** o `takt.handle_new_user` só cria perfil do Takt quando o cadastro traz `app = 'takt-hub'`.

**O que é do projeto inteiro e passou a ser dividido:** o Auth (usuários, provedores, Site URL, Redirect URLs, modelos de e-mail, SMTP, cadastro aberto), a máquina e o backup. Restaurar o banco para um ponto anterior volta os dois sistemas juntos.

**Mudanças no Obra 360 por causa disso:**
- **Pré-cadastro em vez de convite** (`src/app/api/admin/invite/route.ts`). O Takt mantém "Allow new users to sign up" **desligado**, então um e-mail sem conta não consegue entrar pelo Google. Além disso, o modelo de e-mail de convite é o do Takt. Por isso o admin agora cadastra e-mail, papel e obras em Configurações → "Cadastrar usuário", e **nenhum e-mail é enviado**. A conta nasce confirmada (`admin.createUser` com `email_confirm: true`), e o Google vincula a identidade a ela no primeiro login pelo mesmo e-mail. Se a conta já existe, por exemplo no Takt, ela é reaproveitada e só o perfil do Obra 360 é criado.
- **Excluir usuário remove só o perfil do Obra 360** (`src/app/api/admin/users/[id]/route.ts`). Antes, a exclusão apagava a conta do Auth, o que tiraria a pessoa do Takt também.
- **Lista de e-mails das Configurações** (`src/app/api/admin/users/route.ts`): mostra só quem tem perfil no Obra 360, sem expor os usuários do Takt.

**Configuração no painel do `takt-hub`:**
1. **Authentication → Sign In / Providers → Google:** ativado em 08/10/2026 com o cliente OAuth `974597958612-ga8lt2kn…` ("Supabase takt-hub"), usado pelos dois sistemas. Ele foi criado no projeto Google Cloud "Site Engenharia ATR", da organização `atrincorporadora.com.br`, o mesmo do cliente do bi-atr. A tela de consentimento desse projeto é **Externa**: o Takt também oferece Google a clientes com contas de fora da ATR. Ela é compartilhada com o bi-atr, então não deve ser alterada sem conferir o BI. Se a marca do app não estiver verificada pelo Google, a tela de escolha de conta mostra o domínio `guoipstyngcylfyfzoup.supabase.co` no lugar do nome do app. É só cosmético, e se resolve depois com a verificação da marca ou um domínio próprio no Supabase.
2. **Authentication → URL Configuration:** **manter** o Site URL do Takt e **acrescentar** aos Redirect URLs `https://obra360-atr.vercel.app/**` e `http://127.0.0.1:3000/**`.
3. **Cadastro aberto** continua desligado.
4. **Primeiro acesso do admin:** `bruno.engenharia@atrincorporadora.com.br` já existe no Auth como admin do Takt. O primeiro login no Obra 360 pelo Google vincula a identidade a essa conta e cria o perfil admin do Obra 360 com todas as obras, pela regra de `BOOTSTRAP_ADMIN_EMAIL`.

**Regra para os dois sistemas:** nenhum deles pode apagar uma conta do Auth que o outro usa. Nenhum deles pode revogar privilégios "em todo o schema" fora do próprio schema. Os dois encerram sessões com `signOut({ scope: 'local' })`, inclusive no "Sair" do menu e nas recusas do callback. O escopo padrão (`global`) derrubaria a mesma pessoa no outro sistema.

**Migrações novas do Obra 360 neste projeto:** no `takt-hub`, a exposição automática de tabelas novas está desligada. Por isso, toda tabela nova precisa de `grant select, insert, update, delete on <tabela> to service_role`, e toda função chamada por RPC precisa de `grant execute ... to service_role`. Sem isso, o servidor não enxerga a tabela, e o snapshot derruba todas as telas. A `conferencia.sql` aponta tabela sem privilégio da `service_role`.

**Login Google (`src/app/auth/callback/route.ts`):** desde 08/10/2026 só entra quem tem perfil. A exceção é o primeiro acesso de `BOOTSTRAP_ADMIN_EMAIL`. A recusa do Supabase a um e-mail sem conta ("Signups not allowed", com o cadastro aberto desligado) vira a mensagem "Seu e-mail ainda não foi cadastrado no Obra 360". Antes, qualquer conta da ATR ganhava um perfil de Consulta sozinha. Num Auth dividido, isso incluiria contas do Takt e pessoas excluídas do Obra 360.

## Validação (07/10/2026)

- TypeScript sem erros. `npm test`: 275 de 275 testes aprovados.
- `npm run validate:migrations` e `node scripts/validate-bootstrap-sql.mjs`: OK.
- `npm run lint`: 0 erros.
- `npm run build` concluído.
- **Não validado:** a navegação logada com uma conta que não é de desenvolvedor, o bootstrap num Supabase real e a importação contra o banco real.

## Pendências

**Do usuário** (projeto `takt-hub`; ver a seção do projeto compartilhado):
1. **Google Cloud — feito em 08/10/2026.**
   - **O que foi feito:** cliente novo "Supabase takt-hub" (`974597958612-ga8lt2kn…`), criado no projeto da ATR com o redirect do takt-hub, e Google ativado no `takt-hub` com esse cliente.
   - **Conferido de fora:** o login do takt-hub manda para esse cliente, e o Google aceita o redirect.
   - **Público-alvo:** Externo, segundo o usuário. Isso é seguro nos três sistemas: o bi-atr tem trava própria (`App-ATR/src/auth.ts`: conta nova entra sem nenhuma seção liberada), o Obra 360 exige @atr e cadastro, e o Takt exige conta criada pela Takt e perfil ativo.
   - **Plano anterior:** um projeto novo, criado do zero pela conta @atr. Foi trocado pela alternativa mais curta descrita abaixo.
   - **Publicação: feita em 08/10/2026**, com o app "Sistemas ATR" agora "Em produção". Passos:
     - O Google exige, no Branding, o nome do app, o e-mail de suporte, a página inicial e a política de privacidade, as duas últimas em domínios autorizados.
     - O app estava em "Testando", com zero usuários de teste, ou seja, ninguém entrava pelo Google, nem no bi-atr.
     - Para isso foi criada a página pública `src/app/privacidade/page.tsx`, liberada no matcher de `src/proxy.ts`. O texto é factual sobre o login (nome, e-mail e foto, usados só para identificar e registrar autoria) e ainda precisa de **revisão jurídica**.
     - Branding: página inicial `https://obra360-atr.vercel.app` e política `https://obra360-atr.vercel.app/privacidade`.
     - Domínios autorizados: `bi-atr.vercel.app`, `obra360-atr.vercel.app` e `guoipstyngcylfyfzoup.supabase.co`. O `fanktscgrprylqqnwjje.supabase.co` sai. O cliente OAuth antigo ("Site engenharia", `974597958612-05ij…`, projeto Google Cloud "Site Engenharia ATR") deixa de ser usado pelo Obra 360. O projeto novo evita depender de saber em que conta ele estava, porque o dono não foi confirmado: os prints de 09/09 mostram só o avatar. **Atualização (08/10, print do usuário):** o projeto "Site Engenharia ATR" (`site-engenharia-atr`, nº 974597958612) fica na organização `atrincorporadora.com.br`, ou seja, é da empresa. Daí veio a alternativa mais curta, proposta ao usuário: criar só um **cliente novo** dentro dele, sem mexer em Branding nem em Público-alvo. Esses dois itens são compartilhados com o bi-atr, e trocar o público dele mudaria quem consegue entrar no BI.
   - **Não excluir o cliente antigo nem trocar o segredo principal dele:** o BI da ATR (`bi-atr.vercel.app`, NextAuth) usa esse cliente, como foi observado em 08/10/2026.
   - **Limpeza depois da virada:** remover desse cliente o redirect `https://fanktscgrprylqqnwjje.supabase.co/auth/v1/callback`.
   - **Limpeza depois da virada:** remover o segundo segredo, criado em 09/09 para o Supabase. Ele ficou em texto puro num histórico local de sessão do Claude. Antes, confirmar que o bi-atr usa o segredo de 11/05.
   - **Estado do projeto Supabase antigo:** `fanktscgrprylqqnwjje` dá NXDOMAIN desde, no máximo, 08/10/2026. Estava saudável em 30/09 e respondia em 01–02/10. Pode estar **excluído ou pausado**: o plano Free pausa após 7 dias sem uso, e o DNS não distingue um caso do outro. **A produção do Obra 360 ainda aponta para ele**, então o login em produção está fora do ar até a virada. Se estiver só pausado, o "Restore" no painel do Supabase devolve a produção antiga até lá.
   - Criar um cliente OAuth do tipo "Aplicativo da Web" com o redirect `https://guoipstyngcylfyfzoup.supabase.co/auth/v1/callback`.
   - Público **Externo**, com o app publicado (em produção). Escopos básicos: `openid`, `email` e `profile`.
   - Ativar o Google em Authentication → Providers do `takt-hub` com o Client ID e o segredo desse cliente.
   - Em URL Configuration, acrescentar `https://obra360-atr.vercel.app/**` e `http://127.0.0.1:3000/**`, mantendo o Site URL do Takt.
2. **Feito em 08/10/2026:** `obra360-schema.sql` aplicado no `takt-hub` pelo SQL Editor. A `conferencia.sql` deu **57 de 57 itens OK**, com uma assinatura só de `commit_planning` e nenhuma função SECURITY DEFINER executável por anon/authenticated. Daqui em diante, as migrações novas vão uma a uma, e não se roda o bootstrap de novo.
3. Reconectar o Google Drive e indicar as planilhas.
4. Na Vercel do Obra 360, trocar `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` pelas do `takt-hub`, opcionalmente definir `DEVELOPER_EMAILS`, e publicar.
5. Primeiro login com `bruno.engenharia@…`, que cria o admin do Obra 360. Depois, cadastrar a equipe e liberar as obras nas Configurações.
6. Pausar o projeto Supabase antigo.

**Do desenvolvimento:**
- Converter cada planilha para o CSV normalizado, montar o mapa de causas e rodar a simulação e depois a importação no banco novo.
- Como o banco novo é ao mesmo tempo produção e desenvolvimento, toda migração nova do médio/longo prazo precisa ser aplicada **antes** do deploy, porque o snapshot lê todas as tabelas. Depois, regenerar o bootstrap com `npm run bootstrap:sql`.

## Admins acessam os módulos em teste (08/10/2026)

A pedido do usuário, a condição de desenvolvedor passou a valer também para **todo perfil com papel admin**, além dos e-mails de `DEVELOPER_EMAILS`. A regra fica em `hasDeveloperAccess` (`src/application/module-access.ts`) e é usada em dois lugares:

- **Servidor:** `getRouteAccess` usa o papel do perfil já carregado.
- **Proxy:** conhece só o e-mail da sessão. Ele lê o papel em `profiles`, com a chave de serviço, **apenas** quando o e-mail não está na lista **e** o endereço é restrito. As demais requisições não fazem consulta extra. Se a leitura falhar, o endereço continua fechado.

Isso funciona porque o proxy roda em Node.js no Next 16.

## Importação do histórico da Blentt (08/10/2026)

**Origem:** `~/Downloads/PCP-BLT.xlsx`. Por decisão do usuário, entrou **só a aba "Curto prazo"**. As listas de pendências (geral e de personalização) e as demais abas, como plotagens, desperdício, SST e lista mestra, ficaram de fora.

**Conversão:** o .xlsx foi lido sem dependências, abrindo o zip e lendo o XML das células. Ele foi convertido para o CSV normalizado e gravado com `scripts/import-curto-prazo.ts`, em 6 lotes de 20 semanas, com `--env-file` apontando para o `.env.local` do App-Takt (projeto `takt-hub`).

**Resultado conferido no banco:**
- 5.993 compromissos, nas semanas 1 a 116 (29/07/2024 a 12/10/2026): 4.081 Sim, 1.456 Não e 456 não apurados;
- 205 equipes criadas;
- semana 1 da obra definida em 29/07/2024 (`work_settings`), para os números baterem com a planilha.

**Decisões do usuário sobre as causas:**
- "Mudança de Planejamento" e "Mudança do método executivo" **entraram na lista oficial** (`NON_FULFILLMENT_CAUSES`).
- "Documentação Empreiteiro pendente" virou "Falta de documentação".
- Os 386 "Não" sem causa entraram com a nova causa "Causa não informada", sem inventar uma causa.

**Ajustes automáticos nas datas:**
- 157 linhas sem data entraram na segunda-feira da semana.
- 37 linhas com data fora da semana indicada, ou com término antes do início, mantiveram a semana da linha, e a data foi trazida para dentro dela.

**Reexecução:** a mesma importação acusa "2 atualizadas". São pares de linhas idênticas na mesma semana, com resultados diferentes, que o pareamento pela chave natural pode trocar. As contagens totais batem, então **não reaplicar**.

## Varredura de segurança e robustez (09/10/2026)

- **Cadastrar usuário já cadastrado** sobrescrevia nome, papel e obras (um gestor voltaria a consulta sem obra). Agora responde 409 "Usuário já cadastrado. Altere o papel e as obras na lista abaixo." A conta que só existe no Takt, sem perfil, continua sendo cadastrada.
- **Segunda camada de bloqueio dos módulos:** além do proxy, cada página restrita (`longo-prazo`, `vagoes`, `medio-prazo`, `federacao`, `ifc`, `dividas`, `importar`) desvia para o curto prazo, e cada rota restrita (`/api/long-term-plan`, `/api/prevision`, `/api/ifc/*`, `/api/history`) responde 403 pelo `requireDeveloperAccess()`, na mesma leitura de sessão que dá o perfil.
- **Importador:** linhas de chave igual e apontamentos diferentes podiam trocar de apontamento numa reexecução (os "2 atualizadas" da Blentt). Agora casam primeiro pelo apontamento idêntico, e as linhas criadas recebem `createdAt` distinto, na ordem do CSV. Nenhuma reexecução foi feita em produção.
