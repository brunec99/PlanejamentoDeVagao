# Como entrar no sistema com a conta Google

O Planejamento Vagão não tem senha própria. Quem decide se você entra é o Google, com a **conta da ATR**, e o sistema apenas confere o resultado. Não existe cadastro a preencher, e não há senha para esquecer ou para pedir de volta.

## O que você precisa

Uma conta **@atrincorporadora.com.br** ou, desde 28/10/2026, **@taktengenharia.com.br** (equipe da Takt Engenharia). Conta Gmail pessoal não serve, mesmo que seja a sua e mesmo que você use o mesmo computador: o sistema recusa qualquer endereço fora desses dois domínios.

Desde 08/10/2026 você também precisa **ter sido cadastrado** por um administrador. O sistema passou a dividir o banco e o login com o Takt Hub, e o cadastro aberto fica desligado. Ter conta da ATR não basta mais: se o seu e-mail não estiver cadastrado, o login é recusado com uma mensagem dizendo isso.

## Entrar, passo a passo

1. Abra o endereço do sistema. Se você não estiver logado, ele leva direto para a tela **Acesso ao sistema**.
2. Clique em **Entrar com Google**.
3. O Google pergunta **com qual conta** você quer entrar — ele pergunta toda vez, de propósito, porque muita gente tem a conta da empresa e a pessoal abertas no mesmo navegador. A lista mostra só contas de empresa (Google Workspace). Escolha a da ATR ou a da Takt.
4. Pronto. O sistema devolve você para a página que você tentou abrir. Se você entrou pela porta da frente, cai na lista de obras.

Não é preciso repetir isso todo dia: a sessão fica guardada no navegador. Ela expira depois de um tempo parado, e aí o sistema pede o login de novo e **volta para a mesma página** em que você estava.

## No primeiro acesso você não vê obra nenhuma — e está certo

Entrar e ver acesso são coisas diferentes. O cadastro dá o papel, e as obras são liberadas à parte. Se o administrador ainda não liberou nenhuma, a tela de obras aparece vazia.

Isso não é erro nem falha de configuração: é a regra. O cadastro garante que você entra; **quem libera obra é um administrador**. Fale com quem administra o sistema e diga quais obras você precisa ver. É um clique do lado dele.

## Quando aparecer uma mensagem de erro

A tela de login mostra o motivo em vermelho. O que cada um quer dizer:

| Mensagem | O que aconteceu | O que fazer |
| --- | --- | --- |
| **Apenas contas @atrincorporadora.com.br ou @taktengenharia.com.br podem acessar este sistema** | Você entrou com uma conta pessoal ou de outro domínio | Clique em Entrar com Google de novo e escolha a conta da ATR ou da Takt. Se o Google não perguntar, saia da conta pessoal ou use uma janela anônima |
| **Falha ao entrar com Google. Tente novamente** | A volta do Google não completou — normalmente rede instável ou a janela ficou aberta tempo demais | Tente de novo. Se insistir, feche a aba e abra o endereço outra vez |
| **Login incompleto. Tente novamente** | O endereço de retorno foi aberto direto, sem passar pelo Google | Comece pela tela de login, clicando no botão |
| **Seu e-mail ainda não foi cadastrado no Obra 360** | O e-mail não tem cadastro, ou o seu perfil foi excluído | Peça o cadastro a um administrador e entre de novo com o Google |
| **Convite inválido ou expirado** | Link de um convite antigo por e-mail (até 07/10/2026) | Ignore o link e entre com a conta Google, se já estiver cadastrado |
| **Não foi possível provisionar seu acesso. Contate um administrador** | O Google aprovou, mas o sistema não conseguiu criar o seu perfil | Avise um administrador: é problema do sistema, não seu |
| **Perfil não provisionado. Contate o gestor** | Sua sessão existe, mas o perfil não | Mesmo caso acima: avise o administrador |
| **Sessão expirada. Faça login novamente** | Você ficou muito tempo parado | Entre de novo; o sistema devolve você para a mesma página |
| **Você não tem acesso a esta obra** | A obra existe, mas não foi liberada para você | Peça a liberação a um administrador |
| **Seu perfil permite apenas consulta** | Você está como Consulta e tentou alterar algo | Peça a mudança de papel a um administrador |

## Trocar de conta ou sair

Use **Sair** no menu do sistema. Isso encerra a sessão aqui — e só aqui: a sua conta Google continua aberta no navegador. Para entrar com outra conta, clique em Entrar com Google e escolha a outra na lista que o Google mostra.

Se você errou a conta e o Google parou de perguntar qual usar, saia da conta errada no próprio Google (ou abra uma janela anônima) e comece de novo.

## Para quem administra o acesso

A engrenagem no topo leva a **Configurações**, visível apenas para quem é **Admin**. Lá ficam três coisas:

