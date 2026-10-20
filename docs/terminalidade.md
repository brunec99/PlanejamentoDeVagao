# Aba 5 — Terminalidade (08/10/2026)

Este documento registra a continuidade entre os modelos de IA que trabalham no repositório. Ele descreve o comportamento entregue, as decisões, os arquivos, a migração, a validação e as pendências. Não registre intenção como se fosse funcionalidade pronta.

## O que é

A aba 5 é a "Lista de pendências" da obra. Ela substitui a planilha do Sheets usada até 08/10/2026 e mantém as mesmas colunas:

- Local (pavimento)
- Apto
- Descrição da pendência
- Tipo
- Data observação
- Data correção
- Responsável ATR
- Responsável Terceiro (empreiteiro)
- Foto
- Resolvido?
- Foto da correção

A aba fica **aberta a todos os usuários** desde o primeiro dia, como o curto prazo. Ela não está em `RESTRICTED_SECTIONS` (`src/application/module-access.ts`).

## Decisões do usuário (08/10/2026)

- **Colunas e classificação:** seguem a planilha atual. O usuário enviou um print com as colunas acima e os tipos A/C, RI e PINTURA.
- **Locais:** **cadastro por obra**. Pavimentos e, dentro de cada um, unidades (apartamentos ou áreas comuns), escolhidos em lista.
- **Tipos:** lista **editável por obra**, que nasce com os da planilha.
- **Responsável ATR:** **lista de nomes por obra**. Inclui pessoas que não usam o sistema, como mestre de obras e estagiário.
- **Responsável Terceiro:** empresa do mesmo cadastro de empresas e equipes do curto prazo (`teams.company`), guardada como texto.
- **Fotos:** **antes e depois**. A foto da correção é **obrigatória** para marcar a pendência como resolvida, junto com a data da correção.
- **Custo das fotos:** a imagem é comprimida no navegador para cerca de 1600 px e 300 KB, com uma miniatura de cerca de 320 px.
  - Uma obra de 300 apartamentos, com 5 pendências e 2 fotos por pendência, ocupa cerca de 1 GB.
  - O plano Pro da organização ATR inclui 100 GB de armazenamento. Acima disso, o custo é de US$ 0,021 por GB por mês.

## Arquitetura

A aba fica **fora do snapshot do planejamento e do `commit_planning`**, como `long_term_plans` e `work_settings`. As pendências e as fotos crescem com a obra, e cada gravação do planejamento envia o snapshot inteiro. Por isso a aba tem leitura e gravação próprias. Sem a migração, só a aba 5 para de funcionar.

| Camada | Arquivo |
| --- | --- |
| Migração | `supabase/migrations/0028_terminality.sql` |
| Tipos e contrato | `src/domain/terminality.ts` |
| Regras dos comandos (puras) | `src/application/use-cases/terminality-commands.ts`, com testes em `tests/terminality-commands.test.ts` |
| Repositório | `src/infrastructure/repositories/supabase/terminality-repository.ts` |
| API | `src/app/api/terminalidade/route.ts` (GET), `commands/route.ts` (POST) e `upload-url/route.ts` (POST) |
| Cliente | `src/modules/terminalidade/api.ts` (`useTerminality`, `uploadTerminalityPhoto`) |
| Tela | `src/modules/terminalidade/terminality-overview.tsx`, `terminality-view.ts`, `photo-viewer.tsx`, `item-dialog.tsx`, `resolve-dialog.tsx`, `photo-input.tsx` e `compress-image.ts` |
| Cadastros | `src/modules/configuracoes/terminality-catalogs.tsx` e `terminality-generator.ts`, com testes em `tests/terminality-generator.test.ts` |
| Rota da página | `src/app/(app)/obras/[obraId]/terminalidade/page.tsx`. A aba está em `WORK_TABS` em `work-nav.tsx`. |

### Banco (0028)

- **Tabelas:**
  - `terminality_floors` e `terminality_units`: o cadastro de locais;
  - `terminality_types` e `terminality_people`: as listas da obra. Itens dessas listas são desativados, nunca apagados;
  - `terminality_items`: as pendências. Uma restrição garante que `status = 'resolved'` ande junto com `corrected_on` preenchido;
  - `terminality_photos`: as fotos. Usam `on delete cascade` a partir da pendência.
