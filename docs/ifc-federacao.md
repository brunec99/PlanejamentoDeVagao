# IFC e modelo federado

## Direção acordada

Priorizar a montagem e a exploração do modelo federado. O BIM 4D fica para uma etapa posterior; a tela existente continua acessível, mas ainda não consome as composições salvas.

Este documento é o ponto de continuidade entre os modelos de IA que trabalham no repositório. Em cada alteração de IFC/federação, atualizar aqui: comportamento entregue, decisões, arquivos envolvidos, migrações, validação e pendências. Não descrever intenção como funcionalidade pronta. Preservar alterações locais de outro trabalho. A mesma orientação foi acrescentada ao `AGENTS.md` local, que atualmente é ignorado pelo Git; este documento e o README mantêm a orientação em arquivos versionáveis.

## Etapa 1 — composição e exploração (18/09/2026)

Implementada em `/obras/{obraId}/federacao`, com entrada **Modelo federado** no menu da obra.

- Selecionar uma versão de cada modelo ou deixá-lo fora do conjunto. A seleção inicial usa a versão mais recente, sem substituir uma seleção explícita.
- Consultar a disponibilidade de dados e geometria antes de carregar. Uma versão incompleta permanece selecionável para registrar a composição, mas impede seu carregamento até que o usuário escolha versões prontas ou a deixe de fora.
- Salvar composições nomeadas, compartilhadas entre usuários com acesso à obra. Cada salvamento cria uma nova cópia com IDs de versões fixos; não há edição nem exclusão de composições nesta etapa.
- Abrir uma composição não baixa geometria automaticamente. O botão **Carregar conjunto** aplica a seleção. Se a seleção mudar, o aviso distingue a composição em edição da cena anterior.
- Colorir por modelo, pavimento ou classe IFC; ocultar/isolar modelos; recortar por pavimento; mostrar tudo; enquadrar o conjunto.
- Clicar em elementos para consultar modelo/versão, nome, classe, pavimento e GlobalId. IDs locais são resolvidos dentro de cada versão, nunca globalmente na federação.
- Consultores podem abrir e explorar composições, mas não salvá-las. Autorização por obra e restrição de escrita são verificadas no servidor.

### Dados e API

A migração **`0021_ifc_federations.sql` precisa ser aplicada no Supabase** para persistir composições. Esta alteração adiciona o arquivo de migração; não executa SQL no ambiente remoto.

`ifc_federations`: `id`, `work_id`, `name`, `version_ids`, `created_at`, `created_by`. Há RLS habilitado, sem políticas para acesso direto de anon/authenticated, seguindo o padrão das tabelas IFC existentes. A API usa a service role somente após verificar o perfil.

A composição fica fora de `PlanningData` e de `commit_planning`: não participa do snapshot inteiro que os comandos de planejamento regravam. O array de versões não possui FK individual; a API valida existência, obra e unicidade por modelo antes da inserção. As versões IFC são preservadas pelo aplicativo. Se futuramente houver exclusão de versões, será necessário rever esse contrato.

- `GET /api/ifc/federations?workId=...`: retorna `{ federations }`, em ordem decrescente de criação, com paginação interna para não truncar a lista no limite do Supabase.
- `POST /api/ifc/federations`: recebe `{ workId, name, versionIds }`; retorna `201` com `{ federation }`. Nome de 1 a 120 caracteres, 1 a 200 modelos e apenas uma versão de cada modelo da própria obra. O autor vem da sessão.
- Não há troca automática para a revisão mais recente, nem sobrescrita de uma composição existente.
- Sem a tabela nova, a página informa qual migração falta. Montagem e carregamento continuam independentes do salvamento.

### Fluxo da geometria

O visualizador lê o mapa paginado de elementos e carrega os `.frag` existentes. A identidade de leitura é `(versionId, GlobalId)`, e o ID local da malha é sempre restrito ao modelo correspondente. A cor por modelo deriva do `modelId`, para se manter entre revisões.

Agrupamentos por pavimento/classe são preparados uma vez por carga; filtros e cores não baixam a geometria novamente. Alterações visuais são serializadas no worker. Troca de conjunto/desmontagem aborta consultas e descarta modelos/worker. O carregador compartilhado também verifica cancelamento depois da carga assíncrona e remove da cena os modelos de uma carga que falhou.

O contador descreve registros com GlobalId relacionados à geometria, não o total absoluto de entidades IFC. Malhas sem dados recebem cor do modelo ou cinza nas outras modalidades; não entram no recorte por pavimento. As legendas por classe/pavimento contam o conjunto completo, independentemente dos filtros de visibilidade.

### Arquivos principais

