# Resumo semanal por e-mail (12/11/2026)

Continuidade entre os modelos de IA que trabalham no repositório. Descreve o e-mail de sábado, as regras do
modelo aprovado, os arquivos nos dois repositórios, o que foi validado e o que falta para ele sair de verdade.

**Situação em 12/11/2026 (noite):** código enviado ao `main` nos dois repositórios. As duas migrações foram
**aplicadas no `takt-hub` em 12/11/2026**, a pedido do usuário, cada uma numa transação, com o estado lido antes
e depois: `20261112100000_obra360_resumo_semanal_email.sql` (Takt Hub: o modelo nos dois CHECKs da fila e fora
da central de notificações) e `0050_weekly_summary.sql` (coluna `profiles.weekly_summary`). A chave foi ligada
só para o usuário que pediu o resumo (1 perfil). **Falta:** publicar de novo a Edge Function `email-dispatch`
do Takt Hub (sem isso a linha do e-mail falha com `modelo_desconhecido`), definir `PUBLIC_SITE_URL` no servidor
da ATR (sem ela o e-mail sai sem o botão) e um e-mail real de ponta a ponta.

**Atualização de 12/11/2026 (mais tarde):** a Edge Function `email-dispatch` foi **publicada** no `takt-hub`
(`npx supabase functions deploy email-dispatch --no-verify-jwt`), a pedido do usuário. O endereço público que
ele informou (`https://planejamento-teste.aironlab.com.br`, atrás do Cloudflare Access) foi gravado na variável
`SITE_URL_PADRAO` do GitHub: a imagem Docker a recebe como padrão **só para os links de e-mail**
(`emailSiteOrigin`, em `src/infrastructure/public-origin.ts`); `PUBLIC_SITE_URL`, se o servidor a definir, tem
prioridade, e o retorno do login não usa o padrão. Falta só um e-mail real de ponta a ponta. Onde o texto abaixo disser "não
aplicada", vale esta atualização.

## O pedido

Em 12/11/2026 o usuário pediu "um envio semanal para mim no sábado às 8h" com um overview da semana e quais
obras cumpriram o planejamento e os processos de histograma e de produtividade. O modelo "Dashboards completos
e resumo semanal" (https://claude.ai/artifact/PRST8sbKDvA8usyAEkjMJN) foi aprovado no mesmo dia, sem mudanças;
as regras 12 a 20 dele valem como especificação.

## Regras (modelo aprovado)

12. **Sábado, 08:00 de Brasília, cobrindo a semana que acabou (segunda a sexta).** Obra com alguma linha do
    curto prazo sem Status até a hora do envio sai "Não apurou" e conta como não cumprido.
13. **Planejamento:** semana apurada com PPC de 80% ou mais = "Cumpriu"; 70% a 79% = "Parcial"; abaixo = "Não
    cumpriu". PPC = Sim ÷ linhas da semana; o consolidado soma as linhas das obras apuradas (Σ/Σ).
14. **Histograma e produtividade:** "Cumpriu" = lançamento em todos os dias úteis da semana (feriado nacional
    não conta). Faltou dia = "Não cumpriu", com os dias ("faltou qua e sex"); nenhum dia = "Não lançou". A
    parcela de produção medida é só informação.
15. **Todas as obras.** Obra que nunca lançou num módulo sai "Não usa" e fica fora do placar dele.
16. **Conteúdo:** assunto "Resumo da semana DD/MM a DD/MM: N de M obras cumpriram tudo", frase de abertura,
    placar, tabela por obra, até 5 pontos de atenção e o botão do Dashboard geral.
17. **Sem IA:** o texto sai dos números.
18. **Destinatários:** admins com a chave "Resumo semanal" ligada (Configurações → Usuários).
19. **"Enviar o resumo agora para mim"** no Dashboard geral, só admin.
20. **Envio pela fila do Takt Hub**, com o relógio dentro do servidor do Obra 360.