- **Segurança:** RLS ligada sem nenhuma política. Os grants para `service_role` são **explícitos**, porque o `takt-hub` não expõe tabelas novas automaticamente.
- **Bucket `terminalidade`:** privado. No Supabase real, ele recusa arquivos acima de 2 MB ou que não sejam JPEG. O bloco `do $$` só age onde essas colunas existem, para a validação local em PGlite continuar rodando.
- **Caminhos das fotos:** `<obra>/<pendência>/<foto>.jpg` e `<foto>-thumb.jpg` (`terminalityPhotoPaths`).
- A migração pode ser rodada de novo. Ela **não** reescreve o `commit_planning`.

### Fluxo das fotos

1. O navegador gera o id da pendência (UUID) e envia `create_item`.
2. Para cada foto, o navegador comprime a imagem e pede `POST /api/terminalidade/upload-url`, que devolve duas URLs assinadas: uma para a imagem e outra para a miniatura.
3. O navegador envia a imagem e a miniatura direto ao Storage, por `PUT` nessas URLs.
4. O navegador envia `add_photo`. O servidor confere se os caminhos batem com o padrão.

A leitura devolve URLs assinadas válidas por 1 hora.

### Comandos e regras

Todos os comandos passam por `POST /api/terminalidade/commands`. Antes de executar, o servidor confere três coisas: o perfil, o acesso à obra (alvo do comando ou dona do registro) e se o perfil não é de consulta.

- **Nomes:** recebem `trim`. Nomes repetidos são recusados ignorando acento e maiúsculas, inclusive contra itens inativos. Nesse caso, a mensagem sugere reativar o item.
- **Exclusões:** um pavimento só sai sem unidades e sem pendências. Uma unidade só sai sem pendências.
- **Datas:** a data de observação não pode estar no futuro. O "hoje" é o de São Paulo (`commandContext`).
- **Resolver:** exige ao menos uma foto de correção e a data da correção, que precisa ficar entre a observação e hoje. Reabrir limpa a resolução e mantém as fotos. A última foto de correção de uma pendência resolvida não pode ser apagada.
- **Excluir pendência:** apaga a linha (as fotos saem em cascata) e depois os arquivos no Storage.
- **Respostas HTTP:**
  - 400: recusa da regra;
  - 404: registro sumiu;
  - 409: conflito;
  - 503: migração ausente;
  - 502: falha inesperada.

## Validação (08/10/2026)

- `npm run validate:migrations`: OK.
- `node scripts/validate-bootstrap-sql.mjs`: OK. O bootstrap tem 28 migrações e a `conferencia.sql` dá 64 de 64. O script testa a coerência entre status e data da correção, as fotos em cascata e a aba fora do snapshot.
- **Testes:** 336 de 336 no total. Os novos são:
  - 27 das regras dos comandos;
  - 11 do gerador de pavimentos e unidades;
  - 15 dos filtros e contagens da tela;
  - 8 da matemática de compressão.
- **Checagens:** TypeScript sem erros, ESLint sem erros e `npm run build` concluído (rota da aba e as três rotas da API).
- **Detalhes de comportamento:**
  - O limite de 10 fotos vale para a pendência inteira. Enquanto ela está aberta, a tela reserva uma vaga para a foto da correção.
  - Se uma foto falhar depois de a pendência ser criada, o formulário vira edição daquela pendência e oferece "Tentar de novo" só para o que faltou.
- **Não validado:** a aba no navegador, logado, e o envio real de fotos ao Storage. Isso depende de aplicar a 0028 no `takt-hub` e publicar.

## Pendências

- **0028 aplicada no `takt-hub` em 08/10/2026.** As 6 tabelas respondem, e o bucket `terminalidade` é privado, com limite de 2 MB e só JPEG. Falta testar a aba logado, no celular.
- **Fotos órfãs:** se o navegador fechar entre o envio e o `add_photo`, o arquivo fica sem pendência. Ainda não há limpeza automática.
- **Edição simultânea:** não há trava de versão. Se duas pessoas editarem a mesma pendência ao mesmo tempo, vale a última gravação.
- **Importação:** a lista atual do Sheets ainda não foi importada. O primeiro passo é cadastrar os locais.

## Correções de 09/10/2026

