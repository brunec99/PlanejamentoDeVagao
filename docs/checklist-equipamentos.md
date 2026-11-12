# Checklist de equipamentos (aba 9)

Entregue em 11/11/2026, a pedido do usuário ("vamos desenvolver um módulo de checklist diário, semanal e
mensal de equipamentos"; "checklist permita que o tst edite"). Fica no grupo **SST** do menu, abaixo da
vistoria de segurança.

**Situação:** código, testes e migração prontos e validados localmente (testes, tipos, lint, validação das
migrações e build). **A migração 0047 ainda não foi aplicada no Supabase**, a tela não foi exercitada num
navegador e nenhuma gravação foi feita num banco real. Sem a 0047 a aba responde "indisponível" e as
demais seguem normais. **Nenhum modelo vem cadastrado:** as fichas da empresa não foram fornecidas, então
os TSTs criam os modelos na própria tela.

## As três peças

- **Modelo** (`checklist_models`): a ficha. Nome, tipo de equipamento, periodicidade (`daily`, `weekly`,
  `monthly`) e a lista ordenada de itens (`items`, JSON `[{ id, text }]`, até 60). Lista única para todas
  as obras, como os tipos de apontamento da aba 6.
- **Equipamento** (`checklist_equipment`): o que existe na obra ("Betoneira 01"), de um tipo. Recebe todos
  os modelos ativos do mesmo tipo; a comparação ignora acento e maiúsculas (`checklistKey`).
- **Inspeção** (`checklist_runs`): um modelo preenchido num equipamento num dia. `answers` guarda, por
  item, o texto como estava no dia, a resposta (`c`, `nc`, `na`) e a observação.

## O que a tela faz

`/obras/{obraId}/checklist`.

- **Cartões:** pendentes hoje, na semana e no mês, e checklists do período corrente com não conformidade.
- **Equipamentos da obra:** cada equipamento com os checklists do tipo dele — âmbar pendente no período,
  verde feito, vermelho feito com não conformidade. Clicar abre o formulário de inspeção. Abaixo, o
  cadastro de equipamentos; renomear, desativar e reativar.
- **Inspeção:** C / NC / N/A por item, descrição obrigatória no NC, "Marcar os demais como conforme",
  data (hoje por padrão) e observação geral.
- **Últimas inspeções:** as 30 mais recentes dos últimos 120 dias, com quem registrou, as respostas,
  edição e exclusão.
- **Modelos de checklist:** criar, editar (itens com ordem, colar vários de uma vez), desativar e reativar.

## Regras (`checklist-commands.ts`)

- Editam (modelos, equipamentos e inspeções) o tipo TST (`profiles.tst`, migração 0040) e os admins
  (`canWriteChecklist`). Todos que têm a obra consultam: a seção `checklist` é aberta, como `seguranca`.
- Período: o dia; a semana de segunda a domingo; o mês (`periodKey`).
- Um modelo só é preenchido uma vez por equipamento por dia (regra e unicidade no banco).
- Sem data futura. Todos os itens respondidos. NC exige descrição.
- A edição da inspeção usa os itens que ela guardou; editar o modelo não reescreve o histórico. Na edição
  do modelo, o item que permanece mantém o id.
- Nome de modelo único (lista toda) e nome de equipamento único na obra, sem acento nem maiúsculas.
- Modelo e equipamento não são excluídos, são desativados. Só a inspeção é excluída.
- A API carrega as inspeções dos últimos 120 dias (`CHECKLIST_WINDOW_DAYS`); edição ou exclusão de uma
  mais antiga busca a linha à parte.

## Arquivos

- Domínio: `src/domain/equipment-checklist.ts`
- Regras: `src/application/use-cases/checklist-commands.ts`
- Banco: `supabase/migrations/0047_equipment_checklist.sql`,
  `src/infrastructure/repositories/supabase/checklist-repository.ts`
- API: `src/app/api/checklist/route.ts` e `commands/route.ts`
- Tela: `src/modules/checklist/`
- Manual e tour: `src/modules/agente/manual/checklist.ts`, `src/modules/tour/pages/checklist.ts`
- Testes: `tests/checklist.test.ts` (10) e a semente em `tests/delete-work.test.ts`

## Pendente

- Aplicar a migração 0047 e marcar os TSTs (mesma marcação da aba 6).
- Cadastrar os modelos com as fichas que a equipe de SST usa hoje.
- Não construído: fotos na inspeção, modo de campo sem internet, PDF, abrir apontamento na aba 6 a partir
  de uma não conformidade, checklist no dashboard e na assistente (relatórios), histórico além de 120 dias
  na tela.
