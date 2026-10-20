import type { TourStep } from '../tours';

export const steps: TourStep[] = [
  {
    title: 'Configurações da obra',
    body: 'Os cadastros desta obra: empreiteiros e equipes, numeração das semanas, local da obra e as listas da terminalidade. Quem tem perfil de consulta vê tudo, mas não edita.',
  },
  {
    target: 'obra-config-ajuda',
    title: 'Como funciona',
    body: 'Abre o resumo desta tela. Cada seção abaixo tem o seu próprio ícone de ajuda, com a explicação detalhada dela.',
  },
  {
    target: 'work-nav',
    title: 'Seções da obra',
    body: 'A navegação da obra fica na lateral: as abas de planejamento liberadas para você e, em Apoio, as demais telas, entre elas estas configurações.',
  },
  {
    target: 'obra-config-new-team',
    title: 'Novo empreiteiro / equipe',
    body: 'Abre o formulário com o empreiteiro (a empresa), o nome da equipe e a capacidade semanal. Para mais uma equipe de um empreiteiro já cadastrado, use "Adicionar equipe" dentro dele.',
  },
  {
    target: 'obra-config-team-stats',
    title: 'Resumo dos recursos',
    body: 'Quantos empreiteiros e equipes a obra tem e quantas equipes já têm vínculos no planejamento, com quantas ainda estão sem vínculo.',
  },
  {
    target: 'obra-config-team-search',
    title: 'Buscar',
    body: 'Filtra pelo nome do empreiteiro ou da equipe. Se a busca bater só numa equipe, o empreiteiro dela abre sozinho para mostrá-la.',
  },
  {
    target: 'obra-config-company',
    title: 'Empreiteiro',
    body: 'Clique para abrir ou fechar as equipes dele. A linha soma equipes, capacidade (atividades por semana) e vínculos; "grafias" avisa que o mesmo empreiteiro foi escrito de jeitos diferentes — edite as equipes para unificar.',
  },
  {
    target: 'obra-config-team-capacity',
    title: 'Capacidade da equipe',
    body: 'Quantas atividades a equipe atende por semana; é o que sinaliza sobrecarga no médio prazo. Edite ali mesmo: grava ao sair do campo ou com Enter, e um valor inválido volta ao anterior.',
  },
  {
    target: 'obra-config-team-usage',
    title: 'Vínculos da equipe',
    body: 'Onde a equipe aparece: tarefas do médio prazo, linhas do curto prazo, atividades de vagões e linhas de base. Contam também registros antigos, então não são a carga da semana.',
  },
  {
    target: 'obra-config-team-actions',
    title: 'Editar ou excluir',
    body: 'Editar abre a equipe no formulário e mantém os vínculos. A lixeira exclui, depois de confirmar, só equipe sem vínculo; com vínculos ela fica travada para preservar as referências.',
  },
  {
    target: 'obra-config-add-team',
    title: 'Adicionar equipe',
    body: 'Abre, na própria linha do empreiteiro, o formulário de mais uma equipe dele: nome e capacidade por semana.',
  },
  {
    target: 'obra-config-allocate',
    title: 'Alocar recursos',
    body: 'Atalhos para as telas onde as equipes são usadas: o curto prazo e, para quem desenvolve o sistema, o médio prazo.',
  },
  {
    target: 'obra-config-week',
    title: 'Numeração das semanas',
    body: 'Mostra a semana 1 desta obra e o número da semana atual. É dela que sai o número de cada semana no curto prazo; sem semana 1, a numeração começa na primeira semana com linha na planilha.',
  },
  {
    target: 'obra-config-week-mode',
    title: 'Como informar',
    body: 'Pelo número que a semana atual tem na planilha da obra (o sistema conta para trás até a semana 1) ou por qualquer dia da semana 1 (vale a segunda-feira dela).',
  },
  {
    target: 'obra-config-week-value',
    title: 'Salvar a semana 1',
    body: 'Digite o número ou a data: a linha logo abaixo mostra qual será a semana 1 e o número da semana atual antes de gravar. "Salvar semana 1" aplica a numeração ao curto prazo na hora.',
  },
  {
    target: 'obra-config-week-reset',
    title: 'Numeração automática',
    body: 'Apaga a semana 1 definida: a numeração volta a começar na primeira semana com linha na planilha.',
  },
  {
    target: 'obra-config-location',
    title: 'Local da obra',
    body: 'A cidade ou o endereço da obra, com as coordenadas. Dele saem a previsão do tempo nos PDFs de planejamento do curto prazo e o tempo observado no fechamento; sem local, os PDFs saem sem a faixa do tempo.',
  },
  {
    target: 'obra-config-location-search',
    title: 'Buscar o local',
    body: 'Digite a cidade ou o endereço (ou cole as coordenadas) e espere a lista de lugares encontrados. Clicar num deles já salva o local.',
  },
  {
    target: 'obra-config-location-remove',
    title: 'Remover local',
    body: 'Tira o local da obra, depois de confirmar. Até um novo local ser informado, os PDFs do curto prazo saem sem a previsão do tempo.',
  },
  {
    target: 'obra-config-weather',
    title: 'Ver o tempo desta semana',
    body: 'Consulta o tempo da semana atual no local salvo, dia a dia: condição, mínima e máxima, e chuva. Os dias já medidos aparecem marcados como observados.',
  },
  {
    target: 'obra-config-terminality',
    title: 'Cadastros da terminalidade',
    body: 'Pavimentos, unidades, tipos de pendência e responsáveis ATR usados na lista de pendências da aba Terminalidade. Cada painel abaixo abre e fecha pelo cabeçalho.',
  },
  {
    target: 'obra-config-floors',
    title: 'Pavimentos e unidades',
    body: 'Clique para abrir ou fechar; o resumo conta pavimentos e unidades. Começa aberto quando a obra ainda não tem pavimento e você pode cadastrar.',
  },
  {
    target: 'obra-config-add-floors',
    title: 'Adicionar pavimentos',
    body: 'Mostra ou esconde o formulário que gera vários pavimentos de uma vez.',
  },
  {
    target: 'obra-config-floors-form',
    title: 'Gerar pavimentos',
    body: 'Em sequência: do 1 ao 20 com o sufixo gera "1° pavto" a "20° pavto", com Garagem, Térreo e Cobertura se marcados. Ou cole a lista livre, um por linha, de baixo para cima. Nomes já cadastrados ficam de fora; os novos entram no fim.',
  },
  {
    target: 'obra-config-unit-pattern',
    title: 'Unidades em todos',
    body: 'Mostra ou esconde o formulário que aplica o mesmo padrão de unidades a todos os pavimentos de uma vez. Aparece quando já há pavimentos.',
  },
  {
    target: 'obra-config-unit-pattern-form',
    title: 'Padrão de unidades',
    body: 'O número do pavimento vem do nome dele: unidade de 01 a 04 no 4° pavto gera 401 a 404, e Dígitos define quantas casas tem a unidade. As que já existem são mantidas; pavimento sem número no nome fica de fora.',
  },
  {
    target: 'obra-config-floor-list',
    title: 'Lista de pavimentos',
    body: 'Os pavimentos de baixo para cima, com quantas unidades e pendências cada um tem e as unidades logo abaixo.',
  },
  {
    target: 'obra-config-floor-actions',
    title: 'Ações do pavimento',
    body: '"Unidades" abre a edição das unidades do pavimento ("Concluir" fecha). As setas mudam a ordem, o lápis renomeia e a lixeira exclui — só pavimento sem unidades e sem pendências.',
  },
  {
    target: 'obra-config-unit-form',
    title: 'Unidades do pavimento',
    body: 'Com o pavimento em edição, clique numa unidade para renomear e no X para excluir (só sem pendências). Aqui se adicionam unidades em sequência (401, 402…) ou numa lista livre, separadas por vírgula.',
  },
  {
    target: 'obra-config-types',
    title: 'Tipos de pendência',
    body: 'Clique para abrir ou fechar; o resumo conta os tipos ativos e os inativos.',
  },
  {
    target: 'obra-config-type-list',
    title: 'Cadastro de tipos',
    body: 'Digite o nome e clique em "Adicionar tipo". Em cada tipo, o lápis renomeia e "Desativar" o tira das opções de novas pendências sem apagar o histórico; "Reativar" devolve. Tipos não são excluídos.',
  },
  {
    target: 'obra-config-type-starter',
    title: 'Tipos da planilha',
    body: 'Adiciona de uma vez os tipos da planilha que a obra usava (A/C, RI e PINTURA) que ainda faltam. Some quando todos já estão cadastrados.',
  },
  {
    target: 'obra-config-people',
    title: 'Responsáveis ATR',
    body: 'Clique para abrir ou fechar. Os responsáveis são só nomes de quem acompanha na obra: não precisam ter acesso ao sistema.',
  },
  {
    target: 'obra-config-person-list',
    title: 'Cadastro de responsáveis',
    body: 'Digite o nome e clique em "Adicionar responsável". O lápis renomeia; "Desativar" tira a pessoa das opções de novas pendências sem apagar o histórico, e "Reativar" devolve.',
  },
];
