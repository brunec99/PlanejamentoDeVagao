# Implantação — federação e planejamento — 19/09/2026

## Pacote validado

Inclui a página Modelo federado e sua revisão de layout, composições salvas, busca de elementos, estrutura de itens/subitens do médio prazo, planilha independente do curto prazo e documentação de continuidade.

- 129 testes aprovados (`node --import tsx --test tests/*.test.ts`).
- TypeScript aprovado.
- **Build de produção aprovado** (`npm run build`), executado com acesso de rede e processos locais. Os bloqueios ambientais registrados na revisão anterior foram superados para o build.
- Branch remota `main` verificada antes da entrega: `b0487272756ea7588f5a825d007565f8459f64fc`.
- Integração GitHub → Vercel existente; o último commit de `main` tem implantação Production bem-sucedida.

## Banco: bloqueio confirmado

Consulta somente de esquema via REST ao projeto Supabase configurado (`fanktscgrprylqqnwjje`) constatou:

- `plan_tasks.level`: ausente (`42703`).
- `weekly_commitments.supplier`: ausente (`42703`).
- `ifc_federations`: ausente (`PGRST205`).
- `weekly_commitments.weekdays`: presente.

Logo, **0020 e 0021 não estão aplicadas**. A service role configurada não é uma credencial de execução de SQL. Não há CLI Supabase vinculada ou credencial administrativa de banco configurada no workspace. A tentativa de usar o painel via navegador falhou por indisponibilidade de captura do sistema. O acesso à API da Vercel com a credencial CLI existente retornou `403 forbidden`.

## Publicação segura

O código foi preparado para push em `release/federacao-planejamento-2026-09-19`, sem atualizar `main`. Isso permite entregar o código no GitHub sem acionar uma produção incompatível com o banco. Uma eventual preview também depende das migrações para as funções de gravação.

Para concluir produção:

1. No SQL Editor do projeto Supabase, aplicar `supabase/migrations/0020_outline_and_supplier.sql` e depois `supabase/migrations/0021_ifc_federations.sql`.
2. A migração 0020 remove `weekly_commitments.weekdays`, torna equipe opcional e troca `commit_planning`; coordenar a atualização do banco com a promoção do código, evitando gravações pela versão antiga nesse intervalo. Os dias da semana passam a ser derivados das datas. Preservar uma cópia dos valores antigos antes da remoção se for necessária reversão exata.
3. Promover a branch para `main` e acompanhar o deployment automático da Vercel até sucesso.
4. Verificar login, leitura/gravação de planejamento e salvamento/abertura de uma composição com modelos reais.

Não foi declarada implantação em produção concluída. Não foi executado SQL remoto. Não foram alteradas credenciais ou variáveis de ambiente.

## Reversão

Antes da alteração de banco, a produção permanece em `b048727`. Depois da migração 0020, voltar apenas o código não basta: a função antiga e a coluna `weekdays` fazem parte do contrato anterior. Reverter somente com restauração coordenada do esquema e dos dados preservados, ou corrigir a nova versão. A tabela aditiva `ifc_federations` pode permanecer sem uso durante uma reversão; não precisa ser excluída.

## Push e prévia

O commit `0ca2733` foi enviado à branch remota de implantação. A Vercel iniciou automaticamente uma prévia (deployment `J8hiv6uPWe5wrE9a3xsgnMmiUHxQ`). A migração 0021 recebeu em seguida `IF NOT EXISTS` na criação da tabela e do índice, permitindo reexecução após aplicação manual já concluída. Esse ajuste não executa a migração no banco.
