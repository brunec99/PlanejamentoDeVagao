import type { ManualSection } from './types';

/** Manual da aba 8, Controle de produtividade (11/11/2026): o lançamento diário de serviço, equipe e
 * produção, que substitui a planilha "ATR - Controle da produção". Escrito a partir do código da tela e
 * dos comandos; descreve só o que está implementado. */
export const sections: ManualSection[] = [
  {
    id: 'produtividade-visao-geral',
    title: 'Controle de produtividade: lançar a produção do dia e ler a produção por homem-dia',
    summary: 'Aba 2.3 (antiga 8): serviço, equipe e produção do dia; "a medir"; produção por homem-dia por serviço.',
    keywords: [
      'controle de produtividade',
      'produtividade',
      'aba 8',
      'aba 2.3',
      '2.3',
      'controles de obra',
      '2 · controles de obra',
      'controle da produção',
      'produção por homem-dia',
      'rup',
      'lançar produção',
      'a medir',
      'sem produção medida',
      'repetir o último dia',
      'unidade da produção',
      'serviço novo',
      'empreiteiro novo',
      'profissionais e ajudantes',
    ],
    screen: 'produtividade',
    body: `## O que é a aba 2.3, Controle de produtividade

É a planilha "ATR - Controle da produção" dentro do sistema. Cada linha é a equipe de um **empreiteiro** num **serviço**, num **dia**: profissionais, ajudantes, a **produção** medida e a **unidade**. Fica no grupo **2 · Controles de obra** do menu, como aba 2.3 (até 12/11/2026 era a aba 8).

### Quem pode o quê

- O módulo é liberado por pessoa, por um administrador (Configurações → Usuários → Módulos).
- Quem tem o módulo e a obra **lança, edita e exclui**. O papel **consulta** só visualiza.

### Lançar

1. Na **Folha do dia**, escolha o dia (abre em hoje para quem lança).
2. Preencha **Serviço**, **Empreiteiro**, **Prof.**, **Ajud.** e, se já tiver, a **Produção** e a **Unid.**. A observação serve para o trecho, o pavimento ou o motivo de parada. Clique em **Lançar**.
3. A unidade já vem preenchida com a que o serviço costuma usar na obra.

### Produção "a medir"

A produção pode ficar **em branco**: quer dizer que a equipe trabalhou e a medição ainda não saiu. Quando sair, digite o número na própria linha (o campo fica amarelo enquanto está a medir) e saia do campo.

### Repetir o último dia

Num dia ainda **sem lançamentos**, **Repetir o último dia** copia as equipes do último dia lançado antes dele, sem a produção e sem as observações. Depois é ajustar quem mudou e medir.

### Corrigir

O lápis da linha leva o lançamento para o formulário (**Salvar alteração**); a lixeira exclui, com confirmação.

### Como ler os números

- **Por homem-dia** é a produção dividida por profissionais mais ajudantes.
- No quadro **Produtividade por serviço**, o número é o do período inteiro: produção total dividida pelos homens-dia, só com as linhas já medidas. **Faixa** mostra a pior e a melhor linha; **Medições** mostra quantas linhas entraram e, entre parênteses, quantas ainda esperam medição. Clicar no serviço abre os empreiteiros.
- Um serviço lançado em duas unidades aparece em duas linhas, uma por unidade.

### Regras que a tela aplica

- A grafia que a obra já usa vence: "reboco " é gravado como "Reboco". Nome novo é aceito, com o aviso "Serviço novo nesta obra" ou "Empreiteiro novo nesta obra".
- As unidades são m², m³, m, kg, un, vb e t. Produção preenchida exige unidade.
- Não aceita data no futuro, equipe zerada nem produção zero (deixe em branco enquanto não foi medida).

### Histórico da planilha

Os lançamentos antigos entram por importação, feita pelo administrador do sistema. Produção vazia ou "0,00" da planilha entra como "a medir".`,
  },
];
