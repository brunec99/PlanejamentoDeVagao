# Tour guiado "Como usar esta tela" (20/10/2026)

Continuidade entre os modelos de IA que trabalham no repositório. Descreve o comportamento entregue, as decisões, os arquivos, a validação e as pendências do tour guiado.

## Pedido do usuário

"Adicione para todos os campos um ponto de interrogação que explique, sombreando os botões, as funcionalidades de cada página."

## O que já existia e o que mudou

O sistema já tinha um tour: o "?" do cabeçalho escurece a tela e destaca, um por vez, os elementos marcados com `data-tour`, com um cartão de explicação. Até 19/10 ele cobria poucas coisas por tela (de 3 a 9 passos) e não existia na terminalidade (aba 5), nas configurações da obra nem no modo de campo. Nessas telas o "?" nem aparecia, porque o botão some quando a tela não tem tour.

- **O botão:** o "?" do cabeçalho passou a mostrar o texto "Como usar" no computador (`help-button.tsx`). No celular continua só o ícone.
- **Todas as telas têm tour,** cobrindo cada botão e campo visível, na ordem da tela. Cada passo diz o que o controle faz, quando usar e a regra que importa.

| Tela | Endereço | Passos |
| --- | --- | --- |
| Obras | `/obras` | 10 |
| Aba 1 · Longo prazo | `/obras/<id>/longo-prazo` | 47 |
| Aba 2 · Vagões | `/obras/<id>/vagoes` | 13 |
| Vagão | `/obras/<id>/vagoes/<vagão>` | 28 |
| Aba 3 · Médio prazo | `/obras/<id>/medio-prazo` | 69 |
| Aba 4 · Curto prazo | `/obras/<id>/curto-prazo` | 44 |
| Aba 5 · Terminalidade | `/obras/<id>/terminalidade` | 27 |
| Arquivos IFC | `/obras/<id>/ifc` | 30 |
| Modelo federado | `/obras/<id>/federacao` | 26 |
| Integrações | `/obras/<id>/importar` | 15 |
| Dívidas | `/obras/<id>/dividas` | 9 |
| Configurações da obra | `/obras/<id>/configuracoes` | 35 |
| Configurações | `/configuracoes` | 18 |
| Terminalidade no celular | `/campo/terminalidade` | 39 |

A contagem inclui o passo final comum ("Sempre que precisar", que aponta para o próprio "?"). Ninguém vê todos os passos de uma vez: o tour mostra só os passos com alvo visível. Ficam de fora, por exemplo, a outra seção da aba, a outra visão do longo prazo, os botões que o papel da pessoa não tem, o que só existe no celular ou no computador e os painéis fechados. O médio prazo, por exemplo, mostra uns 38 passos na seção Cronograma e de 6 a 10 nas outras.

## Como funciona

- **Um arquivo por tela:** os passos ficam em `src/modules/tour/pages/<tela>.ts`, e `tours.ts` junta tudo, acrescenta o passo final comum e escolhe o tour pelo endereço (`resolveTourKey`). A separação permite que cada tela evolua sem disputar um arquivo só.
- **Passos visíveis:** ao começar, o tour guarda só os passos cujo alvo existe e tem área na tela (`isVisibleTarget` em `tour-provider.tsx`). Por isso o "Passo X de N" conta o que a pessoa vai ver. Se um alvo some no meio do tour, ele é pulado no sentido do último clique: voltando, continua voltando. Antes, o "Voltar" ficava preso nesse caso.
- **Tour dentro de uma janela:** o "?" que fica dentro de um elemento com `data-tour-scope` abre um tour só com o que está naquela janela. É o caso das folhas do modo de campo (Nova pendência, Resolver, Foto), que cobrem a tela inteira e têm o próprio "?".
- **Marcações:** `data-tour="<prefixo>-<nome>"`, com prefixo por tela (`curto-`, `termin-`, `campo-`, `medio-`, `longo-`, `vagoes-`, `vagao-`, `dividas-`, `ifc-`, `federation-`, `prevision-`, `obras-`, `config-`, `obra-config-`). Componentes que se repetem recebem `tourId`, como já fazia o `Panel`. Em linhas repetidas, a marca fica na primeira linha que tem o controle. Alvos comuns a todas as telas: `tab-header`, `tab-ajuda` (o "?" "Como funciona" ao lado da descrição da aba), `work-nav`, `modo-reuniao` e `ajuda`.
- **O que não é destacado:** o conteúdo de janelas e menus fechados, que não existe na tela; o passo do botão que os abre explica o que eles oferecem. Também ficam de fora mensagens de erro passageiras e avisos que são só texto.

## Validação

- **Teste:** `tests/tour-targets.test.ts` confere que todo alvo citado num passo existe em alguma marcação `data-tour` ou `tourId` do código, que todo passo tem título e explicação, e que toda página do sistema (e o modo de campo) tem tour. Um alvo renomeado ou removido faria o passo sumir em silêncio, e o teste pega esse caso.
- **Checagens:** typecheck, lint, Prettier, a suíte inteira de testes, a validação das migrações, o build e o teste de fumaça.
- **Navegador:** o modo de campo foi aberto num iPhone 13 simulado, com a API respondida pelo Playwright:
  - na lista de obras e na obra aberta, o contador saiu certo ("Passo 1 de 7" e "Passo 2 de 14"), com o elemento aceso e o resto escurecido;
  - o "?" de dentro de "Nova pendência" percorreu só os campos da folha ("2 de 9").
- **Não conferido no navegador:** os tours das telas do sistema, que dependem do perfil lido no banco e não abrem sem um banco local. Os textos foram escritos a partir do código de cada tela, e os alvos são garantidos pelo teste.

## Pendências e observações

- **Longo prazo:** a ajuda "Como ler a Linha de Balanço" diz "subsolo embaixo, cobertura em cima", mas o desenho põe o primeiro local (o mais baixo) no topo. O passo do tour sobre "Inverter locais" descreve o que o código faz. A ajuda ou o desenho precisam ser alinhados, por decisão do usuário.
- **Modo de campo:** o cabeçalho do celular ficou mais apertado com o "?", e o nome da obra pode cortar em telas estreitas.
- **Títulos de abertura:** o do curto prazo virou "Aba 4 · Curto prazo", enquanto os outros seguem o padrão longo ("Aba 1 · Cronograma de longo prazo").
