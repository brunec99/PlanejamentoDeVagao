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

- **Aplicar a 0028 no `takt-hub`:** colar a migração no SQL Editor **antes** de publicar a aba. Sem ela, a aba mostra o aviso de migração ausente, e as demais seguem normais.
- **Fotos órfãs:** se o navegador fechar entre o envio e o `add_photo`, o arquivo fica sem pendência. Ainda não há limpeza automática.
- **Edição simultânea:** não há trava de versão. Se duas pessoas editarem a mesma pendência ao mesmo tempo, vale a última gravação.
- **Importação:** a lista atual do Sheets ainda não foi importada. O primeiro passo é cadastrar os locais.