| Arquivo | Responsabilidade |
| --- | --- |
| `src/modules/federacao/federation-overview.tsx` | Seleção, disponibilidade, abertura e salvamento |
| `src/modules/federacao/viewer.tsx` | Exploração 3D independente de planejamento |
| `src/domain/ifc-federation.ts` | Contrato e validação da composição |
| `src/app/api/ifc/federations/route.ts` | Autorização e persistência |
| `src/modules/ifc/fragments-stage.ts` | Carregador compartilhado e cancelamento |
| `supabase/migrations/0021_ifc_federations.sql` | Tabela e índice das composições |
| `tests/ifc-federation.test.ts` | Preservação de versões e validações de composição |

### Limites atuais

- **Sistemas internos do IFC ainda não são extraídos.** A disciplina cadastrada no modelo é um texto e não equivale a um sistema interno.
- Não há normalização de pavimentos entre arquivos: nomes distintos continuam distintos.
- Modelos usam o posicionamento presente na geometria convertida; não há diagnóstico de georreferenciamento, transformação manual ou detecção de interferências.
- A seleção de modelos/versões é persistida. Câmera, cor, pavimento, visibilidade e seccionamento são controles temporários da sessão e não são salvos.
- Falha em uma geometria interrompe a carga do conjunto e apresenta o erro. Não há carregamento parcial silencioso.
- Ainda não há histórico de alterações de uma mesma composição, comparação de revisões nem consumo pelo 4D.

## Próximas etapas

1. **Sistemas IFC:** ampliar a extração para sistemas e relações com elementos, preservando identidade por versão e associações múltiplas. Criar fixtures de IFC com sistemas reais antes de alterar a ingestão. Não inferir sistema apenas pela classe ou disciplina.
2. **Sistemas da obra:** definir um cadastro comum e um mapeamento explícito dos sistemas de cada arquivo. Nomes iguais não bastam para concluir que dois sistemas são equivalentes.
3. **Exploração por sistema:** árvore, filtro, isolamento e cores, com indicação de elementos sem sistema e sistemas sem geometria. Manter o filtro combinado com modelo e pavimento.
4. **Coordenação espacial:** validar posicionamento/unidades de arquivos de origens distintas e definir como registrar transformações sem alterar a fonte.
5. **BIM 4D, posteriormente:** consumir a composição salva e estender regras de vínculo; discutir granularidade de serviço/local antes de atribuir avanço a elementos.

A migração de sistemas deve ficar fora do snapshot de planejamento, assim como elementos, propriedades, quantidades e composições. Como o `.ifc` original é opcional e as relações são removidas do `.frag`, versões antigas podem precisar de reenvio para extrair sistemas; não prometer recuperação a partir da geometria atual.

## Validação desta etapa

- `npm run typecheck`: aprovado após os ajustes finais.
- `node --import tsx --test tests/*.test.ts`: 126 testes aprovados, incluindo 4 novos testes de composição. Usado porque `npm test` tenta abrir um socket IPC do `tsx` bloqueado pelo sandbox.
- `git diff --check`: aprovado.
- `npm run build`: bloqueado pelo ambiente (Turbopack tenta abrir porta local e recebe `Operation not permitted`, inclusive na tentativa com elevação).
- `npm run build -- --webpack`: bloqueado pelo download da fonte Inter (`ENOTFOUND fonts.googleapis.com`). O build de produção não foi concluído; não houve alteração nas fontes nem na configuração de build para contornar essa limitação.
- Persistência no Supabase e interação 3D com arquivos reais: ainda não verificadas nesta etapa; requerem ambiente autenticado e migração aplicada.

## Revisão crítica da página e ajustes de interface (18/09/2026)

Esta revisão atualiza a apresentação da etapa 1, preservando a persistência e o escopo de federação independente do 4D. A análise considerou o código da página, sua hierarquia, estados, controles, escalabilidade da seleção e uma prévia interativa dos componentes reais com dados fictícios. Não equivale a validação de modelos reais no ambiente autenticado.

### Diagnóstico e decisões