## Decisões onde o modelo era omisso

- **Obra sem nenhuma linha na semana** sai "Sem programação" (não cumprido).
- **Entram as obras ativas** (`works.active`), como no ranking do fechamento; obra encerrada não é cobrada.
- **O corte de 80% e 70% é sobre o PPC arredondado**, o número que o e-mail e o dashboard mostram (79,6% aparece
  como 80% e cumpre).
- **"Cumpriram tudo"** = cumpriu o planejamento e todo processo que a obra usa; módulo "Não usa" ou
  "Indisponível" não reprova. O denominador é o total de obras.
- **Placar do histograma e da produtividade:** o denominador são as obras que usam o módulo.
- **Ordem da tabela:** quem cumpriu os três, depois por número de itens cumpridos, depois pelo nome.
- **Pontos de atenção, nesta ordem:** (1) o pior PPC apurado abaixo de 80%, com a causa principal
  (`causePareto`); (2) obras sem apuração e sem programação; (3) cards vencidos do Quadro de Restrições e a obra
  com mais; (4) apontamentos de segurança abertos há mais de 7 dias; (5) checklists de equipamento vencidos.
- **Semana do envio avulso:** no sábado e no domingo, a semana que acabou de terminar; de segunda a sexta, a
  anterior. Um pedido por minuto por pessoa (por processo do servidor).
- **O envio avulso não depende da chave nem da migração 0050**: vai para quem clicou.
- **Falha na leitura dos blocos** (histograma, produtividade etc.) não impede o e-mail: os itens saem
  "Indisponível" e ficam fora do placar.
- **Link do botão:** `<PUBLIC_SITE_URL>/dashboard?escala=semana&periodo=<segunda>`, só com endereço https; sem a
  variável, o e-mail sai sem botão.
- **Sem destinatário ou sem a 0050**, o agendador não marca a semana como enviada: se alguém ligar a chave
  ainda no sábado, o ciclo seguinte (até 5 minutos) envia.
- **Central de notificações do Takt Hub (o sino):** o modelo novo fica de fora, como `obra360.pendencia`; a
  migração do Takt Hub recria `takt_private.my_notification_rows` com ele na lista.

## Como funciona

1. `src/instrumentation.ts` roda quando o servidor sobe e chama `startWeeklySummaryScheduler`
   (`src/infrastructure/weekly-summary-scheduler.ts`). O temporizador só existe com `NODE_ENV=production`, no
   runtime Node, fora do build (chave de serviço `apenas-para-o-build`) e sem `WEEKLY_SUMMARY_DISABLED=1`.
2. A cada 5 minutos (o primeiro ciclo 30 s depois de subir), `weeklyTick` pergunta a `weeklySendDue` se é sábado
   entre 08:00 e 23:59 em America/Sao_Paulo. Se for e a semana ainda não foi enviada por este processo, chama
   `sendWeeklySummary`.
3. `sendWeeklySummary` (`src/infrastructure/email/weekly-summary.ts`) lê os admins com
   `profiles.weekly_summary`, as obras ativas, as linhas de `weekly_commitments` da semana e os blocos de
   `readDashboardExtras` (semana de segunda a sábado, acesso total, com segurança), monta o resumo com
   `buildWeeklySummary` (`src/domain/weekly-summary.ts`) e enfileira um e-mail por pessoa em
   `takt.email_enqueue`, modelo `obra360.resumo_semanal`.
4. A Edge Function `email-dispatch` do Takt Hub envia (a cada 5 minutos), desenhando o corpo com
   `renderObraResumoSemanal`.

Não duplica: a chave de idempotência do sábado é `obra360.resumo_semanal:<segunda>:<userId>`, e a fila devolve a
linha que já existe. Servidor fora do ar às 08:00 envia ao voltar, ainda no sábado; se passar o sábado inteiro
fora, aquela semana não sai (o botão do Dashboard geral cobre). Falha vai para o log (`route:
"resumo-semanal"`) e a tentativa se repete no ciclo seguinte.