- `add_photo` só grava se os dois arquivos (imagem e miniatura) já estiverem no bucket; antes, uma pendência podia ser resolvida com uma "foto" inexistente.
- As URLs assinadas das fotos valem 1 h: a aba recarrega em silêncio ao voltar ao foco depois de 45 min e refaz a URL uma vez quando uma imagem falha (`photo-refresh.ts`).
- Os cadastros recarregam sozinhos ao receber 409 (dados alterados por outra pessoa).
- Envio de foto: o PUT que falha é repetido uma vez com o mesmo ticket; se falhar de novo, `DELETE /api/terminalidade/upload-url` apaga o que subiu (só sem linha registrada). Ainda falta uma limpeza periódica de arquivos órfãos.

## Modo de campo: celular e sem sinal (14/10/2026)

O usuário pediu que a terminalidade funcionasse no celular e sem sinal, seguindo a lógica da vistoria da **Obra do Mês** no App-ATR (`~/Applications/App-ATR`: `src/lib/vistoria-offline.ts`, `public/sw.js`, `src/app/vistoria/`). O desenho é o mesmo, com uma diferença: aqui a fila também guarda **fotos**.

### Como funciona

- **Tela própria**, `/campo/terminalidade` (`src/app/campo/terminalidade/page.tsx` + `src/modules/terminalidade/field-app.tsx`). É uma **casca estática**, sem sessão nem banco na renderização, para o service worker guardá-la e abri-la sem sinal. O proxy deixa `/campo/` e `/campo-sw.js` passarem sem sessão; os dados vêm só das APIs, que continuam exigindo login. A aba 5 tem o atalho "Usar no celular, sem sinal" (abre direto na obra, `?obra=`).
- **Baixar a obra** (única etapa que exige rede): `GET /api/terminalidade/campo?workId=` devolve o pacote — pavimentos, unidades, tipos, responsáveis, pendências com URLs das fotos e as empresas do cadastro de equipes. As miniaturas das pendências abertas (até 300) são baixadas junto, porque as URLs assinadas vencem em 1 h. Sem `workId`, a rota devolve quem é a pessoa e as obras dela, guardadas para a lista abrir sem sinal.
- **Dono do rascunho é o aparelho** (`offline-store.ts`, IndexedDB `obra360-terminalidade`): pacote por obra, fila de saída e as fotos (imagem e miniatura já comprimidas, como Blob). Tudo é gravado na hora.
- **Mesmas regras do servidor, no celular** (`offline-model.ts`): a tela mostra o pacote com a fila aplicada por cima por `planTerminalityCommand`, a mesma função que a rota usa. Sem sinal, o aparelho já recusa o que o servidor recusaria (resolver sem foto da correção, data no futuro, mais de 10 fotos).
- **Envio**: a fila sobe sozinha ao abrir com sinal, ao voltar o sinal (evento `online`) e logo depois de cada lançamento com sinal; há também o botão de enviar no cabeçalho. Sobe na ordem em que foi lançada, uma operação por vez: o que sobe sai da fila na hora. Foto = pedir URL, enviar imagem e miniatura (com uma nova tentativa), registrar `add_photo`. "Já foi registrada" conta como enviado (a resposta anterior se perdeu). Recusa de regra (4xx) para a fila naquela operação e aparece na tela com "Descartar" (descartar uma pendência leva junto as fotos e a resolução dela). Sessão vencida mostra "Entrar de novo" e não perde nada. Depois de enviar, a obra é baixada de novo.
- **Service worker** (`public/campo-sw.js`, escopo `/campo/`): rede primeiro na navegação, com cópia da tela como reserva; cache primeiro em `/_next/static`; APIs nunca do cache. O resto do sistema não passa por ele.
- **O que dá para fazer em campo**: lançar pendência (pavimento, apto, descrição, tipo, data, responsável ATR, terceiro e fotos pela câmera), juntar fotos, resolver com foto da correção e reabrir. Filtros por situação, pavimento, unidade e busca. Cadastros, edição e exclusão de pendência ficam na aba 5.

### Validação (14/10/2026)

- `tests/terminality-offline.test.ts` (6 testes): fila aplicada sobre o pacote, recusa sem sinal pelas regras do servidor, operação que já não vale vai para as recusadas sem derrubar as outras, pendência já enviada não duplica, aplicação pura da mutação e "hoje" de São Paulo.
- **Navegador (Playwright, iPhone 13 simulado), servidor de desenvolvimento**, na "Obra - Teste": baixou a obra; com a rede cortada lançou pendência com foto (selo "no aparelho", "2 alterações guardadas"); "Resolver" travado sem foto da correção; resolveu com foto; com a rede de volta a fila subiu sozinha em ~4 s, e o servidor mostrou a pendência resolvida com as duas fotos.
- **Build de produção, sem rede**: depois de uma visita com sinal (service worker no controle) e com o pacote no aparelho, a página **recarregou sem rede** e abriu a obra, a lista de obras abriu, uma pendência com foto entrou na fila, e a fila continuou lá ao fechar e abrir o app de novo. Em modo de desenvolvimento a página não hidrata sem rede (o servidor de desenvolvimento serve os scripts de outro jeito), então o teste sem rede vale para o build de produção.
- Os registros de teste na "Obra - Teste" foram apagados; o tipo "PINTURA" ficou desativado (tipos não se apagam).