| Achado | Impacto | Ajuste entregue |
| --- | --- | --- |
| Cards de modelos ocupavam toda a largura antes da cena | Alto: rolagem excessiva e seleção distante do resultado | Lista lateral de 310 px em telas amplas; visualizador ao lado. Em telas menores, os painéis se empilham. |
| Incluir/excluir modelo era uma opção do seletor de versão | Alto: duas decisões diferentes no mesmo campo | Checkbox de inclusão separado do seletor de versão; versão lembrada ao retirar/reincluir um modelo. |
| Carregar ficava depois de uma lista potencialmente longa | Alto: ação principal podia ficar fora da primeira tela | Botão e motivo de indisponibilidade antes da lista, com rolagem própria na lista. |
| Sem busca nem seleção em lote | Moderado: esforço cresce com a quantidade de arquivos | Busca por nome/disciplina, filtro de selecionados, Selecionar disponíveis e Limpar seleção. |
| Salvar e abrir competiam com montar e explorar | Moderado: vários formulários abertos sem necessidade | Área recolhível de composições, com abertura e salvamento separados e versões fixas explicitadas. |
| Só era possível selecionar elementos pelo canvas | Alto: peças pequenas/sobrepostas eram difíceis de consultar | Busca por nome, classe, GlobalId, pavimento e modelo, com seleção pelo teclado e destaque na cena. |
| Controles de visibilidade em chips, detalhes no fim da página | Moderado: relação fraca entre ação e estado | Painel Modelos em cena / Buscar elementos e seção fixa de detalhes, próximos ao canvas. |
| Recorte e modelos ocultos sem resumo evidente | Moderado: cena vazia podia parecer falha | Resumo de recorte ativo e ação Limpar recorte; rótulos Visível/Oculto e ícones associados. |
| Carregamento não era informado ao montador | Alto: ações repetidas durante a carga | Estado comunicado pelo visualizador; seleção/carregamento bloqueados durante a operação. |
| Botões desabilitados e pequenos controles pouco claros | Moderado: estados e interação inconsistentes | Estilos desabilitados locais à página, alvos ampliados, labels, foco visível, `aria-pressed` e mensagens de estado. |
| Textos técnicos e legendas competiam com o trabalho principal | Baixo: ruído visual | Limites da etapa e legenda detalhada em áreas recolhíveis. |

A base que foi preservada: versões explícitas, cópias imutáveis, aviso de seleção diferente da cena, autorização no servidor, identidade de elemento restrita à versão e reaproveitamento de geometria já carregada.

### Comportamento detalhado

- **Selecionar disponíveis** escolhe a versão mais recente com transcrição e geometria disponíveis de cada modelo da obra. Pode escolher uma versão anterior se o envio mais recente estiver incompleto. A versão escolhida permanece visível no seletor. A ação abrange a obra, não apenas os resultados da busca de modelos.
- Buscar modelos não altera a composição. Limpar seleção remove todos os modelos; limpar filtros apenas restaura a lista visível.
- **Aplicar seleção ao 3D** substitui o antigo rótulo Recarregar conjunto. O estado de falha/carga/conjunto carregado aparece junto ao visualizador. A ausência de WebGL bloqueia a carga, preservando montagem e salvamento.
- **Buscar elementos** respeita modelos ocultos e o pavimento atual. Termos são combinados, ignorando caixa e acentos. A lista mostra até 50 resultados e informa a contagem total; o usuário pode refinar a busca. Elementos sem linha transcrita ainda podem ser consultados pelo clique, mas não aparecem na busca.
- A busca usa `useDeferredValue`; limita o número de nós renderizados. A seleção usa `(versionId, localId)` e não mistura elementos de arquivos distintos com o mesmo ID local.
- A legenda continua descrevendo o conjunto completo, independentemente de visibilidade, e identifica esse escopo no título.
- Nenhuma migração adicional foi criada por esta revisão. Continua necessário aplicar a `0021` para salvar/abrir composições.

### Arquivos desta revisão

- `src/modules/federacao/federation-overview.tsx`: composição, busca de modelos, inclusão, ações em lote e estados.
- `src/modules/federacao/viewer.tsx`: ferramentas, exploração, busca/seleção e inspeção de elementos.
- `src/modules/federacao/element-search.ts`: busca limitada com contagem total e escopo de visibilidade.
- `src/app/globals.css`: estados desabilitados restritos a `.federation-page`.
- `src/modules/tour/tours.ts`: orientação atualizada para o novo fluxo.
- `tests/ifc-element-search.test.ts`: busca, identidades, recortes e limite de resultados.

### Validação e limites

- TypeScript aprovado; suíte completa com **129 testes aprovados** (3 novos testes de busca).
- Prévia isolada gerada com esbuild/PostCSS a partir dos componentes reais, com contexto e respostas de API fictícios. Inspeção visual em desktop e viewport de 390 px: painéis, campos e ferramentas se reorganizam sem transbordamento horizontal visível.
- Interações verificadas na prévia: Selecionar disponíveis exclui modelo sem geometria; busca por `hidraulica` encontra disciplina `Hidráulica`; Limpar seleção desabilita carga e salvamento; formulário recolhível abre corretamente.
- O servidor local não pôde iniciar: `listen EPERM 127.0.0.1:3000`. O Chrome confirmou conexão recusada antes da prévia isolada. Persistência remota, geometrias reais, raycast e destaque 3D não foram testados nesta revisão. Os bloqueios de build de produção registrados acima continuam pendentes.
- A revisão não é uma certificação WCAG: foram melhorados rótulos, foco, alvos e estados, mas não foi executada auditoria automatizada completa de contraste ou leitor de tela.