## Payload do modelo `obra360.resumo_semanal`

Tipo `WeeklySummaryPayload` aqui e `PayloadObraResumoSemanal` no Takt Hub (mudou num, muda no outro):

```jsonc
{
  "semana": "2026-11-09",            // segunda-feira
  "primeiroNome": "Bruno",           // opcional
  "avulso": true,                    // só no envio pelo botão
  "frase": "Na semana de 09/11 a 13/11, 3 de 6 obras cumpriram o planejamento…",
  "placar": { "plan": [3, 6], "hist": [4, 6], "prod": [4, 6], "tudo": [2, 6] },  // [cumpriram, de quantas]
  "obras": [
    { "n": "Horizonte", "p": ["c", "PPC 86% · 25 de 29"], "h": ["c", "5 de 5 dias · efetivo 84"], "r": ["c", "5 de 5 dias · 62% medido"] }
  ],
  "atencao": ["Aurora: PPC de 58%; principal causa, Chuva (8 de 13 não cumpridos)."],
  "link": "https://…/dashboard?escala=semana&periodo=2026-11-09"   // opcional, só https
}
```

Situações (primeira posição de `p`, `h`, `r`): `c` Cumpriu · `p` Parcial · `n` Não cumpriu · `a` Não apurou ·
`s` Sem programação · `z` Não lançou · `u` Não usa · `i` Indisponível.

A fila aceita payload de até 4096 bytes. `weeklyPayload` mantém o JSON em até 3800 bytes: tira pontos de atenção
do último para o primeiro, depois encurta os nomes das obras e, por fim, os detalhes. O teste cobre 12 obras com
nomes de mais de 70 caracteres.

## Onde está

| Parte | Arquivo |
| --- | --- |
| Regras, placar, pontos de atenção, frase, assunto, payload e horário (puro) | `src/domain/weekly-summary.ts` |
| Leitura da semana, destinatários, chave do admin e enfileiramento | `src/infrastructure/email/weekly-summary.ts` |
| Temporizador (`weeklySchedulerEnabled`, `weeklyTick`, `startWeeklySummaryScheduler`) | `src/infrastructure/weekly-summary-scheduler.ts` |
| Início do temporizador quando o servidor sobe | `src/instrumentation.ts` |
| `POST /api/dashboard/resumo-semanal`: sem corpo envia agora para quem pediu; `{ userId, enabled }` grava a chave | `src/app/api/dashboard/resumo-semanal/route.ts` |
| Botão "Enviar o resumo agora para mim" (`WeeklySummaryButton`, `data-tour="geral-resumo-semanal"`) | `src/modules/dashboard/weekly/send-button.tsx` |
| Chave "Resumo semanal" nas linhas de admin (`WeeklySummaryToggle`, `data-tour="config-user-weekly"`) | `src/modules/configuracoes/users-table.tsx` |
| `User.weeklySummary`, leitura de `profiles.weekly_summary` | `src/domain/entities.ts`, `src/infrastructure/repositories/supabase/mappers.ts` |
| Coluna `profiles.weekly_summary` | `supabase/migrations/0050_weekly_summary.sql` |
| Sondagem da 0050 em `/api/health` | `src/infrastructure/repositories/supabase/migrations.ts` |
| Manual da Claudia (`resumo-semanal-email`, tela `dashboard-geral`) | `src/modules/agente/manual/resumo-semanal.ts`, registrado em `manual/index.ts` |
| Testes | `tests/weekly-summary.test.ts` |
| Takt Hub: catálogo da fila e sino | `supabase/migrations/20261112100000_obra360_resumo_semanal_email.sql` |
| Takt Hub: modelo do e-mail (`PayloadObraResumoSemanal`, `renderObraResumoSemanal`, assunto) | `supabase/functions/_shared/email-templates.ts` |
| Takt Hub: testes | `tests/unit/obra360-resumo-semanal.test.ts` (e a lista de exceções em `tests/unit/notificacoes.test.ts`) |

