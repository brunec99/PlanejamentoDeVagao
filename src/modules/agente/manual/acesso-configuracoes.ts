import type { ManualSection } from './types';

/** Manual das telas de acesso e configuração (29/10/2026): entrar e sair, perfis e módulos, lista de
 * obras, Configurações do administrador, Configurações da obra e a navegação geral do sistema. Escrito a
 * partir do código das telas; quando o tour ou a documentação divergiam, valeu o código. */
export const sections: ManualSection[] = [
  {
    id: 'acesso-entrar-sair',
    title: 'Entrar e sair do sistema',
    summary: 'Como entrar com a conta Google da ATR ou da Takt, o que é preciso ter, por que a lista de obras vem vazia e como sair.',
    keywords: [
      'entrar',
      'login',
      'logar',
      'acessar',
      'conta google',
      'senha',
      'continuar com o google',
      'sair',
      'logout',
      'trocar de conta',
      'sessão expirada',
      'primeiro acesso',
      'não vejo nenhuma obra',
      'cadastro',
    ],
    screen: 'geral',
    body: `## Entrar no Obra 360

O Obra 360 não tem senha própria. Quem confirma quem você é é o Google, com a conta de trabalho; o sistema só confere o resultado. Não há cadastro a preencher nem senha para esquecer.

### O que você precisa

- Uma conta Google **@atrincorporadora.com.br** ou **@taktengenharia.com.br**. Conta Gmail pessoal não entra, mesmo no mesmo computador.
- **Ter sido cadastrado por um administrador** do sistema. Estar no domínio da empresa não basta: se o seu e-mail ainda não foi cadastrado, o login é recusado e a tela oferece "Solicitar acesso" (veja a seção sobre mensagens de erro e pedido de acesso).

### Passo a passo

1. Abra o endereço do sistema. Sem sessão, ele leva à tela "Entrar no Obra 360".
2. Clique em **"Continuar com o Google"**.
3. O Google pergunta **com qual conta** entrar. Ele pergunta toda vez, de propósito, porque muita gente tem a conta da empresa e a pessoal abertas no mesmo navegador. A lista mostra só contas de empresa (Google Workspace): escolha a da ATR ou a da Takt.
4. Pronto. O sistema devolve você à página que tentou abrir; entrando pela porta da frente, cai na lista de obras ("/obras").

A sessão fica guardada no navegador, então não é preciso repetir isso todo dia. Depois de muito tempo parado ela expira: o sistema pede o login de novo e **volta para a mesma página** em que você estava.

### No primeiro acesso a lista de obras vem vazia

Entrar e ver obras são coisas separadas. O cadastro dá o seu papel (consulta, planejador, gestor ou admin); as obras são liberadas uma a uma por um administrador, na tela Configurações. Se nenhuma foi liberada ainda, a tela "Obras" mostra "Você ainda não tem acesso a nenhuma obra. Peça a um administrador para liberar em Configurações." Isso não é erro: fale com quem administra o sistema e diga quais obras precisa ver.

### Sair ou trocar de conta

Na lateral (ou no menu do celular), embaixo, há um cartão com suas iniciais, seu nome e seu papel. O botão **"Sair do sistema"** (ícone de porta) encerra a sessão só neste navegador e volta à tela de login; a sua conta Google continua aberta no navegador e nos outros sistemas da empresa.

Para entrar com outra conta, clique em "Continuar com o Google" e escolha a outra na lista. Se o Google parou de perguntar qual conta usar, saia da conta errada no próprio Google ou abra uma janela anônima e comece de novo.

### Perguntas frequentes

- **Esqueci a senha.** Não existe senha do Obra 360; a senha é a da sua conta Google da empresa. Recupere-a com o suporte de TI da ATR ou da Takt.
- **Minha conta Google da empresa foi desativada.** O acesso ao sistema cai junto; não há o que fazer por aqui.
- **Posso dar acesso a um fornecedor ou cliente com e-mail de fora?** Não. Só entram contas dos dois domínios.`,
  },
  {
    id: 'acesso-erros-pedido',
    title: 'Mensagens de erro do login e pedido de acesso',
    summary: 'O que significa cada mensagem vermelha da tela de login, o que fazer, e como funciona o botão "Solicitar acesso".',
    keywords: [
      'não consigo entrar',
      'não consigo acessar',
      'erro no login',
      'e-mail não cadastrado',
      'solicitar acesso',
      'pedido de acesso',
      'pedir acesso',
      'apenas contas',
      'falha ao entrar com google',
      'login incompleto',
      'convite inválido',
      'não tem acesso a esta obra',
      'permite apenas consulta',
      'módulo disponível apenas para desenvolvimento',
      'módulo não liberado para você',
    ],
    screen: 'geral',
    body: `## Quando o login dá errado

A tela de login mostra um quadro vermelho "Não foi possível concluir o login" com o motivo logo abaixo.

| Mensagem | O que aconteceu | O que fazer |
| --- | --- | --- |
| **Apenas contas @atrincorporadora.com.br ou @taktengenharia.com.br podem acessar este sistema.** | Você escolheu uma conta pessoal ou de outro domínio. | Clique em "Continuar com o Google" de novo e escolha a conta da ATR ou da Takt. Se o Google não perguntar, saia da conta errada ou use uma janela anônima. |
| **Seu e-mail ainda não foi cadastrado no Obra 360. Peça o cadastro a um administrador.** | Conta do domínio certo, mas ninguém cadastrou o seu e-mail (ou o seu perfil foi excluído). | Use o botão "Solicitar acesso" que aparece junto, ou peça o cadastro a um administrador. Depois, entre de novo com o Google. |
| **Falha ao entrar com Google. Tente novamente.** | A volta do Google não completou: rede instável ou janela aberta por tempo demais. | Tente de novo. Se insistir, feche a aba e abra o endereço outra vez. |
| **Login incompleto. Tente novamente.** | O endereço de retorno foi aberto direto, sem passar pelo Google. | Comece pela tela de login, clicando no botão. |
| **Convite inválido ou expirado. Entre com sua conta Google.** | Link de um convite antigo por e-mail. | Ignore o link e entre com a conta Google. |
| **Não foi possível provisionar seu acesso. Contate um administrador.** | O Google aprovou, mas o sistema não criou o seu perfil. | Problema do sistema, não seu: avise um administrador. |

"Não foi possível iniciar o login com Google." é falha momentânea: tente em instantes. Dentro do sistema:

- **Sessão expirada. Faça login novamente.** Entre de novo; o sistema devolve você à mesma página.
- **Você não tem acesso a esta obra.** Peça a liberação a um administrador.
- **Seu perfil permite apenas consulta.** Você é "Consulta" e tentou alterar algo. Peça a mudança de papel a um administrador.
- **Módulo não liberado para você. Peça a liberação a um administrador.** O módulo (por exemplo, curto prazo ou terminalidade) não foi liberado para você: peça a um administrador (veja a seção de perfis e módulos). Até 08/11/2026 a mesma recusa dizia "Módulo disponível apenas para desenvolvimento."

## Solicitar acesso

Quando a mensagem é a de e-mail não cadastrado, a tela mostra o botão **"Solicitar acesso"**, que abre o formulário "Solicitar acesso ao Obra 360":

- **"E-mail"**: se o Google já confirmou quem você é, vem preenchido e travado, com a marca "confirmado pelo Google". Senão, digite o seu e-mail da ATR ou da Takt.
- **"Nome"** (obrigatório, até 120 caracteres).
- **"Obra e função (opcional)"**: em que obra você trabalha e o que faz (ex.: "Blentt, estagiário de planejamento"), até 500 caracteres.

Clique em **"Enviar pedido"** (ou "Cancelar"). Aparece "Pedido enviado: um administrador vai ver o pedido em Configurações."

### O que acontece depois

O pedido entra na lista "Pedidos de acesso" da tela Configurações, que só administradores veem. O sistema **não manda aviso por e-mail**: se tiver pressa, avise um administrador por outro canal. Quando ele clicar em "Cadastrar", você passa a ter perfil de consulta, ainda sem obras; ele libera as obras e os módulos em seguida. Depois disso, entre de novo com o Google.

Só e-mails dos dois domínios podem pedir ("Só contas @atrincorporadora.com.br ou @taktengenharia.com.br podem pedir acesso."). Existe um pedido por e-mail; repetir só atualiza o mesmo. "Não foi possível registrar o pedido agora. Tente de novo mais tarde." é falha momentânea: tente depois ou fale com um administrador.`,
  },
  {
    id: 'acesso-perfis-modulos',
    title: 'Perfis, permissões e módulos liberados',
    summary: 'O que cada papel (Consulta, Planejador, Gestor, Admin) pode fazer e quais módulos aparecem só para quem teve liberação.',
    keywords: [
      'permissão',
      'permissões',
      'papel',
      'consulta',
      'planejador',
      'gestor',
      'admin',
      'administrador',
      'quem pode',
      'não consigo editar',
      'módulo',
      'módulos liberados',
      'liberar módulo',
      'só vejo o curto prazo',
      'aba não aparece',
      'aba sumiu',
      'tst',
      'segurança do trabalho',
      'vistoria de segurança',
      'checklist de equipamentos',
      'quadro de restrições',
      'aba 6',
      'aba 9',
      'aba 2',
      'aba 3.1',
      'aba 3.2',
      'aba 1.4',
      '3.1',
      '3.2',
      '1.4',
    ],
    screen: 'geral',
    body: `## Os quatro papéis

Cada pessoa cadastrada tem um papel, mostrado embaixo do nome na lateral, que vale em todas as obras liberadas para ela. Só administradores mudam papéis, na tela Configurações.

- **Consulta**: vê o que foi liberado e não altera nada. É o papel de quem acaba de ser cadastrado.
- **Planejador**: edita o planejamento das obras liberadas.
- **Gestor**: tudo do planejador, mais cadastrar obra, liberar vagão em caráter excepcional e reabrir vagão terminal.
- **Admin**: tudo o que o gestor pode, mais administrar pessoas e acessos, ver todos os módulos e alterar semanas já encerradas do curto prazo.

| O que fazer | Consulta | Planejador | Gestor | Admin |
| --- | --- | --- | --- | --- |
| Ver as obras liberadas e, nos módulos liberados, planilha semanal, indicadores, PDFs e tempo | Sim | Sim | Sim | Sim |
| Editar a planilha do curto prazo (linhas, apontamento Sim/Não, causa, justificativa) | Não | Se liberado | Se liberado | Sim |
| Alterar linhas de semana já encerrada (a partir da quarta-feira seguinte) | Não | Não | Não | Sim |
| Cadastrar, editar e excluir empreiteiros e equipes | Não | Sim | Sim | Sim |
| Definir a semana 1 e o local da obra | Não | Sim | Sim | Sim |
| Editar nos demais módulos liberados por pessoa (terminalidade, longo prazo, vagões, médio prazo, Quadro de Restrições...) | Não | Se liberado | Se liberado | Sim |
| Cadastrar obra | Não | Não | Sim | Sim |
| Liberar vagão em caráter excepcional | Não | Não | Sim | Sim |
| Reabrir vagão terminal | Não | Não | Sim | Sim |
| Cadastrar usuários, definir papel, liberar obras e módulos, excluir perfil, tratar pedidos de acesso | Não | Não | Não | Sim |
| Ver todos os módulos sem liberação; abrir Configurações e Agente de IA | Não | Não | Não | Sim |
| Lançar e finalizar apontamentos na Vistoria de segurança (aba 3.1, módulo "Segurança do trabalho") | Só o papel TST, com o módulo liberado | Não | Não | Sim |

O papel **TST** (técnico de segurança do trabalho) é, no resto do sistema, igual ao Consulta: só vê. A diferença é a aba 3.1, "Vistoria de segurança" (antiga aba 6), onde ele lança, edita, finaliza e reabre os apontamentos, e a aba 3.2, "Checklist de equipamentos", onde ele grava as inspeções (o cadastro do checklist é só do admin). Desde 12/11/2026 o papel sozinho não basta: o TST também precisa ter os módulos **"Segurança do trabalho"** e **"Checklist de equipamentos"** liberados, senão as abas nem aparecem para ele. Ao marcar alguém como TST, o administrador libera também esses dois módulos.

Regras que valem para todos:

- **Obra liberada é por pessoa.** Mesmo um administrador só vê as obras liberadas para ele (pode liberar para si mesmo na grade de Configurações). Alterar obra não liberada dá "Você não tem acesso a esta obra."
- Quem é Consulta recebe **"Seu perfil permite apenas consulta."** ao tentar alterar algo; os botões de edição nem aparecem.
- Um administrador não tira o próprio papel de admin nem exclui o próprio perfil: outro admin faz isso.

## Módulos: abertos e liberados por pessoa

Os módulos liberados por pessoa aparecem só para quem os tem liberados. Desde 08/11/2026 o curto prazo e a terminalidade fazem parte desse grupo; antes eram abertos a todos. Desde 12/11/2026 também fazem parte a **Vistoria de segurança** (3.1), o **Checklist de equipamentos** (3.2) e o **Quadro de Restrições** (1.4): a segurança era aberta a todos para consulta, e o quadro vinha junto com o módulo Vagões.

**Abertos a todos** (basta ter a obra liberada): só a lista de obras, a aba **0 "Dashboard da obra"** (cada quadro só aparece para quem pode abrir o módulo de origem) e **"Configurações da obra"** (em Apoio). O **Dashboard geral** segue a regra dele (duas obras ou mais, e sempre admin e desenvolvedor). A tela "Configurações" geral é só de administradores.

**Liberados por pessoa, pelo administrador** (Configurações → Usuários, visão "Módulos", célula por pessoa ou em lote):

- No grupo **1 · Prazo**: aba 1.1 **"Cronograma de longo prazo"**; aba 1.2 **"Cronograma de médio prazo"**; aba 1.3 **"Cronograma de curto prazo"**; aba 1.4 **"Quadro de Restrições"** (coluna "Quadro de Restrições", separada da de "Vagões" desde 12/11/2026). O módulo **"Vagões"** libera o **Planejamento de vagão**, que não tem item no menu: aparece como o botão "Planejamento de vagão" dentro da aba 1.1.
- No grupo **2 · Controles de obra**: aba 2.1 **"Terminalidade"**, aba 2.2 **"Histograma de mão de obra"** e aba 2.3 **"Controle de produtividade"**.
- No grupo **3 · SST**: aba 3.1 **"Vistoria de segurança"** (coluna "Segurança do trabalho") e aba 3.2 **"Checklist de equipamentos"** (coluna "Checklist de equipamentos"). Dentro delas as regras de gravação não mudaram: quem tem o módulo consulta, só TST e admin gravam, e o cadastro do checklist é só do admin.
- Em Apoio: **"Modelo federado"**, **"Arquivos IFC"**, **"Dívidas"** e **"Integrações"**.

Administradores e desenvolvedores veem todos sem liberação. Módulo liberado não muda o papel: quem é Consulta continua só vendo.

O **link ou QR do operador** do Checklist de equipamentos continua sem login e não depende de módulo.

Quem já usava o curto prazo e a terminalidade em 08/11/2026 continuou com os dois liberados; o administrador revoga de quem não deve ter. O mesmo valeu em 12/11/2026 (migração 0049): todo não-admin ganhou "Segurança do trabalho" e "Checklist de equipamentos", e quem tinha "Vagões" ganhou o "Quadro de Restrições". Usuário cadastrado depois começa sem nenhum módulo, inclusive esses: o administrador libera.

### O que acontece sem a liberação

- O item **não aparece** na lateral nem na faixa de abas do celular; a numeração das abas não muda (é normal ver, por exemplo, só a 0, a 1.3, a 2.1 e a 3.1), e um grupo sem nenhuma aba liberada não aparece.
- O endereço de uma aba não liberada **redireciona para o Dashboard da obra** (aba 0) da mesma obra, sem mensagem. Até 08/11/2026 o desvio era para o curto prazo.
- O modo de campo da terminalidade ("/campo/terminalidade") e os PDFs do curto prazo e da terminalidade também recusam quem não tem o módulo.
- Sem o módulo "Vagões", o botão "Planejamento de vagão" não aparece na aba 1.1.
- Um pedido feito pela tela a um módulo não liberado responde **"Módulo não liberado para você. Peça a liberação a um administrador."** (até 08/11/2026, "Módulo disponível apenas para desenvolvimento."). Para liberar, fale com um administrador.`,
  },
  {
    id: 'obras-lista',
    title: 'Lista de obras e cadastro de obra',
    summary: 'O que os cartões da tela "Obras" mostram, como abrir uma obra, quem cadastra obra nova e o que preencher.',
    keywords: [
      'obras',
      'lista de obras',
      'cartão da obra',
      'abrir obra',
      'cadastrar obra',
      'nova obra',
      'código da obra',
      'em dia',
      'atenção',
      'crítico',
      'ppc da semana',
      'restrições vencidas',
      'takt vencido',
      'não vejo a obra',
      'excluir obra',
    ],
    screen: 'obras',
    body: `## A tela "Obras" ("/obras")

É a primeira tela depois do login e o ponto de partida para qualquer obra. Ela mostra **um cartão por obra liberada para você**; obras não liberadas não aparecem. Se a lista vier vazia, a mensagem é "Você ainda não tem acesso a nenhuma obra. Peça a um administrador para liberar em Configurações." Não há campo de pesquisa nesta tela.

### O que cada cartão mostra

- O **código** e o **nome** da obra.
- Um **selo de saúde**: "Em dia", "Atenção", "Crítico" ou "Sem apuração". Vale o pior dos três indicadores do cartão; a cor da barra no topo e da borda acompanha o selo.
- **"PPC da semana"**: o PPC da última semana em que todos os compromissos foram apontados (Sim ou Não). Verde a partir de 80%, amarelo a partir de 60%, vermelho abaixo disso; "—" e "Sem semana apurada" quando nenhuma semana foi fechada por completo. Embaixo, "Semana de dd/mm" diz qual semana foi lida. A semana atual, ainda aberta, não entra.
- **"Restrições vencidas"**: restrições abertas com prazo vencido. Uma só já deixa a obra em "Crítico", mesmo com PPC bom, porque é ela que vai parar a frente.
- **"Takt vencido"**: vagões com o período estourado. Conta como "Atenção".
- **"Progresso em produção · N vagões"**: aparece quando a obra tem vagões em produção; é o progresso ponderado das atividades desses vagões.

Os indicadores de restrições e vagões vêm do longo prazo e dos vagões; numa obra que só usa o curto prazo eles ficam em zero e "Em dia".

### Abrir a obra

O cartão inteiro é um link ("Abrir planejamento"): clique em qualquer ponto dele. A obra abre na aba 0, "Dashboard da obra", que é aberta a todos que têm a obra. Depois, troque de aba pela lateral ou pela faixa de abas do celular; só aparecem as abas liberadas para você.

### Cadastrar obra

O botão **"Cadastrar obra"**, ao lado do título, aparece só para **gestores e administradores**. Ele abre uma gaveta com dois campos:

- **"Nome da obra"**.
- **"Código"**: a sigla curta usada nos cabeçalhos e nas colunas da grade de usuários (ex.: "MZN"). Não pode repetir o de outra obra: o sistema recusa com "Código de obra já utilizado."

Clique em **"Salvar"** (ou "Cancelar"). Ao salvar, a obra **já fica liberada para quem a cadastrou** e abre em seguida; para as demais pessoas, um administrador precisa liberá-la na grade de Configurações. Em seguida, cadastre os empreiteiros e as equipes e defina a semana 1 em "Configurações da obra".

### Perguntas frequentes

- **Cadastrei a obra e meu colega não vê.** Liberar obra é por pessoa: um administrador marca a célula da pessoa na coluna da obra, em Configurações.
- **Dá para excluir uma obra?** Só **administradores**, em **Configurações da obra**, no bloco **"Excluir obra"**, no fim da página: "Excluir esta obra…" mostra o que sai junto e pede para digitar o código da obra; "Excluir definitivamente" apaga a obra e tudo o que é dela (curto, médio e longo prazo, vagões, equipes, IFC, terminalidade com as fotos, configurações e o acesso de todos), para todas as pessoas. **Não dá para desfazer.** Ficam só o histórico de alterações e o consumo de IA do mês. Gestor cadastra obra, mas não exclui. Não existe "desativar".
- **O PPC do cartão não bate com o da planilha.** O cartão lê só a última semana com todos os compromissos apontados; a planilha pode estar mostrando a semana atual, ainda aberta.`,
  },
  {
    id: 'configuracoes-usuarios-acessos',
    title: 'Configurações (admin): usuários, acessos e banco de dados',
    summary:
      'Tela do administrador: cadastrar usuário sem e-mail, pedidos de acesso, grade pessoa × obra ou × módulo, papel, TST, excluir perfil, migrações.',
    keywords: [
      'configurações',
      'cadastrar usuário',
      'convidar',
      'liberar obra',
      'liberar acesso',
      'revogar acesso',
      'liberar em lote',
      'várias pessoas de uma vez',
      'selecionar vários usuários',
      'grade de usuários',
      'pessoa por obra',
      'módulos',
      'definir papel',
      'mudar papel',
      'marcar como tst',
      'liberar segurança do trabalho',
      'liberar checklist de equipamentos',
      'liberar quadro de restrições',
      'coluna quadro de restrições',
      'excluir usuário',
      'pedidos de acesso',
      'banco de dados',
      'migração',
    ],
    screen: 'configuracoes-gerais',
    body: `## A tela "Configurações" ("/configuracoes")

Fica no grupo **"Administração"** da lateral e só aparece para quem tem papel **Admin**; quem não é admin vê "Acesso restrito a administradores."

São três blocos: "Takt por obra" (takt padrão e início do primeiro vagão de cada sequência; assunto do módulo de vagões), "Usuários e acessos" e "Banco de dados". No mesmo grupo da lateral, o link **"Agente de IA"** mostra ao administrador o consumo e os limites da assistente Claudia (outra seção).

## Usuários e acessos

### Pedidos de acesso

O painel só aparece quando alguém pediu acesso pela tela de login: nome, e-mail ("e-mail confirmado pelo Google" ou "e-mail digitado, não confirmado"), quando pediu e a mensagem. **"Cadastrar"** cria o usuário como Consulta, sem obras e sem módulos (nem curto prazo, terminalidade, segurança do trabalho, checklist de equipamentos ou Quadro de Restrições), e o pedido sai da lista: libere as obras e os módulos na grade e avise a pessoa para entrar de novo com o Google. **"Dispensar"** só tira o pedido da lista.

### Cadastrar usuário

Só entra quem foi cadastrado aqui. Informe o **"E-mail"** (@atrincorporadora.com.br ou @taktengenharia.com.br), o **"Nome (opcional)"** (vazio, vale o começo do e-mail) e o **"Papel"** (Consulta, TST, Planejador, Gestor ou Admin), e clique em **"Cadastrar"**. O usuário novo começa sem obras e sem módulos, inclusive curto prazo, terminalidade, segurança do trabalho, checklist de equipamentos e Quadro de Restrições: libere o que ele precisa na grade. Para um TST, libere também os módulos "Segurança do trabalho" e "Checklist de equipamentos": sem eles, as abas 3.1 e 3.2 não aparecem para ele. **Nenhum e-mail é enviado**: avise a pessoa para entrar com a conta Google desse e-mail. Se ela já usa outro sistema da empresa com a mesma conta, a conta é reaproveitada. Cadastrar também aprova um pedido de acesso pendente do mesmo e-mail.

Mensagens: "Só contas @... podem ser cadastradas." (domínio errado) e "Usuário já cadastrado. Altere o papel e as obras na lista abaixo."

### A grade de acessos

Uma linha por pessoa (nome, e-mail e, na sua, o selo "você") e uma coluna por obra, com código, nome e quantos dos listados têm aquela obra. Célula marcada é obra liberada: **clique para liberar ou revogar; vale na hora, sem botão de salvar.** Quem não tem a obra não a vê na lista de obras; quem não tem nenhuma recebe "Sem obra liberada" na linha. Se o servidor recusar, o aviso "Não foi possível salvar." explica e a célula volta.

- **"Obras" / "Módulos"** troca as colunas. Em "Módulos", cada célula libera ou bloqueia um módulo liberado por pessoa: longo prazo, vagões, médio prazo, curto prazo, Quadro de Restrições, terminalidade, histograma, controle de produtividade, segurança do trabalho, checklist de equipamentos, modelo federado, arquivos IFC, dívidas e integrações (as colunas "Curto prazo" e "Terminalidade" existem desde 08/11/2026; "Quadro de Restrições", "Segurança do trabalho" e "Checklist de equipamentos", desde 12/11/2026). Os abertos a todos não viram coluna: são só o Dashboard da obra e as Configurações da obra. Nas linhas de administradores as células ficam em cinza, sem clique, porque admin vê tudo.
- **Várias pessoas de uma vez (liberação em lote):** marque a caixa ao lado do nome de cada pessoa. A caixa do cabeçalho "Usuário" marca todos os listados (com filtro, só os filtrados), e Shift+clique marca o intervalo entre duas caixas. Aparece uma barra com "N usuários selecionados" e dois campos, "Obras" e "Módulos", em qualquer visão da grade: escolha as obras, os módulos ou os dois no mesmo lote (ou "Todas"/"Todos"), e clique em **"Liberar para N pessoas"** ou **"Revogar de N pessoas"**. O número conta só quem muda de fato; quem já tem (ou já não tem) fica como está. Revogar pede confirmação; liberar vale na hora. A seleção continua ao pesquisar e filtrar, então dá para montar a turma pesquisando nome a nome; quem saiu da lista continua marcado e entra no lote, e a barra avisa ("N estão fora da lista atual e também entram"). Nos módulos, admins ficam de fora, porque já veem tudo; se o lote também levar obras, para eles só as obras mudam. "Limpar seleção" desmarca todos. Papel e exclusão continuam linha a linha.
- **"Pesquisar nome ou e-mail"**: cada palavra digitada precisa aparecer, sem diferença de acento. Filtros **"Todos os papéis"** e **"Todas as obras"** (com "Sem obra liberada" e "Com acesso a [obra]"); "Limpar filtros" desfaz. O contador diz "N de M usuários".
- Clique em **"Usuário"** ou **"Papel"** no cabeçalho para ordenar; de novo, inverte.
- **"Papel"**: a lista troca o papel assim que você escolhe outro: Consulta, TST, Planejador, Gestor ou Admin. O **TST** (técnico de segurança do trabalho) lança e finaliza apontamentos na aba 3.1, Vistoria de segurança (antiga aba 6), e grava as inspeções da aba 3.2, Checklist de equipamentos, nas obras liberadas para a pessoa, e consulta o resto do sistema; ao escolher, aparece "[nome] agora é TST.". **O papel não libera as abas:** desde 12/11/2026, ao marcar alguém como TST, libere também, na visão "Módulos", as colunas "Segurança do trabalho" e "Checklist de equipamentos". O Admin também lança na aba 3.1. Na sua própria linha fica travado ("Ninguém tira o próprio acesso de administrador."). Quem estava com a aba 3.1 aberta precisa recarregá-la (no celular, atualizar a obra no modo de campo).
- **Excluir**: a lixeira no fim da linha, depois de confirmar "Excluir [nome]?". A pessoa perde o acesso ao Obra 360 e precisa ser cadastrada de novo; **a conta Google e o acesso aos outros sistemas da ATR continuam**. Não aparece na sua própria linha.

## Banco de dados

Mostra "N de M migrações aplicadas · verificado em ..." e uma tabela com "Situação" ("Aplicada", "Faltando" ou "Faltando · crítica"), "Migração", "O que faz" e "Sem ela". Falta de uma **crítica** faz as telas não carregarem; falta de uma **opcional** desliga só a funcionalidade dela (por exemplo, salvar a semana 1 ou o local da obra). Quem aplica migrações é quem mantém o sistema; depois, **"Verificar de novo"** confere se entrou.`,
  },
  {
    id: 'obra-configuracoes-equipes',
    title: 'Configurações da obra: empreiteiros e equipes',
    summary: 'Cadastrar empreiteiro e equipe com capacidade semanal, editar, buscar, vínculos e por que a exclusão é recusada.',
    keywords: [
      'configurações da obra',
      'equipe',
      'equipes',
      'empreiteiro',
      'empresa',
      'cadastrar equipe',
      'nova equipe',
      'capacidade semanal',
      'atividades por semana',
      'excluir equipe',
      'equipe com vínculos',
      'grafias',
      'adicionar equipe',
      'quem executa',
    ],
    screen: 'configuracoes',
    body: `## Configurações da obra

Fica no grupo **"Apoio"** da lateral e é aberta a todos que têm a obra liberada. O cabeçalho mostra "Apoio · código · nome da obra" e o "Como funciona" com o resumo. A tela tem quatro seções: **"Empreiteiros e equipes"**, **"Numeração das semanas"**, **"Local da obra"** e **"Cadastros da terminalidade"** (pavimentos e unidades, tipos de pendência e responsáveis ATR, tratados na seção da terminalidade). Administradores veem ainda, no fim, **"Excluir obra"** (ver a seção da lista de obras). Quem tem perfil **Consulta** vê tudo, mas não edita: a tela avisa "Seu perfil permite consulta ao cadastro." Planejador, gestor e admin editam.

## Empreiteiros e equipes

É o cadastro de quem executa. As mesmas equipes aparecem como opção de equipe na planilha do curto prazo e como recurso no médio prazo. Três cartões resumem: **"Empreiteiros"**, **"Equipes cadastradas"** e **"Equipes com vínculos"** (com "N sem vínculo").

### Cadastrar

Clique em **"Novo empreiteiro / equipe"**. A gaveta pede:

- **"Empreiteiro / empresa"**: o nome da empresa. O campo sugere os já cadastrados; use sempre a mesma grafia para as equipes da mesma empresa.
- **"Nome da equipe"** (ex.: "Alvenaria · equipe 01").
- **"Capacidade (atividades / semana)"**: número inteiro, no mínimo 1. É quantas atividades a equipe atende por semana, o que sinaliza sobrecarga no médio prazo.

**"Cadastrar equipe"** salva ("Equipe cadastrada e disponível nos dois planejamentos."). Para mais uma equipe de um empreiteiro já cadastrado, abra-o na lista e use **"Adicionar equipe"**: o formulário aparece na própria linha, só com nome e capacidade.

### A lista "Recursos da obra"

Uma linha por empreiteiro, com o total de equipes, a capacidade somada ("N atividades / semana") e os vínculos ("sem vínculos" ou "N vínculos"). Clique na linha para abrir as equipes. O campo **"Buscar empreiteiro ou equipe"** filtra pelos nomes; se a busca bater só numa equipe, o empreiteiro dela abre sozinho. "Empresa não informada" é um cadastro sem empreiteiro.

O aviso **"N grafias"** significa que o mesmo empreiteiro foi escrito de jeitos diferentes (ex.: "Alfa" e "ALFA Ltda"). Edite as equipes e unifique a grafia.

Em cada equipe:

- **Capacidade** editável na própria linha: grava ao sair do campo ou com Enter. Valor inválido mostra "Capacidade inválida." e o campo volta ao anterior.
- **Vínculos**: "N no médio", "N no curto", "N em atividades", "N em linhas de base" dizem onde a equipe aparece. Contam registros antigos também, então não são a carga da semana. "N no curto" só aparece para quem tem o curto prazo liberado.
- **"Editar"** abre a equipe na gaveta e mantém os vínculos; mudar o nome não altera o que já foi gravado nos compromissos semanais.
- **Lixeira**: exclui, depois de confirmar, só equipe **sem vínculo**. Com vínculos ela fica desabilitada ("A equipe tem vínculos. Preserve o cadastro ou remova suas alocações antes de excluir.").

### Mensagens comuns

- "Equipe já cadastrada nesta obra para esta empresa.": mesmo empreiteiro e mesmo nome de equipe.
- "Capacidade deve ser um número inteiro positivo de atividades por semana."
- "Esta equipe tem compromissos na planilha semanal. Remova a alocação antes de excluir a equipe." (e variantes para atividades, médio prazo e linhas de base): troque a equipe nas linhas que a usam ou mantenha o cadastro.

Embaixo da lista, **"Alocar recursos: Curto prazo"** leva à planilha onde as equipes são usadas; o atalho só aparece para quem tem o curto prazo liberado.`,
  },
  {
    id: 'obra-configuracoes-semana-local',
    title: 'Configurações da obra: semana 1, local da obra e locais da obra',
    summary:
      'Semana 1 que numera o curto prazo, local da obra (tempo nos PDFs) e locais da obra: torres e pavimentos da coluna Local do curto prazo.',
    keywords: [
      'semana 1',
      'numeração das semanas',
      'número da semana',
      'semana errada',
      'numeração automática',
      'local da obra',
      'endereço da obra',
      'coordenadas',
      'previsão do tempo',
      'clima',
      'tempo no pdf',
      'ver o tempo desta semana',
      'remover local',
      'locais da obra',
      'cadastrar locais',
      'onde cadastro os locais',
      'torre',
      'pavimento',
      'coluna local',
    ],
    screen: 'configuracoes',
    body: `## Numeração das semanas (semana 1)

A planilha do curto prazo numera as semanas como a planilha que a equipe já usava ("semana 113"). Essa numeração nasce da **semana 1 da obra**, definida aqui. Sem semana 1, a numeração é automática e começa na primeira semana que tiver linha na planilha.

O painel mostra a situação atual: "Semana 1: dd/mm a dd/mm. A semana atual (dd/mm a dd/mm) é a N." ou "Sem semana 1 definida".

### Definir

Quem não é Consulta vê o formulário, com dois jeitos de informar:

- **"Pelo número da semana atual"**: digite em "Número da semana de dd/mm a dd/mm" o número que a semana de hoje tem na planilha da obra (ex.: 113). O sistema conta para trás até achar a semana 1.
- **"Pela data da semana 1"**: em "Qualquer dia da semana 1", escolha qualquer dia daquela semana; vale a segunda-feira dela.

Antes de gravar, uma linha confirma: "Semana 1 será dd/mm a dd/mm; a semana atual passa a ser a N." Clique em **"Salvar semana 1"**: "Semana 1 salva. A planilha do curto prazo já usa a nova numeração." A mudança vale para toda a planilha, inclusive semanas antigas. **"Voltar à numeração automática"** apaga a semana 1 definida.

Se a planilha mostrar números diferentes dos da obra, é aqui que se corrige: confira qual número a semana atual deveria ter e salve pelo número.

## Local da obra

A cidade ou o endereço da obra, com as coordenadas. Dele saem a **previsão do tempo** nos PDFs de planejamento do curto prazo e o **tempo observado** no PDF de fechamento. Sem local, os PDFs saem sem a faixa do tempo (e a tela do curto prazo pode avisar "Informe o local da obra em Configurações da obra para o PDF trazer o tempo.").

O painel mostra "Local: nome (latitude, longitude)" ou "Não informado."

### Buscar e salvar

Quem não é Consulta vê o campo **"Buscar o local"** (ou "Trocar o local"). Digite a cidade ou o endereço (ex.: "Curitiba, PR", ou rua e cidade) e espere a lista "Lugares encontrados" aparecer, após "Buscando…". **Clicar num lugar da lista já salva** ("Local da obra salvo."). Também dá para colar coordenadas (ex.: "-25.43, -49.27").

- "Nenhum lugar encontrado. Tente rua e cidade, só a cidade, ou cole as coordenadas." Simplifique a busca ou use as coordenadas do mapa.
- "Não foi possível buscar o local agora. Tente de novo em instantes." O serviço de endereços não respondeu.

**"Remover local"** tira o local depois de confirmar; os PDFs voltam a sair sem o tempo até um novo local ser informado.

### Ver o tempo desta semana

Com local salvo, o botão **"Ver o tempo desta semana"** (disponível também para Consulta) mostra a semana atual dia a dia: "segunda · Chuva · 18/27 °C · 12 mm". Os dias já medidos aparecem com "(observado)". "Previsão do tempo indisponível no momento." indica falha passageira do serviço de clima.

## Locais da obra

Não confundir com o "Local da obra" acima (a cidade). Aqui ficam os **locais dentro da obra**: torres, pavimentos e áreas ("Térreo", "5º pavimento", "Cobertura"), de cima para baixo como o prédio. É uma lista só por obra: ela dá as opções da coluna **"Local"** do curto prazo (e o filtro de local do PDF) e o eixo vertical da **Linha de Balanço** da aba 1.1, que abre a mesma lista em "Locais da obra".

O painel mostra os locais do topo para a base e a contagem, ou "Nenhum local cadastrado. Sem locais, a coluna Local do curto prazo fica travada."

### Cadastrar, renomear, ordenar e excluir

Quem não é Consulta clica em **"Cadastrar locais"** (ou "Cadastrar e ordenar locais", quando já há algum). Abre a gaveta "Locais da obra":

- **Cadastrar**: em "Cadastrar locais", um nome por linha, **da base ao topo**, e o botão "Cadastrar N locais". Os novos entram acima dos existentes. Nome repetido é recusado ("Já existe: …"); a obra aceita até 300 locais.
- **"Usar os locais dos vagões"** preenche a caixa com os locais do planejamento dos vagões, em ordem de altura, pulando os que já existem.
- **Renomear**: edite o nome na própria lista; grava ao sair do campo. O nome novo aparece em todas as linhas do curto prazo.
- **Ordenar**: as setas sobem e descem o local.
- **Excluir**: a lixeira, depois de confirmar. As linhas do curto prazo que usavam o local ficam sem local. Local com blocos na Linha de Balanço não pode ser excluído (o aviso diz quantos blocos).

Consulta vê a lista, mas não edita ("Seu perfil permite consulta aos locais.").

## Quem pode alterar e avisos

Planejador, gestor e admin com a obra liberada alteram a semana 1 e o local; Consulta só vê ("Seu perfil permite consulta ao local da obra."). Se aparecer um aviso amarelo pedindo para aplicar uma **migração**, a função ainda não está habilitada no banco: avise quem mantém o sistema. "Não foi possível ler a configuração. Atualize a página para tentar de novo." é falha de leitura momentânea.`,
  },
  {
    id: 'navegacao-geral',
    title: 'Navegação: lateral, abas, cabeçalho, ajuda, modo reunião e celular',
    summary:
      'Onde fica cada coisa: lateral com o Dashboard, os grupos 1 Prazo, 2 Controles de obra e 3 SST e o Apoio, trilha, "Como usar", Claudia, modo reunião, celular.',
    keywords: [
      'onde fica',
      'menu',
      'lateral',
      'aba 4',
      'aba 1.3',
      '1.3',
      'grupos do menu',
      'prazo',
      'controles de obra',
      'sst',
      'numeração das abas',
      'quadro de restrições',
      'planejamento de vagão',
      'como funciona',
      'como usar',
      'tour',
      'botão de ajuda',
      'interrogação',
      'modo reunião',
      'zoom',
      'texto maior',
      'celular',
      'sem resposta do servidor',
      'atualizar',
    ],
    screen: 'geral',
    body: `## A lateral

No computador, a barra azul à esquerda é o menu. De cima para baixo:

- Os logos e **"Obra 360"**: voltam à lista de obras.
- **"Empreendimentos" → "Obras"**: a lista de obras.
- Dentro de uma obra, o **nome da obra**, o **0 Dashboard da obra** no topo e três grupos numerados (desde 12/11/2026): **"1 · Prazo"**, com **1.1 Cronograma de longo prazo**, **1.2 Cronograma de médio prazo**, **1.3 Cronograma de curto prazo** e **1.4 Quadro de Restrições**; **"2 · Controles de obra"**, com **2.1 Terminalidade**, **2.2 Histograma de mão de obra** e **2.3 Controle de produtividade**; e **"3 · SST"**, com **3.1 Vistoria de segurança** e **3.2 Checklist de equipamentos**. Abaixo, o grupo **"Apoio"**: **Modelo federado**, **Arquivos IFC**, **Dívidas**, **Integrações** e **Configurações da obra**. Só aparecem as abas e os itens liberados para você; os números não mudam.
- O **Planejamento de vagão** não está mais na lateral: abre pelo botão "Planejamento de vagão" dentro da aba 1.1, para quem tem o módulo Vagões.
- Números antigos (até 12/11/2026): 1 = 1.1; 2 = 1.4 (o quadro, antes "Lista de pendência") e o botão da 1.1 (o vagão); 3 = 1.2; 4 = 1.3; 5 = 2.1; 6 = 3.1; 7 = 2.2; 8 = 2.3; 9 = 3.2.
- **"Administração"** (só admin): **"Configurações"** e **"Agente de IA"**.
- Embaixo, o cartão com suas iniciais, nome e papel e o botão **"Sair do sistema"**.

**"Recolher menu"**, no canto da lateral, deixa só os ícones; "Expandir menu" a traz de volta.

## O cabeçalho

A barra fixa no topo mostra a **trilha** "Obras › nome da obra › aba": "Obras" leva à lista; o nome da obra, à aba inicial dela. À direita:

- **Claudia** (ícone de brilho): a assistente de planejamento, nas telas da obra; para administradores, em toda tela, numa janela que não bloqueia a página (Ctrl+J / ⌘J). Responde perguntas sobre os três prazos e propõe edições que só são gravadas quando você clica em "Aplicar". Veja a seção da assistente.
- **"Modo reunião"** (ícone de apresentação): aumenta o texto do sistema inteiro um degrau, para o projetor da sala. Fica aceso quando ligado, vale em todas as telas e a escolha fica neste navegador.
- **"Como usar"** ("?"): o tour da tela, descrito abaixo.

Cada aba abre com o mesmo cabeçalho: o número da aba num quadrado, "Aba N · código · nome da obra" (por exemplo, "Aba 1.3"), o título, uma linha do que a aba responde e o **"Como funciona"** (interrogação pequena), que abre a explicação longa da tela. Fecha com Esc ou clicando fora. Painéis dentro das telas podem ter o próprio "Como funciona".

## O tour "Como usar"

Escurece a tela e destaca, um por vez, cada botão e campo visível, com um cartão que diz o que ele faz. Use **"Próximo"**, **"Voltar"**, **"Concluir"** no fim, ou **"Sair do tour"** (ou Esc). O cartão conta "Passo X de N". **Nada é alterado durante o tour.** Ele mostra só o que existe na sua tela: botões que seu papel não tem e seções fechadas ficam de fora. Mudar de tela encerra o tour; o botão some em telas sem tour.

## No celular

A lateral desaparece. O botão de menu (três traços) abre a mesma lateral numa gaveta, com abas, Apoio, perfil e "Sair do sistema"; navegar fecha a gaveta. Dentro de uma obra, uma **faixa de abas** sob o cabeçalho traz o número e o nome curto de cada aba liberada ("1.3 Curto prazo") e rola de lado. A trilha mostra só a página atual.

## Atualização dos dados e aviso de conexão

Os dados se atualizam sozinhos: a cada 5 minutos com a aba visível, ao voltar à aba depois de meio minuto fora e depois de cada gravação sua, o sistema confere se alguém gravou algo e, só então, baixa os dados de novo. Numa reunião, duas pessoas veem o mesmo sem apertar F5.

Se uma recarga falhar, aparece uma faixa amarela sob o cabeçalho: **"Sem resposta do servidor. Mostrando os dados de há N min."** Os dados continuam válidos, mas podem estar desatualizados; **"Tentar de novo"** força a recarga, e a faixa some na próxima que der certo. Sessão expirada volta à tela de login e, depois, à mesma página.

Avisos de sucesso somem sozinhos; os de erro ficam até serem fechados. Nas confirmações (excluir, remover), Esc cancela.`,
  },
];
