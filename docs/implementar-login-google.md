# Implementar login com Google

Guia para quem vai montar "Entrar com Google" num projeto do zero. Independente de cliente, de domínio e de negócio.

A tela em si é um botão — meia hora de trabalho. O que consome o dia é a configuração em dois painéis que não conversam entre si, e um punhado de erros cujas mensagens não dizem o que está errado. Este documento é sobre essa parte.

## O que você está montando

Fluxo **Authorization Code com PKCE**. Em ordem: o usuário clica no botão; você o manda para o Google com o seu `client_id` e uma URL de retorno; ele escolhe a conta; o Google devolve um **código** de uso único para essa URL; o seu **servidor** troca o código por tokens; você cria a sessão.

Três coisas que decorrem disso e evitam metade dos erros:

- A troca do código por token acontece **no servidor**. O `client_secret` nunca vai para o navegador, nem em variável `NEXT_PUBLIC_`, nem em bundle.
- Quem recebe o código é **uma URL exata**, registrada de antemão. Não é "o seu site": é uma string.
- O Google não sabe nada sobre autorização dentro do seu produto. Ele responde "é fulano, e o e-mail é este". Quem decide o que fulano pode fazer é você.

## Passo 1 — Google Cloud Console

Vá em **console.cloud.google.com** e selecione ou crie um projeto. Tudo abaixo vive dentro de um projeto do Google Cloud; credencial criada no projeto errado é causa comum de `invalid_client`.

> O Google vem renomeando essas telas (a antiga "Tela de consentimento OAuth" virou "Google Auth Platform", com as abas Branding, Audience e Clients). Se os nomes abaixo não baterem, procure o equivalente em vez de confiar no rótulo: o conteúdo a preencher é o mesmo.

### 1.1 Tela de consentimento

É o que o usuário lê na hora de autorizar. Você escolhe o **tipo de público**:

- **Externo** — qualquer conta Google pode iniciar o login. É o que você usa em produto aberto, e também em produto fechado cujo controle de quem entra é feito por você, no servidor.
- **Interno** — só contas da organização Workspace dona do projeto. O Google barra o resto antes de chegar até você. Só existe se o projeto pertencer a um Workspace, e não é uma opção para produto com usuário externo.

Preencha nome do app, e-mail de suporte e contato do desenvolvedor. Logo e domínio só importam se você for pedir verificação.

### 1.2 Escopos

Para login, peça exatamente três: `openid`, `email`, `profile`. Eles são não sensíveis e **não exigem verificação** do Google.

No instante em que você acrescentar qualquer coisa além disso — Drive, Calendar, Gmail, contatos —, o app entra na fila de verificação, com revisão que leva semanas e pede vídeo de demonstração e política de privacidade publicada. Se você só quer saber quem é a pessoa, não peça mais que os três.

### 1.3 Status de publicação

Enquanto o app estiver em **Testing**, só as contas listadas em **Test users** conseguem entrar — no máximo 100 — e quem não estiver na lista recebe "Access blocked". É a explicação de quase todo "funciona na minha conta e falha na do cliente".

Passar para **In production** abre para qualquer conta. Com apenas os escopos de login, essa mudança não exige verificação.

### 1.4 Credencial

**Credenciais → Criar credenciais → ID do cliente OAuth → Aplicativo da Web**. Dois campos importam:

- **Origens JavaScript autorizadas** — a origem do seu app: `http://localhost:3000` no desenvolvimento, `https://seudominio.com` em produção. Só esquema, host e porta, sem caminho e sem barra no fim.
- **URIs de redirecionamento autorizados** — a URL exata que recebe o código. Veja o passo 2 antes de preencher, porque é aqui que quase todo mundo erra.

Você sai com **Client ID** e **Client Secret**. O secret é de servidor.

## Passo 2 — para onde aponta o redirect URI

A pergunta que decide o campo: **quem troca o código por token?**

- **Você usa um provedor de auth** (Supabase, Auth0, Clerk, Firebase, Cognito): quem troca é o provedor. O redirect URI é a URL **dele**, não a sua. No Supabase é `https://<project-ref>.supabase.co/auth/v1/callback`. A sua própria rota de callback é configurada dentro do provedor, e o Google nem fica sabendo dela.
- **Você mesmo implementa**: o redirect URI é a sua rota, algo como `https://seudominio.com/auth/callback`.

Registre **uma entrada para cada ambiente**: localhost, preview e produção. Se o seu host cria URL nova a cada deploy de preview, use um domínio estável para o preview, porque não dá para registrar curinga.

`redirect_uri_mismatch` significa comparação de string, caractere a caractere: `http` × `https`, com porta × sem porta, `/callback` × `/callback/`, `www` × sem `www`. Não há aproximação.

## Passo 3 — o painel do provedor, se houver

Com Supabase, por exemplo, são três lugares — e os três precisam estar certos:

1. **Authentication → Providers → Google**: habilite e cole Client ID e Client Secret. A tela mostra a callback URL dele; é essa que vai no passo 1.4.
2. **Authentication → URL Configuration**: `Site URL` e a lista de **Redirect URLs** permitidas. É uma lista de permissão de para onde você pode devolver o usuário depois do login; URL fora dela é silenciosamente trocada pela Site URL, e o sintoma é "o login funciona mas sempre cai na home".
3. As chaves no seu app: a URL do projeto e a chave anônima no cliente; a **service role**, se existir, só no servidor.