A chave fica fora do `commit_planning`, como a marca de TST (0040): a coluna é gravada só pela rota, e a lista de
usuários recarrega depois. A `0050` não mexe em função nem em snapshot.

## Passos para subir, nesta ordem

1. **Takt Hub:** aplicar `20261112100000_obra360_resumo_semanal_email.sql` no `takt-hub`.
2. **Takt Hub:** publicar a Edge Function: `npx supabase functions deploy email-dispatch --no-verify-jwt` (pede o
   login do dono da conta na CLI). Sem isso a linha da fila falha com `modelo_desconhecido`.
3. **Obra 360:** aplicar `0050_weekly_summary.sql` no `takt-hub`.
4. **Servidor da ATR:** definir `PUBLIC_SITE_URL` com o endereço público do Obra 360 (https). Sem ela o e-mail sai
   sem o botão. A mesma variável já corrige o link do e-mail do Quadro de Restrições.
5. **Obra 360:** publicar o código (push no `main`; o servidor busca a imagem nova).
6. Em Configurações → Usuários, marcar "Resumo semanal" na linha do usuário (ou
   `update profiles set weekly_summary = true where id = '<id>'`).
7. Testar pelo botão "Enviar o resumo agora para mim" no Dashboard geral, que já funciona depois dos passos 1,
   2 e 5.

Os passos 1 e 2 podem vir antes ou depois do 5: sem eles, o envio falha e fica no log, sem derrubar nada. A
ordem entre 1 e 2 importa pouco, mas os dois precisam estar feitos antes do primeiro envio.

## Validações feitas

- `tests/weekly-summary.test.ts` (11 testes): faixas do planejamento, cobertura de dias úteis, as seis obras do
  modelo (placar, ordem, frase, assunto, pontos de atenção), "Não usa" e "Indisponível", payload e teto de
  bytes com 12 obras, chaves de idempotência, horário de Brasília, semana do envio avulso, liga/desliga do
  agendador e o ciclo (uma vez por semana, repete após falha, não marca sem destinatário).
- `tests/agent-manual.test.ts` (o teto do índice subiu de 15000 para 15500), `tests/infrastructure.test.ts`,
  `tests/tour-targets.test.ts` e `tests/planning-repository.test.ts` passam.
- `npm run validate:migrations` com a 0050.
- `tsc`, `eslint` e `prettier` limpos nos arquivos desta entrega.
- Takt Hub: `tests/unit/obra360-resumo-semanal.test.ts` (4), `obra360-pendencia.test.ts` (3) e
  `notificacoes.test.ts` passam; `tsc` sem erro nos arquivos tocados.

## Não validado

- Nenhum e-mail real: a migração do Takt Hub não foi aplicada e a função não foi publicada.
- As duas migrações num banco real.
- O temporizador num servidor de produção (só o ciclo, em teste, com relógio simulado).
- A aparência do e-mail no Gmail e no Outlook (o HTML segue o padrão de tabelas e estilo inline dos outros
  modelos; a largura é 680 px para caber a tabela de quatro colunas).
- A chave e o botão no navegador.
- `npm run build` e e2e não foram rodados nesta parte (outros agentes editavam o repositório).

## Pendências

- Os sete passos acima.
- Tour: os alvos `config-user-weekly` e `geral-resumo-semanal` existem na marcação, mas nenhum passo de tour os
  usa ainda.
- Mais de um processo do servidor ao mesmo tempo não duplica o e-mail (a fila recusa), mas cada um monta o
  resumo; hoje o servidor da ATR roda um só.
- Feriado municipal e estadual não são conhecidos: o dia sem lançamento aparece como falta.
