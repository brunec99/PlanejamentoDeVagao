/** Manual do sistema para o agente de IA (29/10/2026). Cada seção é um trecho de texto, escrito para a
 * pessoa que usa o Obra 360, que o modelo lê pela ferramenta `consultar_manual` quando a dúvida é sobre
 * o sistema (como fazer, onde fica, o que significa, por que não consigo) e não sobre os dados da obra.
 * O conteúdo fica em arquivos por módulo (`longo-prazo.ts`, `curto-prazo.ts`…), para cada tela
 * evoluir sem disputar um arquivo só, como os tours em `src/modules/tour/pages/`. */
export interface ManualSection {
  /** Identificador estável em kebab-case, prefixado pelo módulo: "curto-prazo-apontamento". */
  id: string;
  /** Título curto, como a pessoa chamaria o assunto. */
  title: string;
  /** Uma linha (até ~140 caracteres) para o índice que vai no prompt do sistema. */
  summary: string;
  /** Palavras e expressões que a pessoa usaria na pergunta (minúsculas; acentos são ignorados na busca). */
  keywords: string[];
  /** Seção da obra a que a tela pertence (`longo-prazo`, `vagoes`, `medio-prazo`, `curto-prazo`,
   * `terminalidade`, `federacao`, `ifc`, `dividas`, `importar`, `configuracoes`) ou uma tela fora da
   * obra (`obras`, `configuracoes-gerais`, `agente`, `geral`). Serve ao teste que confere a cobertura. */
  screen: string;
  /** O texto do manual, em markdown simples (## e ###, listas com -, negrito com **), em português do
   * Brasil, com os nomes dos botões e campos como aparecem na tela. Sem crase nem "${" dentro. */
  body: string;
}
