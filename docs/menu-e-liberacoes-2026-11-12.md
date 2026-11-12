# Menu numerado em grupos e três módulos novos nas liberações (12/11/2026)

**Pedido do usuário:** "vamos ajustar esses menus": 1 Prazo (1.1 longo, 1.2 médio, 1.3 curto, 1.4 Quadro de Restrições), 2 Controles de obra (2.1 terminalidade, 2.2 histograma, 2.3 produtividade), 3 SST (3.1 vistoria de segurança, 3.2 checklist de equipamentos); e "confira qual destes itens não está em configuração nas liberações".

**Situação:** **a migração `0049_restrictions_sst_access.sql` foi aplicada no `takt-hub` em 12/11/2026**, a pedido do usuário, numa transação (pelo pooler), com a contagem lida antes e depois: dos 30 perfis não-admin, 0 tinham os módulos novos e 19 tinham Vagões; depois, 30 com `seguranca`, 30 com `checklist` e 19 com `restricoes`; os 3 admins não foram tocados; o total de módulos foi de 248 para 327 (30 + 30 + 19). **O código foi enviado ao `main` no mesmo dia, junto com este documento**, depois da migração (a ordem importa: o código novo sem a 0049 tiraria as três telas de todos os não-admins). Não rodar a 0049 de novo: ela devolveria os módulos a quem o admin já tiver revogado.

## Decisões (respostas do usuário em 12/11/2026)

1. **"1.4 Quadro de Restrições" é o Kanban** que nasceu em 10/11 como "Lista de pendência", dentro da antiga aba 2. Só o nome do quadro mudou; os cards continuam "pendências".
2. **O Planejamento de vagão sai do menu** e abre pelo botão "Planejamento de vagão" no cabeçalho do longo prazo (1.1), para quem tem o módulo Vagões. Não tem número próprio: o cabeçalho dele mostra "Aba 1.1" e o item aceso no menu é o longo prazo.
3. **A numeração nova vale em tudo o que o usuário vê:** menu, faixa do celular, cabeçalho das telas ("Aba 1.3"), dashboards, tour e manual da Claudia. Comentários de código e documentos anteriores a esta data seguem com os números antigos.
4. **Quadro de Restrições, Vistoria de segurança e Checklist de equipamentos passam a ser liberados por pessoa.** Eram os três itens da lista sem coluna em Configurações → Usuários → Módulos: os dois de SST eram abertos a todos para consulta e o quadro ia junto com "Vagões".

## Correspondência

| Antes (até 11/11/2026) | Agora | Seção na URL |
| --- | --- | --- |
| aba 0, Dashboard da obra | 0 (igual) | `dashboard` |
| aba 1, longo prazo | 1.1 | `longo-prazo` |
| aba 2, Planejamento de vagão | sem número, abre pela 1.1 | `vagoes` |
| aba 2, visão Lista de pendência | 1.4, Quadro de Restrições | `restricoes` (nova) |
| aba 3, médio prazo | 1.2 | `medio-prazo` |
| aba 4, curto prazo | 1.3 | `curto-prazo` |
| aba 5, terminalidade | 2.1 | `terminalidade` |
| aba 7, histograma | 2.2 | `histograma` |
| aba 8, produtividade | 2.3 | `produtividade` |
| aba 6, segurança do trabalho | 3.1 | `seguranca` |
| aba 9, checklist de equipamentos | 3.2 | `checklist` |

## O que mudou no código

- **Menu** (`src/modules/layout/work-nav.tsx`): `WORK_TABS[].number` virou o código em texto ("1.3"); `WORK_GROUPS` ganhou o número do grupo ("1 · Prazo"); o vagão tem `menu: false`. `tab-header.tsx` e `dashboard/model.ts` usam o mesmo código.
- **Quadro de Restrições:** página nova `/obras/{obraId}/restricoes`. O endereço antigo `vagoes?visao=pendencias` (com `&card=`, que está nos e-mails já enviados) é desviado no proxy, antes da conferência do módulo `vagoes`, e de novo na página. `pendingPath` e o link do e-mail (`takt-outbox.ts`) apontam para o endereço novo. O seletor "Vagões | Lista de pendência" deixou de existir.
- **Liberações** (`src/application/module-access.ts`): `restricoes`, `seguranca` e `checklist` entraram em `RESTRICTED_SECTIONS` e viraram colunas da grade; `/api/seguranca` e `/api/checklist` entraram nas APIs restritas; `/api/pendencias` passou de `vagoes` para `restricoes` (os botões "Criar pendência" do médio e do longo prazo também). Abertos a todos ficam só `dashboard` e `configuracoes`. O link do operador do checklist (`/checklist/<token>`, `/api/publico/`) não depende de módulo.
- **Efeitos:** quem não tem o módulo não vê o item, é levado ao Dashboard da obra e recebe 403 nas APIs; o quadro de segurança do Dashboard geral e o modo de campo da segurança seguem a mesma regra. **O TST precisa do módulo:** marcar alguém como TST não libera a tela sozinho; o admin libera "Segurança do trabalho" e "Checklist de equipamentos" na grade.
- **Migração 0049** (só dados, como a 0042): todo não-admin ganha `seguranca` e `checklist`; quem tinha `vagoes` ganha `restricoes`. Rodar uma vez.
- **Tour:** arquivo novo `tour/pages/restricoes.ts`; passo do botão do vagão no longo prazo. **Manual da Claudia:** renumerado, com a tabela de correspondência em `geral.ts` e as palavras-chave antigas mantidas; a tela `restricoes` entrou no índice (teto do índice de 14.500 para 15.000 caracteres).

## Validação

- Tipos, lint (sem erro), Prettier, 1.362 testes (regras novas em `tests/module-access.test.ts`) e validação das migrações.
- Navegador (`next dev` local com APIs simuladas, perfil admin): menu com os três grupos numerados, cabeçalho "Aba 3.2", vagão acendendo o 1.1, botão "Planejamento de vagão" no longo prazo, endereço antigo do quadro redirecionando com o card, faixa do celular com os códigos.
- **Não validado:** perfil não-admin em produção depois da 0049 (quem perde ou mantém cada tela) e um e-mail real com o link novo.

## Pendente

- Revogar na grade (Configurações → Usuários → Módulos) quem não deve ter segurança, checklist ou o quadro: hoje todos os não-admins têm os dois de SST.
- Conferir, com um usuário não-admin real, o menu e o desvio para o Dashboard de quem não tem o módulo.
- Dúvidas de texto que ficaram como estavam: o cartão "Restrições vencidas" dos dashboards fala das restrições impeditivas dos vagões (não do Quadro de Restrições) e pode confundir; o botão "Criar pendência" e os cards seguem chamados de "pendência".
