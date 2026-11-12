import type { ManualSection } from './types';

/** Manual da aba 7, Histograma de mão de obra (11/11/2026): o efetivo diário por empresa e função, que
 * substitui a planilha "ATR Histograma - Todas as obras". Escrito a partir do código da tela e dos comandos;
 * descreve só o que está implementado. */
export const sections: ManualSection[] = [
  {
    id: 'histograma-visao-geral',
    title: 'Histograma de mão de obra: para que serve e quem pode o quê',
    summary: 'Aba 7: efetivo diário, quem lança e como ler.',
    keywords: [
      'histograma',
      'aba 7',
      'efetivo',
      'mão de obra',
      'quantas pessoas na obra',
      'headcount',
      'empreiteiros',
      'próprio',
      'homens-dia',
      'pico de efetivo',
      'média por dia útil',
      'por empresa',
      'por função',
    ],
    screen: 'histograma',
    body: `## O que é a aba 7, Histograma de mão de obra

É a planilha "ATR Histograma" dentro do sistema. Cada linha diz quantas pessoas de uma **função**, de uma **empresa**, estavam na obra num **dia**. Fica no grupo **Controles de obra** do menu.

### Quem pode o quê

- O módulo é liberado por pessoa, por um administrador (Configurações → Usuários).
- Quem tem o módulo e a obra **lança, edita e exclui**. O papel **consulta** só visualiza.

### O que a tela mostra

- **Cartões:** o efetivo no último dia lançado (com o aviso de quantos dias úteis estão sem lançar), a média por dia útil, o pico do período e a parcela de empreiteiros nos homens-dia.
- **Folha do dia:** as empresas do dia escolhido, cada uma com as funções e as quantidades. É onde se lança.
- **Histograma:** barras empilhadas por dia, semana ou mês. Dá para empilhar por **Próprio × empreiteiro**, por **Empresa** ou por **Função** e escolher o período (30 dias, 90 dias, 6 meses, 12 meses ou tudo). Empresa e função mostram as oito maiores e juntam o resto em "Demais".
- **Por empresa** e **Por função:** homens-dia (pessoas × dias), a média da equipe nos dias em que esteve na obra e em quantos dias apareceu.

### Como ler os números

- **Homens-dia** é a soma de pessoas × dias no período.
- Na visão por **semana** e por **mês**, a barra é a **média por dia útil lançado**: sábado e domingo ficam fora da média, porque a equipe é reduzida.
- **Próprio** é a mão de obra da ATR e da Takt; o resto conta como empreiteiro.`,
  },
  {
    id: 'histograma-lancar',
    title: 'Histograma: lançar o efetivo do dia, repetir o último dia e corrigir',
    summary: 'Folha do dia: lançar, repetir o último dia, corrigir.',
    keywords: [
      'lançar efetivo',
      'folha do dia',
      'repetir o último dia',
      'copiar dia anterior',
      'editar quantidade',
      'excluir lançamento',
      'já está lançado neste dia',
      'empresa nova',
      'função nova',
      'data no futuro',
      'observação do efetivo',
    ],
    screen: 'histograma',
    body: `## Lançar o efetivo do dia

1. Na **Folha do dia**, escolha o dia (abre em hoje para quem lança). As setas vão ao dia lançado anterior e ao próximo.
2. Preencha **Empresa**, **Função** e **Qtd.** e, se quiser, a **Observação** (falta, atestado, day off). Clique em **Lançar**.
3. A empresa continua preenchida para lançar a próxima função da mesma empresa.

### Repetir o último dia

Num dia ainda **sem lançamentos**, o botão **Repetir o último dia** copia as equipes do último dia lançado antes dele. Depois é só ajustar as quantidades que mudaram. As observações não são copiadas.

### Corrigir

- **Quantidade:** digite o novo número na própria linha e saia do campo (ou Enter).
- **Excluir:** a lixeira da linha, com confirmação.

### Regras que a tela aplica

- A mesma empresa e função só existe **uma vez por dia**. Lançar de novo é recusado com o aviso para editar a linha.
- A grafia que a obra já usa vence: "ATR " é gravado como "ATR" e "pedreiro" como "Pedreiro". Quando o nome não existe na obra, a tela avisa "Empresa nova nesta obra" ou "Função nova nesta obra" antes de lançar.
- Não aceita data no futuro, quantidade zero nem mais de 500 pessoas numa linha.

### Histórico da planilha

Os lançamentos antigos da planilha entram por importação, feita pelo administrador do sistema. Linhas repetidas da planilha (mesmo dia, empresa e função) entram somadas.`,
  },
];