### Pendências

- Não testado num celular de verdade, logado em produção, nem com câmera real (Android e iPhone). No iPhone, o Safari só mantém o IndexedDB de sites usados com frequência; vale adicionar à tela inicial.
- Edição e exclusão de pendência, e cadastros, não estão no modo de campo.
- Sem limpeza automática de fotos órfãs no bucket (a mesma pendência da aba 5).

## Edição em lote na lista (14/10/2026)

O usuário pediu para editar várias pendências de uma vez na tela da aba 5, escolhendo tipo (classificação) e responsáveis.

- **Seleção:** caixa de marcar em cada linha da tabela e em cada cartão do celular, e "marcar todas" no cabeçalho (todas as da lista filtrada). Quem é só consulta não vê as caixas. A seleção vale para o que está na lista: ao filtrar, as marcadas que saem de vista deixam de contar.
- **Barra de marcadas:** "N pendências marcadas · Editar em lote · Desmarcar" acima da lista (fixa no rodapé no celular).
- **Diálogo** (`bulk-edit-dialog.tsx`): Tipo, Responsável ATR e Responsável terceiro, cada um abrindo em "Manter como está". Tipo e responsável ATR listam só os ativos e têm "Sem …" para limpar; o terceiro tem "Trocar por…" (com as empresas do cadastro de equipes e os nomes já usados como sugestão) e "Sem responsável terceiro". Embaixo de cada campo, o valor atual das marcadas ("Hoje: PINTURA", "vazio" ou "valores diferentes"). "Aplicar a N" só libera quando algo muda.
- **Comando** `update_items` (`{ workId, itemIds, typeId?, atrPersonId?, contractor? }`; ausente = manter, `null` = limpar), numa só gravação. Regras: ao menos uma pendência e no máximo 500 (`maxBulkItems`), todas da obra, tipo e responsável ativos e da obra, nome do terceiro até 80 caracteres, e ao menos um campo a mudar. Descrição, local, datas, situação e fotos não mudam.
- **Testes:** 2 novos em `tests/terminality-commands.test.ts`. **Navegador** (servidor de desenvolvimento, "Obra - Teste"): duas pendências marcadas com "marcar todas" receberam tipo, responsável ATR e terceiro de uma vez; depois, uma só teve o terceiro limpo e manteve o resto. Os registros de teste foram apagados (o tipo e o responsável de teste ficaram desativados, porque não se apagam).
- O modo de campo no celular não tem edição em lote; ela fica na aba 5.

## "Como foi corrigido" ao resolver (15/10/2026)

O usuário pediu um campo de texto para quem resolve descrever a correção.

- No diálogo "Resolver pendência" (aba 5) e no "Resolver" do modo de campo, campo opcional **"Como foi corrigido"**, até 1000 caracteres, abaixo da data da correção.
- O texto aparece na pendência resolvida: no diálogo da pendência ("Como foi corrigido"), no cartão do celular ("Correção: …"), na dica do "Resolvido?" da tabela e no modo de campo. Reabrir limpa o texto junto com a data da correção.
- **Banco:** coluna `terminality_items.resolution_note` (migração **0034, aplicada em 15/10/2026**). A coluna só entra na gravação quando há texto a gravar ou a limpar: sem a migração, a terminalidade continua funcionando, e só resolver **com** o texto falha. A tela de migrações avisa (sonda `terminality_items.resolution_note`).
- Testes: regra (texto opcional, limite, reabrir limpa) em `tests/terminality-commands.test.ts`; gravação segura em `tests/terminality-repository-note.test.ts`. Na tela, o campo foi conferido no diálogo de uma pendência aberta da Blentt, sem resolver.
- No caminho: `scripts/validate-bootstrap-sql.mjs` esperava 38 tabelas e falhava desde a 0032 (`access_requests`); passou a esperar 39, e o bootstrap foi regerado com 34 migrações.