**Liberar obra.** Cada usuário tem uma lista de obras. Marcar libera, desmarcar tira — e o efeito é imediato, inclusive para quem está com a tela aberta. A autorização é conferida no servidor a cada ação, não só ao montar a tela.

**Papel.** São quatro, e a diferença é o que a pessoa pode fazer:

- **Consulta** — vê e não altera nada. É o papel de quem entra pela primeira vez.
- **Planejador** — planeja: cria e edita vagões, atividades, planos e planilhas.
- **Gestor** — tudo do planejador, mais três coisas: cadastrar obra, reabrir vagão já terminal (com justificativa registrada) e liberar excepcionalmente.
- **Admin** — tudo o que o Gestor pode, mais administrar pessoas e acessos nesta tela. Até 01/10/2026 o Admin só administrava acessos e não cadastrava obra; o usuário decidiu que ele herda o Gestor, porque o perfil forte da instalação é o Admin e ninguém mais cadastrava obra. A regra está em `actsAsManager` (`src/domain/rules.ts`), usada pelo servidor e pela tela.

**Cadastrar usuário** (desde 08/10/2026, no lugar de "Convidar por e-mail"). O cadastro é **obrigatório**: só entra quem foi cadastrado. Ele cria o perfil com o papel escolhido e **não envia e-mail**, porque o modelo de e-mail do projeto é o do Takt Hub. Avise a pessoa para entrar com a conta Google do mesmo e-mail. Se ela já tem conta no Takt, a mesma conta é reaproveitada. Depois do cadastro, ainda é preciso liberar as obras: o cadastro dá o papel, não o acesso.

**Excluir usuário** tira apenas o acesso ao Obra 360. A conta de login continua valendo no Takt Hub. Para voltar, a pessoa precisa ser cadastrada de novo.

## O primeiro administrador

Numa instalação nova não existe ninguém para liberar o primeiro acesso. Por isso há uma exceção, uma única: o primeiro login de **bruno.engenharia@atrincorporadora.com.br** cria o perfil já como **Admin**, com acesso a todas as obras cadastradas. Qualquer outra conta precisa do cadastro feito por um admin. Essa exceção vale só para o primeiro login dessa conta; ela não reabre nem se repete depois.

## O que o sistema não faz

Não cria senha e não envia "esqueci minha senha". **Atualizado em 13/11/2026:** conta de fora dos dois domínios (ATR e Takt) passou a entrar quando um admin a cadastra como conta externa (ver "Contas externas", no fim); até então não entrava "nem para visita, nem para cliente, nem temporariamente". Quem precisa ver a obra precisa de uma conta da ATR ou da Takt. Para liberar outro domínio, é uma linha em `ACCESS_DOMAINS` (`src/application/access-request.ts`), seguida de deploy. Se a conta Google de alguém for desativada pela empresa, o acesso ao sistema cai junto, sem nenhum passo adicional aqui.

## "Faço login e volto para a tela de login" (23/09/2026)

Quando o endereço de retorno (`https://<site>/auth/callback?...`) não está na lista **Redirect URLs** do Supabase, o Supabase devolve o código do login para o **Site URL**. Até esta data, o código chegava numa página que não sabia usá-lo e a pessoa voltava ao login sem mensagem nenhuma. Agora o middleware (`src/proxy.ts`) e a página de login encaminham qualquer `?code=` para `/auth/callback`, e o login conclui mesmo nesse caso. Se o código for inválido, aparece a mensagem "Falha ao entrar com Google".

Ainda assim, a configuração certa no Supabase (**Authentication → URL Configuration**) é:

- **Site URL:** `https://obra360-atr.vercel.app`
- **Redirect URLs:** `https://obra360-atr.vercel.app/**` e, para testes locais, `http://127.0.0.1:3000/**`.

O desvio foi validado localmente com um código falso. O login completo com Google precisa ser confirmado pelo usuário no navegador.

## "Entro com o Google e cai numa página que não abre" (11/11/2026)

Apareceu quando o sistema saiu da Vercel para o servidor da ATR (10/11/2026). O login concluía, mas a última etapa (`/auth/callback`) mandava o navegador para `https://0.0.0.0:3000/obras`, que não existe: aparecia a página de erro do navegador, e abrir o endereço do sistema de novo funcionava, porque a sessão já estava gravada.

A causa: fora da Vercel, o Next monta `request.nextUrl` com o endereço em que o servidor escuta, não com o endereço que a pessoa digitou. O retorno do login era o único redirecionamento absoluto montado a partir dele. Agora ele usa o endereço público da requisição (`publicOrigin`, em `src/infrastructure/public-origin.ts`), e o link do e-mail de pendência também, que saía com o mesmo endereço interno. O endereço vem do cabeçalho `Host`; com a variável `PUBLIC_SITE_URL` definida no servidor (opcional, recomendada fora da Vercel), vale sempre o endereço dela, e o link do e-mail deixa de depender do que a requisição informa.

