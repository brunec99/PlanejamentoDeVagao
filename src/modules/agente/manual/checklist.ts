import type { ManualSection } from './types';

/** Manual da aba 9, Checklist de equipamentos (11/11/2026; operador pelo QR, assinatura, fotos e cadastro só com admin em 12/11/2026). Escrito a partir do código da tela e dos
 * comandos; descreve só o que está implementado. */
export const sections: ManualSection[] = [
  {
    id: 'checklist-equipamentos',
    title: 'Checklist de equipamentos: modelos, equipamentos e inspeções',
    summary:
      'Aba 9: inspeção diária, semanal e mensal; operador preenche pelo QR sem login, com assinatura e fotos; cadastro só com admin.',
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
      'qr code',
      'qr do equipamento',
      'etiqueta',
      'operador',
      'assinatura',
      'foto do checklist',
      'sem login',
      'gerar novo link',
    ],
    screen: 'checklist',
    body: `## O que é a aba 9, Checklist de equipamentos

É a inspeção periódica dos equipamentos da obra. Fica no grupo **SST** do menu, abaixo da vistoria de segurança.

### Quem pode o quê

- Todos que têm a obra **consultam** (a aba é aberta, como a aba 6).
- O **operador do equipamento** preenche pelo **QR colado na máquina**, sem login e sem conta (ver "Checklist pelo QR" abaixo).
- Quem é do tipo **TST** e os **administradores** registram, editam e excluem inspeções na tela, e veem o QR de cada equipamento. O tipo TST é marcado pelo administrador, na mesma tela da aba 6.
- **Só administradores** fazem o cadastro: criam e editam modelos, cadastram, renomeiam e desativam equipamentos e geram um novo link de QR (desde 12/11/2026, a pedido da equipe de SST, para não haver conflito nas informações). Para o TST, a mensagem é "Só administradores cadastram modelos e equipamentos e trocam o link do QR.".

### As três peças

- **Modelo:** a ficha. Tem nome ("Betoneira — diário"), **tipo de equipamento** ("Betoneira"), **periodicidade** (diário, semanal ou mensal) e a lista de itens a conferir (até 60). A lista de modelos é **única para todas as obras**: alterar um modelo vale para todas.
- **Equipamento:** o que existe na obra ("Betoneira 01"), de um tipo. Ele recebe todos os modelos ativos do mesmo tipo (a comparação ignora acento e maiúsculas).
- **Inspeção:** um modelo preenchido num equipamento num dia. Cada item é **C** (conforme), **NC** (não conforme) ou **N/A** (não se aplica). O NC exige a descrição.

### Como usar

1. (Admin) Em **Modelos de checklist**, clique em **Novo checklist**, preencha nome, tipo e periodicidade e escreva os itens. "Colar vários itens de uma vez" aceita a lista da ficha em papel, um item por linha. As setas mudam a ordem.
2. (Admin) Em **Equipamentos da obra**, cadastre cada equipamento com a identificação e o tipo. Um tipo sem modelo aparece com o aviso "Nenhum checklist para o tipo".
3. No quadro, clique no checklist do equipamento: âmbar é **pendente** no período, verde é **feito**, vermelho é **feito com não conformidade**. Responda os itens e clique em **Registrar inspeção**. "Marcar os demais como conforme" preenche o que ficou em branco. Na tela logada dá para anexar **até 4 fotos**, escrever o **nome do operador** e colher a **assinatura** dele no quadro (os três são opcionais ali; quem assina precisa ter o nome escrito).

### Checklist pelo QR (operador, sem login)

- Cada equipamento tem um **link secreto**. Na linha do equipamento, **QR do operador** mostra o QR, o endereço, **Copiar link** e **Imprimir etiqueta**; **Imprimir etiquetas com QR**, no alto do quadro, gera a folha com todos os equipamentos ativos da obra, para recortar e colar nas máquinas.
- O operador aponta a câmera do celular para a etiqueta. Abre uma tela só daquele equipamento, com os checklists dele: **pendente** tem o botão **Preencher**; **feito** mostra o dia e quem fez.
- No formulário ele responde C / NC / N/A, pode tirar **até 4 fotos** e escrever uma observação, e precisa escrever o **nome completo** e **assinar com o dedo**. Depois toca em **Enviar checklist**. Se houver item não conforme, a confirmação manda avisar o técnico de segurança antes de operar.
- Pelo link só se registra **o dia de hoje** e só o que está **pendente no período** (diário uma vez por dia, semanal uma por semana, mensal uma por mês). O operador não edita nem apaga: corrigir é com TST ou admin, na tela logada.
- Quem tem o link vê apenas aquele equipamento, nada mais do sistema. Se o link vazar, o admin clica em **Gerar novo link**: a etiqueta antiga para de funcionar e é preciso imprimir a nova. Equipamento desativado também fecha o link.
- No histórico, a inspeção mostra o nome do operador e a marca **pelo QR**; "Ver respostas" mostra a assinatura (com data e hora) e as fotos.
- O link precisa de internet no celular; não funciona sem sinal.

### Regras

- O período do diário é o dia; do semanal, a semana de segunda a domingo; do mensal, o mês.
- O mesmo modelo só é preenchido uma vez por equipamento por dia; abrir de novo edita a inspeção.
- Não se registra inspeção com data futura.
- A inspeção guarda os itens como estavam no dia: editar o modelo depois não muda o histórico.
- Modelo e equipamento não são excluídos, são **desativados** (saem do quadro, o histórico fica) e podem ser reativados.
- A tela carrega as inspeções dos últimos 120 dias e lista as 30 mais recentes.

### O que ainda não existe

Preenchimento sem internet, foto presa a um item específico, impressão da inspeção em PDF e a abertura automática de um apontamento na aba 6 a partir de uma não conformidade.`,
  },
];
