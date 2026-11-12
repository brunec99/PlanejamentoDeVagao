import type { ManualSection } from './types';

/** Manual do resumo semanal por e-mail (12/11/2026): o que chega no sábado, o que conta como cumprir, quem
 * recebe e como pedir fora de hora. Escrito a partir das regras 12 a 20 do modelo aprovado; descreve só o que
 * está implementado. */
export const sections: ManualSection[] = [
  {
    id: 'resumo-semanal-email',
    title: 'Resumo semanal por e-mail (sábado, 08:00)',
    summary: 'Quais obras cumpriram planejamento, histograma e produtividade; quem recebe; envio avulso.',
    keywords: [
      'resumo semanal',
      'e-mail de sábado',
      'email de sabado',
      'email semanal',
      'e-mail semanal',
      'resumo da semana',
      'receber o resumo semanal',
      'enviar o resumo agora',
      'quais obras cumpriram',
      'cumpriu o planejamento',
      'cumpriu o histograma',
      'cumpriu a produtividade',
      'não apurou',
      'não lançou',
      'placar das obras',
      'overview da semana',
    ],
    screen: 'dashboard-geral',
    body: `## O que é o resumo semanal

Todo **sábado, às 08:00** (horário de Brasília), o sistema manda um e-mail com o placar da semana que acabou, de **segunda a sexta**. Ele diz, obra por obra, quem cumpriu três coisas: o **planejamento** (curto prazo), o **histograma** e a **produtividade**. O texto é montado só com os números do sistema.

### Quem recebe

- Só **administradores** com a chave **Resumo semanal** marcada. A chave fica em **Configurações → Usuários**, na coluna Papel, embaixo do seletor, e só aparece nas linhas de quem é admin. Só admin altera.
- A chave nasce desmarcada para todos.

### O que conta como cumprir

- **Planejamento:** a semana precisa estar **apurada** (todas as linhas da planilha com Sim ou Não) e com **PPC de 80% ou mais**. De 70% a 79% sai **Parcial**; abaixo de 70%, **Não cumpriu**. Se alguma linha da semana ficou sem status até a hora do envio, a obra sai como **Não apurou**; se a semana não tem nenhuma linha, **Sem programação**. Os dois contam como não cumprido.
- **Histograma** e **Produtividade:** cumprir é ter lançamento em **todos os dias úteis** da semana (segunda a sexta, sem contar feriado nacional). Faltou um dia, sai **Não cumpriu** e o e-mail diz quais dias faltaram ("faltou qua e sex"). Sem nenhum lançamento na semana, **Não lançou**.
- A parcela de **produção medida** aparece ao lado da produtividade só como informação; não reprova.
- Obra que **nunca lançou** num módulo sai como **Não usa** e fica fora do placar daquele módulo. Entram as obras ativas.

### O que vem no e-mail

- A frase de abertura, com quantas obras cumpriram o planejamento e o PPC somando as obras (cumpridos ÷ assumidos das obras apuradas).
- O **placar**: quantas obras cumpriram o planejamento, o histograma e a produtividade.
- A **tabela obra por obra**, com um selo em cada item e o detalhe embaixo (PPC e linhas, dias lançados, efetivo médio, parcela medida). Quem cumpriu os três vem primeiro.
- Até **5 pontos de atenção**: o pior PPC com a causa principal, obras sem apuração, cards vencidos do Quadro de Restrições, apontamentos de segurança abertos há mais de 7 dias e checklists de equipamento vencidos.
- O botão **Abrir o Dashboard geral nesta semana**.

### Pedir o resumo fora de hora

No **Dashboard geral**, o admin tem o botão **Enviar o resumo agora para mim**. Ele manda o resumo só para quem clicou, com a última semana encerrada: no sábado e no domingo, a semana que acabou de terminar; de segunda a sexta, a semana anterior. Dá para pedir de novo depois de um minuto. O e-mail chega em até 5 minutos e não substitui o de sábado.

### Dúvidas comuns

- **Não recebi no sábado:** confira se a chave Resumo semanal está marcada na sua linha, em Configurações → Usuários, e olhe a caixa de spam. O e-mail sai uma vez por semana para cada pessoa.
- **A obra apareceu como Não apurou, mas fechou a semana depois:** o resumo é o retrato das 08:00 de sábado. Peça o resumo de novo pelo botão do Dashboard geral para ver a situação atual.
- **Semana com feriado:** o feriado nacional não conta como dia útil; feriado municipal ou estadual conta, e o dia sem lançamento aparece como falta.`,
  },
];