**Por que algumas pessoas caíram no Takt Hub.** Quem apertava "voltar" na página de erro repetia a volta do Google com um código que já tinha sido usado. O Supabase recusa (`OAuth state not found or expired`) e, como nesse erro ele não sabe mais de qual sistema o login partiu, devolve a pessoa para o **Site URL** do projeto, que é o do Takt Hub. O desvio não leva dado de um sistema para o outro: é o destino padrão de erro de um login dividido entre os dois. O que a pessoa vê ao chegar lá depende das permissões do próprio Takt Hub. Com a correção acima a página de erro deixa de aparecer; o desvio para o Takt Hub ainda pode acontecer em qualquer login repetido ou expirado, enquanto os sistemas dividirem o mesmo projeto.

## "No celular, toco em Continuar com o Google e nada acontece" (11/11/2026)

Aparecia depois de um login interrompido: a pessoa tocava no botão, voltava da tela de contas do Google e, a partir daí, o botão não respondia mais até recarregar a página. Nos registros do Supabase isso aparece como chamadas `POST /auth/v1/authorize` recusadas com 405, vindas de Android.

A causa: o botão era uma ação de servidor que terminava num `redirect()` para o Supabase. O roteador do Next guarda esse endereço externo como a página atual antes de sair; se a saída não se completa e a página continua viva, o toque seguinte envia a ação para o endereço guardado, o do Supabase, em vez do sistema.

Agora o botão é um formulário comum que abre `/login/google` (`src/app/login/google/route.ts`), e esse endereço é quem monta o pedido ao Google. Não passa pelo roteador: cada toque é um pedido novo. O teste de fumaça confere o formulário e o destino.

## Acesso local sem login, temporário (25/09/2026)

A pedido do usuário, para facilitar testes, o sistema pode pular o login do Google **apenas localmente**. Com `DEV_AUTH_BYPASS_PROFILE_ID=<id do perfil>` no `.env.local`, o `next dev` entra direto com aquele perfil: o middleware deixa passar e o `getRouteProfile` devolve o perfil indicado (`src/infrastructure/auth/dev-bypass.ts`). Há duas travas. A variável só vale com `NODE_ENV=development` e é ignorada sempre que `VERCEL` estiver definida, então **o site publicado continua exigindo o Google**, mesmo que alguém configure a variável lá. Remover produção do login foi descartado: exporia dados reais e apagaria o registro de quem alterou o quê.

Para voltar ao normal, apague a linha do `.env.local`. A retirada do código fica para quando o usuário pedir a volta do login também localmente.

## Contas externas (13/11/2026)

Pedido do usuário em 13/11/2026: dois contatos com Gmail (de uma empresa parceira) não conseguiam se cadastrar. O sistema recusava qualquer conta de fora de `@atrincorporadora.com.br` e `@taktengenharia.com.br`; ele pediu para mudar.

- **Regra:** conta de fora dos dois domínios entra **só se um admin a cadastrou** em Configurações → Usuários. O cadastro é a lista de exceções; não há tabela nem migração nova.
- **Cadastro:** ao digitar um e-mail de fora, o formulário mostra a confirmação "conta externa", e o botão só libera com ela marcada. A rota `POST /api/admin/invite` recusa e-mail de fora sem `external: true`, para um erro de digitação no domínio não virar acesso de terceiro.
- **Login:** o retorno do login (`src/app/auth/callback/route.ts`) aceita a conta de fora quando ela já tem perfil. Sem perfil, é recusada como antes e **não** recebe o cartão de "Solicitar acesso": o pedido de acesso continua só para os dois domínios.
- **O que a conta externa vê:** o mesmo que qualquer usuário do papel dela, só nas obras e nos módulos liberados. Não há marca de "externo" no perfil (`profiles` não guarda e-mail).
- **Arquivos:** `isExternalEmail` em `src/application/access-request.ts`, `src/app/api/admin/invite/route.ts`, `src/app/auth/callback/route.ts`, `InviteForm` em `src/modules/configuracoes/settings-manager.tsx`, manual da Claudia (`acesso-configuracoes.ts`), `tests/access-request.test.ts`.
- **Fora do sistema, não verificado:** o endereço público fica atrás do Cloudflare Access, que só manda o código para e-mails da política dele; os endereços externos precisam entrar lá também. E a tela de consentimento do Google do projeto precisa aceitar contas de fora da organização (tipo "Externo"); se estiver como "Interno", o Google recusa o Gmail antes de chegar ao sistema.
- **Validação:** teste novo em `tests/access-request.test.ts`; CI inteiro na máquina. O login real de uma conta Gmail não foi exercitado.