## Passo 4 — o código

A tela é um botão. Não há campo de e-mail, não há senha, não há "esqueci minha senha" — e não coloque nenhum dos três, porque eles sugerem um caminho que não existe.

O que precisa existir:

- **A ação do botão**, no servidor, que monta a URL do Google e redireciona. É onde você passa a URL de retorno e parâmetros opcionais como `prompt=select_account`, que força a pergunta "qual conta?" em vez de reaproveitar a última — útil para quem tem conta pessoal e de trabalho no mesmo navegador.
- **A rota de callback**, que recebe o código, troca por sessão e redireciona para o destino. Trate o caso de chegar sem código: alguém abrindo a URL na mão não pode derrubar a aplicação.
- **Proteção de rota** (middleware ou equivalente), que separa dois comportamentos: página sem sessão **redireciona** para o login, guardando o destino (`/login?redirect=/pagina/que/ele/queria`); rota de API sem sessão devolve **401 em JSON**. Se você redirecionar a API, o front recebe HTML onde esperava dados e o erro sai irreconhecível.
- **Uma exclusão cuidadosa no matcher do middleware**: arquivos estáticos, o próprio `/login` e a rota de callback. Esquecer o callback cria um laço de redirecionamento; esquecer um estático faz o navegador receber a página de login no lugar de um `.wasm` ou de uma fonte, e o erro não diz nada sobre sessão.

## Restringir quem entra, por domínio ou por lista

O erro mais comum, e o mais caro, está aqui.

O parâmetro **`hd=seudominio.com` é apenas uma dica de interface**: ele filtra o seletor de contas do Google. Ele **não impede nada**. Qualquer pessoa que monte a URL na mão completa o fluxo com qualquer conta.

Se a regra importa, ela é verificada **no servidor, depois da troca do código**:

1. Leia o e-mail do usuário autenticado.
2. Confira o que a sua regra exige — sufixo de domínio, lista de permissão, registro na sua tabela.
3. Se não passar, **encerre a sessão** e devolva ao login com a explicação. Não basta esconder a interface: a sessão precisa morrer.

Se você usa provedor e ele expõe o ID token, dá para conferir também `email_verified`. Em implementação manual, valide o ID token de verdade: assinatura contra as chaves públicas do Google (JWKS), `iss`, `aud` igual ao seu client ID, e `exp`. Não decodifique o JWT sem verificar a assinatura — um JWT não verificado é um texto que o usuário escolheu.

A alternativa de barrar no Google é a tela de consentimento **Interna**, que só existe para Workspace e vale só para a organização dona do projeto.

## Depois do login: entrar não é ter acesso

O Google responde quem é a pessoa. O que ela pode ver e fazer é seu.

Decida desde o começo o que acontece no **primeiro login de alguém desconhecido**, porque o silêncio aqui vira chamado de suporte:

- Criar o perfil automaticamente com o papel mais fraco, sem acesso a nada, e deixar a liberação para um administrador. A tela precisa **dizer** que está vazia porque falta liberação, senão parece defeito.
- Ou recusar quem não foi convidado antes, com mensagem que diga a quem pedir acesso.

E resolva o problema do primeiro administrador: numa instalação nova não existe ninguém para liberar o primeiro acesso. As saídas são um usuário semeado na migração, uma variável de ambiente com o e-mail que nasce admin, ou um comando de linha. Escolha uma conscientemente — a que cria o admin no primeiro login de um e-mail específico precisa valer **uma vez só**.

## Erros comuns

| Sintoma | Causa |
| --- | --- |
| `redirect_uri_mismatch` | A URL de retorno não está registrada, ou difere por esquema, porta, barra final ou `www` |
| `Access blocked: app has not completed verification` | App em Testing e a conta não está em Test users; ou você pediu escopo sensível |
| `invalid_client` | Client ID/secret de outro projeto, secret vencido, ou secret exposto e revogado |
| Login funciona e sempre cai na home | Destino fora da lista de Redirect URLs do provedor |
| Laço infinito entre `/login` e a aplicação | O middleware está protegendo a própria rota de callback ou a de login |
| Sessão some ao recarregar | Cookie não persistido: faltou repassar os cookies na resposta do middleware, ou `Secure` em http, ou domínio diferente entre origem e API |
| Funciona local e falha em produção | Origem/redirect de produção não registrados, ou o app monta a URL de retorno a partir de um host errado atrás do proxy (use os cabeçalhos `x-forwarded-*`) |
| Não vem refresh token | Só é emitido com `access_type=offline` e no primeiro consentimento; para repetir, `prompt=consent` |

## Antes de dizer que está pronto

- Entrar em **localhost e em produção**, cada um com a sua origem e o seu redirect registrados.
- Status de publicação coerente com quem precisa entrar.
- A regra de domínio ou de lista aplicada **no servidor**, testada com uma conta que deve ser recusada.
- `client_secret` fora do bundle do cliente — procure por ele no JavaScript servido.
- Sessão expirada devolvendo o usuário **à página que ele tentou abrir**, e 401 JSON nas rotas de API.
- O primeiro login de um usuário novo terminando numa tela que explica o que fazer em seguida, não numa lista vazia sem justificativa.
