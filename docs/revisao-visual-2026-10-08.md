# Revisão visual com base no Takt Hub — 08/10/2026

O usuário pediu: "com base no Takt Hub, reveja a UX do sistema. Use mais o azul e torne-o mais bonito". O Takt Hub é o portal irmão (`~/Applications/App-Takt`), que divide com o Obra 360 o projeto Supabase de produção. Esta revisão aproxima as duas interfaces. Ela **não muda regra de negócio, rota, banco nem migração**.

## O que mudou

### Cores e tokens (`src/app/globals.css`)

- **Marca.** A escala `brand-50…950` é a mesma do Takt Hub, no azul-petróleo do logo da Takt (`#0a364d`). Os papéis apontam para ela:

  | Papel | Antes | Agora |
  | --- | --- | --- |
  | `primary` | `#1d4ed8` (azul royal do Tailwind) | `#1a719f` |
  | `primary-strong` | — | `#135a82` |
  | `primary-ink` | — | `#0a364d` |
  | `primary-soft` | — | `#eaf4fa` |
  | `primary-ring` | — | `#c1e0f0` |

- **Neutros.** A escala `slate-*` foi redefinida no `@theme` com um leve tom petróleo, com a mesma luminosidade da original, então o contraste dos textos se mantém (`slate-500` = `#59738a`, acima de 4,5:1 sobre branco).
  - As mais de mil classes `slate-*` das telas mudaram de uma vez, sem editar componente por componente.
  - Os hex soltos no CSS (grades, plano mensal, gavetas) passaram a usar as variáveis.
- **Sombras e fundo.** As sombras dos cartões (`shadow-card`, `shadow-card-hover`) levam o azul da marca, e o fundo da página ganhou um brilho radial azul no alto, como no Takt Hub.
- **Componentes base:**
  - `.eyebrow` passou para `brand-700`.
  - `.page-title` ficou em semibold, com 1,75 rem no desktop.
  - `.button` usa gradiente da marca e `.button-ghost` muda para azul claro no hover.
  - O cabeçalho de `.data-table` e das grades do médio prazo ganhou fundo `brand-50` com texto `brand-800/900`.
  - `.stat-card` tem um véu azul e um traço da marca no topo.
  - O esqueleto de carregamento ficou azulado.
- **Gráficos** (`src/shared/palette.ts`). Só os neutros (grade, eixo, tinta, linha de base) e o `link` acompanharam a troca. A paleta categórica `SERIES_COLORS` e os papéis planejado, executado, hoje e atraso **não mudaram**, porque foram validados contra daltonismo em 01/10.

### Moldura (`src/app/(app)/layout.tsx` e `src/modules/layout/`)

- **Lateral em azul-petróleo** (classe `.nav-dark`). O degradê vai de `brand-900` a `brand-950`, com um arco de luz no alto. A gaveta do celular usa o mesmo fundo.
  - Os logos da ATR e da Takt são escuros, por isso ficam num chip branco.
  - O item ativo tem fundo claro translúcido e um traço `brand-300` na borda do menu, como no Takt Hub.
  - O perfil virou um cartão no rodapé, com o botão de sair.
  - O grupo "Configurações" (só admin) passou a se chamar "Administração".
- **Cabeçalho fixo e translúcido com trilha** (`top-bar.tsx`, novo).
  - A trilha "Obras › obra › aba › vagão" é montada a partir do endereço e do planejamento já carregado. Nenhuma tela precisa declarar a sua.
  - No celular, a trilha mostra só a página atual.
  - Modo reunião e "Como usar esta tela" saíram do rodapé da lateral e foram para o cabeçalho, em todos os tamanhos de tela.
  - No celular, o cabeçalho tem o botão do menu, o logo da ATR e a trilha.
- **Cabeçalho das abas** (`tab-header.tsx`). O título ganhou um chip grande com o número da aba no gradiente da marca, que liga o título ao item aceso na lateral.
- **`Panel`** (`src/modules/planejamento/ui.tsx`). O cabeçalho tem fundo azul suave e um marcador vertical da marca antes do título.
- **Lista de obras** (`works-overview.tsx`):
  - cada cartão ganhou um chip com ícone;
  - o hover levanta o cartão;
  - os indicadores ficam num bloco próprio;
  - a barra de progresso usa o gradiente da marca;
  - o nome da obra quebra linha em vez de ser cortado.
- **Seletores segmentados** (visões do longo prazo, seções do médio prazo e Fluxograma/LOB): seguem o padrão do Takt, com o item ativo branco e um anel azul dentro de um trilho cinza-azulado.

### Login, ícones e tela de erro

- O **login** segue o desenho do Takt Hub.
  - No desktop, à esquerda fica o painel da marca, em degradê `brand-900→950`, com os logos, o título "Do cronograma da obra à meta da semana." e os quatro níveis de planejamento. À direita fica o formulário "Entrar no Obra 360".
  - No celular aparecem só os logos e o formulário.
  - A lógica de `?code=`, `?error=` e `?redirect=` não mudou.
- O **ícone**, o `apple-icon`, o `manifest`, o `themeColor` e a tela de erro global passaram para a marca: fundo `#0a364d`, com o âmbar do ícone preservado.

## Defeito corrigido no caminho

No celular, a faixa de abas sob o cabeçalho encolhia para 17 px de altura. A coluna de conteúdo é `flex-col` com rolagem, e um item com `overflow-x-auto` pode encolher até zero. A estrutura da coluna era a mesma antes desta revisão, então o defeito já existia. Agora a faixa e o cabeçalho têm `shrink-0`. Além disso, a aba aberta rola até ficar visível: o curto prazo, única aba liberada em produção, ficava escondido à direita.

## Validações

- `npx tsc --noEmit`: sem erros.
- ESLint nos arquivos alterados: 0 erros. Restam avisos `react-hooks/set-state-in-effect` em `mobile-drawer`, `sidebar-wrapper` e `zoom-toggle`, que vêm de código que esta revisão não alterou.
- `npm test`: 275 de 275 aprovados.
- `npm run build`: concluído.
- **Telas conferidas no navegador** (Playwright, 1440 px e 390 px): lista de obras, vagões, curto prazo, médio prazo, login e a gaveta do celular aberta.
  - O ambiente de desenvolvimento estava sem internet, então as capturas usaram os dados fictícios de `src/mocks/planning.ts`, servidos por um desvio temporário em `/api/planning` e no perfil.
  - Esse desvio foi **desfeito** antes do build e não está no código.

## Pendências

- Não houve conferência com dados reais nem com login de verdade.
- O longo prazo (fluxograma e Linha de Balanço), o Gantt do médio prazo com dados, o modelo federado e o detalhe do vagão não foram fotografados depois da troca de cor. Como só mudaram neutros e tokens, o risco é baixo, mas vale olhar.
- Não há modo escuro: o Takt Hub tem, e o Obra 360 continua só no claro.
- As variantes "completas" de `ZoomToggle` e `HelpButton` ficaram sem uso, porque agora só a versão em ícone aparece no cabeçalho. Ainda não foram removidas.
- As alterações **não foram commitadas nem publicadas**.
