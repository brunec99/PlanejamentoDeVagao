# Empreiteiros e equipes por obra

## Comportamento entregue

O menu de cada obra tem **Configurações da obra**, em `/obras/[obraId]/configuracoes`. A página centraliza o cadastro de recursos utilizados no médio e no curto prazo. Cada recurso é uma equipe vinculada a uma empresa/empreiteiro da própria obra:

- **Empreiteiro / empresa:** identificação de quem executa; o formulário sugere as empresas já cadastradas na obra.
- **Nome da equipe:** identifica a equipe desse empreiteiro. Uma empresa pode ter várias equipes e empresas diferentes podem usar o mesmo nome de equipe.
- **Capacidade semanal:** número inteiro positivo de atividades que a equipe pode atender por semana; não representa quantidade de pessoas ou horas.

A tela permite buscar por empresa/equipe, cadastrar, editar e excluir equipes sem vínculos. Os contadores mostram referências em tarefas do médio prazo, compromissos do curto prazo, atividades e linhas de base. Eles incluem períodos anteriores e **não** medem a carga de uma semana.

Usuários com perfil de consulta podem visualizar o cadastro. Os demais perfis podem alterá-lo dentro das obras às quais possuem acesso. A autorização é revalidada no comando do servidor.

## Alocação e histórico

O cadastro utiliza a entidade `Team` existente, com `workId`, `company`, `name` e `weeklyCapacity`. Médio e curto prazo utilizam o mesmo `teamId`; a equipe continua opcional. Equipes de outra obra são recusadas pelos comandos.

No curto prazo, o seletor apresenta **empreiteiro · equipe**. Ao selecionar uma equipe na linha nova, o campo Fornecedor vazio recebe sua empresa. Se já houver texto, ele é preservado. Nas linhas existentes, mudar a alocação não altera o fornecedor; a ação **Usar [empresa]** permite copiar explicitamente a empresa da equipe para o fornecedor. O link **Gerenciar empreiteiros e equipes** abre o cadastro da obra.

Editar uma equipe conserva seu ID e todas as alocações. O nome e a empresa do cadastro passam a aparecer nos seletores, mas o fornecedor textual dos compromissos já registrados permanece inalterado. A exclusão é impedida se houver referências em atividades, compromissos, tarefas de médio prazo ou suas linhas de base congeladas. Isso evita referências órfãs e mantém recursos utilizados em comparações históricas.

## Decisões técnicas

- Reaproveitamento do cadastro único e da persistência existentes: **nenhuma migração nova** é necessária para esta entrega.
- Novo comando `update_team`: exige nome/empresa preenchidos, capacidade inteira positiva, acesso à obra e unicidade da combinação empresa + equipe dentro da obra, ignorando maiúsculas/minúsculas.
- `delete_team` agora verifica também tarefas do médio prazo, incluindo as copiadas em linhas de base.
- `src/domain/resources.ts` compartilha o rótulo de seleção e a contagem de vínculos.
- O cadastro é feito por formulário. Importação de equipes por arquivo ainda não foi implementada; precisa de um formato definido.

## Validação e pendências

Testes de `tests/work-resources.test.ts` cobrem edição, autorização, dados inválidos, duplicidade, atomicidade, preservação de fornecedor/IDs e bloqueio de exclusão nos diferentes tipos de vínculo. Os 7 testes novos e os 27 de `tests/expansao.test.ts` passaram via `node --import tsx --test tests/work-resources.test.ts tests/expansao.test.ts`.

A verificação integrada também passou: `npm run typecheck` e 162 testes via `node --import tsx --test tests/*.test.ts`.

O teste de interface no navegador com dados reais ainda deve conferir o cadastro, a edição de equipe já alocada e o preenchimento de fornecedor na linha nova. O resultado da validação integrada do planejamento fica registrado também em `docs/planejamento-tres-niveis.md`.