## Preparação da implantação (19/09/2026)

O build de produção foi executado com sucesso com acesso de rede/processos locais, além de TypeScript e 129 testes. A consulta inicial ao Supabase identificou 0020 e 0021 pendentes; a conferência após o push confirmou as novas colunas e a tabela, resolvendo o bloqueio. A prévia Vercel do commit `f3351ae` foi concluída com sucesso e o conjunto segue para promoção a `main`. Ver [registro de implantação](implantacao-2026-09-19.md) para evidências, bloqueios e sequência de conclusão.

## Seccionamento nos visualizadores (20/09/2026)

Entregue nos visualizadores de **Modelos IFC** e **Modelo federado**, acima da cena. O campo **Seccionamento** permite ativar um plano de corte horizontal (Y) ou vertical (X/Z), ajustar a posição de 0 a 100% pelo slider ou campo numérico, inverter o lado preservado e remover o corte. Os controles ficam indisponíveis até existir geometria válida carregada. O corte inicial é horizontal, em 50%, desativado.

### Comportamento e decisões

- A posição é proporcional à caixa de toda a geometria carregada. Na federação, é a união das caixas em coordenadas globais: os modelos recebem o mesmo plano, preservando o alinhamento entre arquivos. Os eixos são os da cena, não os da câmera.
- O lado de coordenada menor permanece visível por padrão; **Inverter lado** preserva o maior. O corte combina com pavimento e visibilidade por modelo sem mudar de posição quando esses filtros mudam.
- **Remover corte** restaura a geometria respeitando os outros filtros. Na federação, **Mostrar tudo** e **Limpar recorte** também removem o seccionamento. Carregar/recarregar uma versão ou conjunto começa sem corte. A seleção do elemento é limpa ao ajustar o plano.
- O renderer e todos os modelos Fragments compartilham os planos globais por `getClippingPlanesEvent`, para que renderização, descarte de tiles e raycast usem o mesmo corte. O Fragments transforma os planos internamente; não se aplica a transformação uma segunda vez.
- A renderização recebe o plano imediatamente. As atualizações do worker são agrupadas com intervalo acima de `maxUpdateRate`, inclusive uma atualização final quando o valor muda durante uma operação pendente. Isso evita perder a última posição após arrastar o slider ou remover o corte. Desmontagem cancela timers e restaura callbacks.
- O clique ignora resultados de uma configuração de corte anterior e pontos no lado oculto enquanto o worker atualiza. A busca textual e as contagens continuam considerando elementos inteiros dos modelos/pavimentos filtrados, incluindo os dois lados do plano; há aviso na busca quando o corte está ativo.
- É uma ferramenta de visualização temporária: não modifica arquivos, quantitativos, dados IFC ou composições salvas. Não preenche as faces abertas do corte, não cria desenho de seção e não salva vistas. Nenhuma migração ou mudança de API foi necessária. BIM 4D permanece para outra etapa.

### Arquivos e validação

- `src/modules/ifc/section-plane.ts`: cálculo do plano global, caixa do conjunto e sincronização com Fragments.
- `src/modules/ifc/use-section-plane.ts` e `section-controls.tsx`: estado por carga, ciclo de vida e controles compartilhados.
- `src/modules/ifc/model-viewer.tsx` e `src/modules/federacao/viewer.tsx`: integração nas duas telas, seleção e limpeza.
- `src/modules/tour/tours.ts`: orientação para encontrar os novos controles.
- `tests/ifc-section.test.ts`: oito testes de eixos, extremos, coordenadas negativas, inversão, entradas inválidas, plano compartilhado, atualização final e descarte.
- TypeScript e build de produção aprovados. Suíte completa: **141 testes aprovados**, incluindo os oito testes de seccionamento.
- A inspeção visual nesta sessão não pôde ser concluída: o acesso de Computer Use foi encerrado pela restrição da URL atual do navegador. Não houve interação autenticada com modelos reais. Permanece pendente verificar visualmente corte, inversão, clique, filtros combinados, recarga e uso em tela estreita com os arquivos da obra. Os testes do controlador usam caixas e callbacks controlados; não substituem a validação WebGL/worker em navegador.
