# Sistema de Planejamento Vagão

MVP local em Next.js, TypeScript, Tailwind CSS e App Router. O vagão é um **período temporal**, sem pavimento ou local próprio. Os locais pertencem às atividades.

## Executar

Node.js 22 ou superior e npm:

```sh
npm ci
npm run dev -- --hostname 127.0.0.1
```

Abra http://127.0.0.1:3000/obras. O ambiente de validação usa a data fixa **08/09/2026**, indicada na interface. Os dados e alterações ficam em memória no navegador e são restaurados ao atualizar a página. Não há banco, login real ou deploy configurado.

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
- Perfis simulados de gestor, planejador e consulta; autorização por obra nos comandos.
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

**A rota com credencial funciona somente em desenvolvimento local.** Em produção retorna 403 até existir autenticação real da aplicação. Perfis simulados no navegador não são autenticação. Não publique o protótipo como sistema multiusuário com dados reais.

## Arquitetura e evolução

- `src/domain`: entidades, datas e regras puras.
- `src/application`: consultas, comandos e contrato de transação.
- `src/infrastructure/repositories/mock`: armazenamento em memória com cópias isoladas.
- `src/infrastructure/integrations/prevision`: cliente HTTP no servidor e normalização testável.
- `src/modules`: interface por funcionalidade.
- `src/app`: App Router e rota intermediária do Prevision.

PostgreSQL/Supabase, autenticação real e hospedagem na Vercel permanecem como próxima fase. O adaptador de banco deverá substituir o mock, executar comandos no servidor, aplicar autorização por obra e transações com controle de concorrência. O relógio de demonstração será substituído por um relógio de produção. Nada é persistido em memória de servidor como banco compartilhado.

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
