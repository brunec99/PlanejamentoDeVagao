# Histograma de mão de obra (aba 7)

Entregue em 11/11/2026, a pedido do usuário, junto com o menu em grupos. Substitui a planilha
"ATR Histograma - Todas as obras" (aba Geral: Obra, Data, Empresa, Função, Número de funcionários,
Observação), que as obras preenchiam uma linha por empresa × função × dia.

**Situação:** código, testes e migração prontos e validados localmente. **A migração 0045 ainda não foi
aplicada no Supabase e o histórico da planilha ainda não foi importado.** Sem a 0045 a aba responde
"indisponível" e as demais seguem normais.

**Atualização de 11/11/2026 (noite):** a migração foi aplicada no `takt-hub` pela CLI do Supabase, a pedido do usuário, e conferida no catálogo (tabela, RLS ligada, grant para `service_role`, sem acesso de `anon`). O histórico da planilha foi importado: 28.789 linhas (BLT 10.432, ESZ 6.954, MZN 6.724, ATM 2.948, BRZ 924, TAU 807), 50.010 homens-dia. Ficaram de fora LMM (465), MYS (2.977) e AMA (190), que não existem como obra no sistema. Desde então o Histograma do SGI (App-ATR) lê `works` e `headcount_entries` deste banco, pela API REST, no lugar da planilha. A tela ainda não foi aberta logada em produção.

## O que a tela faz

`/obras/{obraId}/histograma`, grupo **Controles de obra** do menu.

- **Cartões:** efetivo no último dia lançado (com aviso quando há mais de um dia útil sem lançar), média
  por dia útil, pico do período e parcela de empreiteiros nos homens-dia.
- **Folha do dia:** as empresas do dia, cada uma com funções e quantidades. É onde se lança: empresa,
  função, quantidade e observação. A quantidade se edita na própria linha; a lixeira exclui. Num dia vazio,
  "Repetir o último dia" copia as equipes do último dia lançado antes dele (sem as observações).
- **Histograma:** barras empilhadas por dia, semana ou mês; empilha por próprio × empreiteiro, empresa ou
  função; período de 30 dias, 90 dias, 6 meses, 12 meses ou tudo.
- **Por empresa** e **Por função:** homens-dia, média da equipe nos dias em que esteve na obra e dias com
  presença.

## Decisões

1. **Uma linha por obra, dia, empresa e função.** A planilha deixava a mesma linha entrar duas vezes
   (735 casos em 33 mil linhas). Aqui o banco tem unicidade e o comando recusa, pedindo para editar a
   linha. Na importação, as repetidas entram somadas, como na tabela dinâmica da planilha.
2. **A grafia que a obra já usa vence.** "ATR " é gravado como "ATR" e "pedreiro" como "Pedreiro"; nome
   que não existe na obra é aceito, com aviso na tela antes de lançar. Não há cadastro de empresas e
   funções: a lista sai do que já foi lançado na obra.
3. **Próprio é ATR e Takt** (`isOwnCompany`); o resto é empreiteiro.
4. **Semana e mês mostram a média por dia útil lançado.** Sábado e domingo têm equipe reduzida e ficam
   fora da média; se o período só tiver fim de semana, valem os dias que houver. No grão "dia" o valor é a
   soma do dia.
5. **Acesso:** módulo liberado por pessoa (`histograma` em `RESTRICTED_SECTIONS`). Quem tem o módulo e a
   obra lança, edita e exclui; o papel consulta só visualiza (`canWriteHeadcount`).
6. **Fora do snapshot do planejamento**, como a terminalidade e a segurança: rotas próprias em
   `/api/histograma`. Uma obra de dois anos passa de dez mil linhas, então o POST devolve só o que mudou
   e a tela aplica a mesma mutação no que já tem (`applyHeadcountMutation`), em vez de reler a obra.
7. **Sem data futura, sem quantidade zero, no máximo 500 pessoas por linha.**

## Onde está

| Parte | Arquivo |
| --- | --- |
| Tipos, grafia, datas e as contas da tela | `src/domain/headcount.ts` |
| Regras dos comandos (`save_entry`, `delete_entry`, `copy_day`) | `src/application/use-cases/headcount-commands.ts` |
| Leitura e gravação | `src/infrastructure/repositories/supabase/headcount-repository.ts` |
| Rotas | `src/app/api/histograma/route.ts` e `commands/route.ts` |
| Tela e cliente | `src/modules/histograma/headcount-overview.tsx` e `api.ts` |
| Importação da planilha | `src/application/use-cases/import-headcount.ts` e `scripts/import-histograma.ts` |
| Banco | `supabase/migrations/0045_headcount.sql` (tabela `headcount_entries`) |
| Manual da assistente e tour | `src/modules/agente/manual/histograma.ts`, `src/modules/tour/pages/histograma.ts` |

## Importar o histórico

1. Aplicar a migração 0045 no Supabase.
2. Exportar a aba Geral da planilha em CSV.
3. Simular: `node --import tsx scripts/import-histograma.ts geral.csv --actor-email <admin> --env-file <arquivo>`.
4. Conferir o relatório e rodar de novo com `--apply`.

A obra é achada pelo código (BLT, MZN…) ou pelo nome; `--obras '{"MYS":"<id>"}'` aponta as que não baterem.
Rodar de novo não duplica e não sobrescreve linha já gravada nem dia, empresa e função lançados na tela.

Simulação de 11/11/2026 com a planilha do dia (sem banco, obras BLT, MZN, ESZ, ATM, BRZ e TAU):
33.392 linhas lidas; ficam de fora 6 sem obra, 11 com data impossível ("22/0/2026", BRZ), 2 sem
quantidade válida, 268 com zero e 3.632 de obras que o sistema não tem (LMM, MYS, AMA); 684 repetidas
somadas. Entram 28.789 linhas: BLT 10.432, ESZ 6.954, MZN 6.724, ATM 2.948, BRZ 924 e TAU 807.

## Validações feitas

- `tests/headcount.test.ts` (17 testes): contas da tela, comandos, permissão e importação.
- `npm test` inteiro (1.344 com a aba 8), `tsc`, `eslint` sem erros, `next build`.
- `npm run validate:migrations` com a 0045, e a exclusão de obra levando o efetivo junto
  (`tests/delete-work.test.ts`).
- **Não validado:** a tela no navegador e a gravação num Supabase real.

## Pendências

- Aplicar a 0045 e importar o histórico.
- Liberar o módulo para quem lança em cada obra (Configurações → Usuários).
- O histograma ainda não entra no dashboard da obra nem no dashboard geral.
- Sem PDF e sem modo de campo offline.
