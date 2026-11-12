import type { ManualSection } from './types';

/** Manual da aba 9, Checklist de equipamentos (11/11/2026). Escrito a partir do código da tela e dos
 * comandos; descreve só o que está implementado. */
export const sections: ManualSection[] = [
  {
    id: 'checklist-equipamentos',
    title: 'Checklist de equipamentos: modelos, equipamentos e inspeções',
    summary: 'Aba 9: inspeção diária, semanal e mensal; TST edita.',
    keywords: [
      'checklist',
      'checklist de equipamentos',
      'aba 9',
      'inspeção de equipamento',
      'betoneira',
      'serra circular',
      'diário',
      'semanal',
      'mensal',
      'não conformidade',
      'modelo de checklist',
      'cadastrar equipamento',
      'tst',
    ],
    screen: 'checklist',
    body: `## O que é a aba 9, Checklist de equipamentos

É a inspeção periódica dos equipamentos da obra. Fica no grupo **SST** do menu, abaixo da vistoria de segurança.

### Quem pode o quê

- Todos que têm a obra **consultam** (a aba é aberta, como a aba 6).
- Só quem é do tipo **TST** e os **administradores** criam e editam modelos, cadastram equipamentos e registram, editam ou excluem inspeções. O tipo TST é marcado pelo administrador, na mesma tela da aba 6.

### As três peças

- **Modelo:** a ficha. Tem nome ("Betoneira — diário"), **tipo de equipamento** ("Betoneira"), **periodicidade** (diário, semanal ou mensal) e a lista de itens a conferir (até 60). A lista de modelos é **única para todas as obras**: alterar um modelo vale para todas.
- **Equipamento:** o que existe na obra ("Betoneira 01"), de um tipo. Ele recebe todos os modelos ativos do mesmo tipo (a comparação ignora acento e maiúsculas).
- **Inspeção:** um modelo preenchido num equipamento num dia. Cada item é **C** (conforme), **NC** (não conforme) ou **N/A** (não se aplica). O NC exige a descrição.

### Como usar

1. Em **Modelos de checklist**, clique em **Novo checklist**, preencha nome, tipo e periodicidade e escreva os itens. "Colar vários itens de uma vez" aceita a lista da ficha em papel, um item por linha. As setas mudam a ordem.
2. Em **Equipamentos da obra**, cadastre cada equipamento com a identificação e o tipo. Um tipo sem modelo aparece com o aviso "Nenhum checklist para o tipo".
3. No quadro, clique no checklist do equipamento: âmbar é **pendente** no período, verde é **feito**, vermelho é **feito com não conformidade**. Responda os itens e clique em **Registrar inspeção**. "Marcar os demais como conforme" preenche o que ficou em branco.

### Regras

- O período do diário é o dia; do semanal, a semana de segunda a domingo; do mensal, o mês.
- O mesmo modelo só é preenchido uma vez por equipamento por dia; abrir de novo edita a inspeção.
- Não se registra inspeção com data futura.
- A inspeção guarda os itens como estavam no dia: editar o modelo depois não muda o histórico.
- Modelo e equipamento não são excluídos, são **desativados** (saem do quadro, o histórico fica) e podem ser reativados.
- A tela carrega as inspeções dos últimos 120 dias e lista as 30 mais recentes.

### O que ainda não existe

Fotos na inspeção, preenchimento sem internet, impressão em PDF e a abertura automática de um apontamento na aba 6 a partir de uma não conformidade.`,
  },
];
