# Controle de produtividade (aba 8)

Entregue em 11/11/2026, a pedido do usuário. Substitui a planilha "ATR - Controle da produção" (aba
"Controle de produção": Obra, Serviço, Empreiteiro, Data, Qtd profissionais, Qtd ajudantes, Produção,
Unid., Obs.), que as obras preenchiam uma linha por serviço × empreiteiro × dia.

**Situação:** código, testes e migração prontos e validados localmente. **A migração 0046 ainda não foi
aplicada no Supabase e o histórico da planilha ainda não foi importado.** Sem a 0046 a aba responde
"indisponível" e as demais seguem normais.

**Atualização de 11/11/2026 (noite):** a migração foi aplicada no `takt-hub` pela CLI do Supabase, a pedido do usuário, e conferida no catálogo (tabela, RLS ligada, grant para `service_role`, sem acesso de `anon`). O histórico da planilha foi importado: 6.593 linhas (MZN 2.540, ESZ 2.066, ATM 886, BLT 862, TAU 205, BRZ 34), 4.052 sem produção medida. Ficaram de fora LUMMI (223) e MY SUNSET (916). A tela ainda não foi aberta logada em produção.

## O que a tela faz

`/obras/{obraId}/produtividade`, grupo **Controles de obra** do menu.

- **Cartões:** último dia lançado (com aviso quando há mais de um dia útil sem lançar), lançamentos e
  homens-dia do período, quantos estão sem produção medida e quantos serviços e empreiteiros.
- **Folha do dia:** os lançamentos do dia. Formulário com serviço, empreiteiro, profissionais, ajudantes,
  produção, unidade e observação. A produção se digita direto na linha; o lápis leva a linha ao formulário
  e a lixeira exclui. Num dia vazio, "Repetir o último dia" copia as equipes, sem produção nem observação.
- **Produtividade por serviço:** produção total, homens-dia, produção por homem-dia, faixa (pior e melhor
  linha) e medições do período (30 dias, 90 dias, 6 meses, 12 meses ou tudo). Clicar no serviço abre os
  empreiteiros.

## Decisões

1. **Produção em branco é "a medir", não zero.** Na planilha, vazio e "0,00" queriam dizer a mesma coisa e
   são mais da metade das linhas. Aqui `quantity` é nula até a medição; zero é recusado.
2. **Produção por homem-dia ponderada.** No quadro por serviço é produção total ÷ homens-dia do período,
   só com as linhas medidas, para o dia de equipe grande pesar mais que o de uma pessoa. É o índice que a
   planilha chamava de "PRODUÇÃO/homem*dia" (não é a RUP em Hh por unidade).
3. **Sete unidades:** m², m³, m, kg, un, vb e t. As 34 grafias da planilha caem nelas (`normalizeUnit`).
   Produção preenchida exige unidade; serviço lançado em duas unidades aparece em duas linhas.
4. **A grafia que a obra já usa vence** para serviço e empreiteiro; nome novo é aceito, com aviso. Não há
   cadastro: as sugestões e a unidade usual do serviço saem do que já foi lançado na obra.
5. **Sem unicidade por dia.** O mesmo serviço e empreiteiro pode ter duas frentes no dia (trechos na
   observação), diferente do histograma.
6. **Acesso:** módulo liberado por pessoa (`produtividade` em `RESTRICTED_SECTIONS`). Quem tem o módulo e
   a obra lança, edita e exclui; o papel consulta só visualiza (`canWriteProduction`).
7. **Fora do snapshot do planejamento**, com rotas próprias em `/api/produtividade`; o POST devolve só o
   que mudou e a tela aplica a mesma mutação (`applyProductionMutation`).

## Onde está

| Parte | Arquivo |
| --- | --- |
| Tipos, unidades e as contas da tela | `src/domain/production.ts` |
| Regras dos comandos (`save_entry`, `delete_entry`, `copy_day`) | `src/application/use-cases/production-commands.ts` |
| Leitura e gravação | `src/infrastructure/repositories/supabase/production-repository.ts` |
| Rotas | `src/app/api/produtividade/route.ts` e `commands/route.ts` |
| Tela e cliente | `src/modules/produtividade/production-overview.tsx` e `api.ts` |
| Importação da planilha | `src/application/use-cases/import-production.ts` e `scripts/import-produtividade.ts` |
| Banco | `supabase/migrations/0046_production.sql` (tabela `production_entries`) |
| Manual da assistente e tour | `src/modules/agente/manual/produtividade.ts`, `src/modules/tour/pages/produtividade.ts` |

Grafia, datas e a busca da obra pelo código são as do histograma (`src/domain/headcount.ts`,
`import-headcount.ts`).

## Importar o histórico

1. Aplicar a migração 0046 no Supabase.
2. Exportar a aba "Controle de produção" em CSV.
3. Simular: `node --import tsx scripts/import-produtividade.ts producao.csv --actor-email <admin> --env-file <arquivo>`.
4. Conferir o relatório e rodar de novo com `--apply`.

O id de cada linha importada é a linha da planilha: rodar de novo não duplica nem sobrescreve, **desde que
ninguém insira ou reordene linhas no meio da planilha entre duas importações**. O ideal é importar uma vez,
no dia em que a obra passar a lançar no sistema.

Simulação de 11/11/2026 com a planilha do dia (sem banco, obras BLT, MZN, ESZ, ATM, BRZ e TAU): 7.773
linhas lidas; ficam de fora 2 sem data válida, 11 sem serviço, 28 sem equipe e 1.139 de obras que o
sistema não tem (LUMMI e MY SUNSET). Entram 6.593 linhas — MZN 2.540, ESZ 2.066, ATM 886, BLT 862, TAU 205
e BRZ 34 —, das quais 4.052 sem produção ("a medir"); 9 delas tinham produção com unidade irreconhecível,
e o número foi para a observação.

## Validações feitas

- `tests/production.test.ts` (14 testes): contas da tela, comandos, permissão e importação.
- `npm test` inteiro (1.344), `tsc`, `eslint` sem erros, `next build`.
- `npm run validate:migrations` com a 0046, e a exclusão de obra levando os lançamentos junto.
- **Não validado:** a tela no navegador e a gravação num Supabase real.

## Pendências

- Aplicar a 0046 e importar o histórico.
- Liberar o módulo para quem lança em cada obra.
- Sem lista geral com filtros nem exportação em CSV; sem PDF. Desde 12/11/2026 entra na aba 0 e no Dashboard geral (publicado em 12/11/2026); ver `docs/dashboard.md`.
- Meta de produtividade por serviço (para comparar com o realizado) não existe ainda.
