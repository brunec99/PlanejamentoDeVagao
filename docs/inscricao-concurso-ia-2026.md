# Inscrição no 3º Concurso IA em Construção (ATR) — Obra 360

Roteiro para o Claude no Chrome preencher o formulário de inscrição (que gera o card no Pipefy de IA da ATR). O regulamento de referência é a versão 3.1, de 11/09/2026. Este texto foi montado em 16/10/2026 com base no repositório e na documentação do projeto.

---

## Instruções para o Claude no Chrome

1. **Não envie o formulário.** Preencha todos os campos e pare antes do botão de envio. O Bruno revisa e envia.
2. **Não invente números nem fatos.** O regulamento (seção 11) prevê desclassificação por informação falsa. Onde este arquivo tiver `[CONFIRMAR: ...]`, pare e pergunte ao Bruno. Não preencha com valor aproximado por conta própria.
3. **Mapeie pelo sentido.** Os nomes dos campos do formulário podem ser diferentes dos títulos abaixo. A ordem segue a seção 5 do regulamento: Identificação, Impacto (35%), Implementação (25%), Viabilidade (15%), Inovação (10%), Aplicabilidade (10%), Estruturação (5%).
4. **Campos de escolha:** use a opção indicada em "Selecionar". Se a opção exata não existir, escolha a mais próxima e avise.
5. **Anexos:** você não tem os arquivos. Quando o campo pedir upload, avise o Bruno qual arquivo da lista "Índice de evidências" vai ali.
6. **Limite de caracteres:** se um campo cortar o texto, encurte mantendo os números e as datas, e avise.
7. **Campo que não aparece aqui:** pergunte ao Bruno. Não deixe em branco, porque o sistema bloqueia o envio.

---

## Pendências do Bruno antes de preencher

Itens que só você sabe ou precisa decidir. O Claude no Chrome vai perguntar por eles.

- [ ] Setor e contato interno (ramal/WhatsApp).
- [ ] Obras onde o curto prazo está em uso hoje, além da Blentt, e número de usuários cadastrados no Obra 360.
- [ ] Tempo gasto hoje por semana, por obra, para montar o planejamento de curto prazo no Sheets, fechar a semana e calcular o PPC. Perguntar ao Daniel e ao Pedro (planejadores da Blentt) é a fonte mais defensável.
- [ ] Tempo gasto hoje para manter a planilha de pendências de terminalidade (vistoria, fotos, cobrança do empreiteiro).
- [ ] Custo-hora médio de planejador/engenheiro para a memória de cálculo (pedir ao RH ou usar o valor de referência que a ATR adota).
- [ ] Custos mensais das plataformas: Vercel (plano do Obra 360), Supabase Pro da organização ATR (o projeto é dividido com o Takt Hub), assinatura do Claude usada no desenvolvimento e consumo previsto da API da Anthropic para o botão "Analisar com IA".
- [ ] Se a chave `ANTHROPIC_API_KEY` já foi definida na Vercel. Até 11/10/2026 não estava, e sem ela o botão "Analisar com IA" só avisa que não está configurado.
- [ ] Gravar um vídeo curto (3 a 5 min) e tirar prints. O Tiago é avaliador externo e o login exige conta @atrincorporadora.com.br cadastrada, então ele provavelmente não consegue entrar no sistema.
- [ ] Decidir se cadastra Gabriel e Rafael como "Consulta" na obra Blentt para avaliarem no próprio sistema.

---

## 5.1 Identificação da proposta

**Participante:** Bruno Lacerda Santos
**Setor:** `[CONFIRMAR: setor]`
**Contato interno:** bruno.engenharia@atrincorporadora.com.br · `[CONFIRMAR: ramal/WhatsApp]`

**Nome da iniciativa:** Obra 360 — sistema de planejamento e controle de obras da ATR, construído com IA

**Área ou processo beneficiado:** Engenharia de obras. Planejamento de curto, médio e longo prazo (Last Planner, PPC, takt por vagões, Linha de Balanço), fechamento semanal com as causas de não cumprimento e a lista de pendências de terminalidade das unidades.

**Resumo executivo:**
O Obra 360 substitui as planilhas do Google Sheets usadas no planejamento das obras por um sistema web único, com login Google da ATR, em `https://obra360-atr.vercel.app`. Ele reúne em cinco abas por obra:
1. o cronograma de longo prazo (fluxograma que se expande em Linha de Balanço);
2. o planejamento por vagões (takt);
3. o cronograma de médio prazo no formato do MS Project, com motor de cálculo de caminho crítico próprio;
4. o curto prazo semanal, com compromissos, fechamento, PPC e causas;
5. a terminalidade (pendências por pavimento, apartamento e empreiteiro, com fotos de antes e depois e um modo de campo que funciona no celular sem sinal).

A IA atua em duas frentes. A primeira é o desenvolvimento: o sistema foi construído pelo participante, engenheiro e não programador, com agentes de IA (Claude Code), sem desenvolvedor contratado. A segunda está dentro do produto: o botão "Analisar com IA" lê as justificativas de não cumprimento e devolve os temas por causa, os padrões por empreiteiro e cinco ações recomendadas.

O curto prazo está em produção desde 08/10/2026 na obra Blentt, com o histórico de 116 semanas importado da planilha: 5.993 compromissos, de 29/07/2024 a 12/10/2026. A terminalidade está liberada a todos os usuários. Os demais módulos estão em teste com usuários selecionados.

**Papel do participante:**
Identifiquei o problema no dia a dia das obras, defini o escopo e as regras de negócio (Last Planner, takt, terminalidade, padrão do MS Project) e conduzi o desenvolvimento com agentes de IA, revisando cada entrega. Também cuidei da implantação: banco de dados no Supabase da ATR, login Google no projeto Google Cloud da empresa, migração do histórico da planilha da Blentt e cadastro dos usuários. Acompanho o uso com os planejadores da obra (Daniel e Pedro), cujo retorno de 09 a 11/10/2026 já gerou um ciclo de ajustes publicado. Não houve fornecedor nem desenvolvedor externo.

---

## 5.2 Impacto e resultados esperados — peso 35%

**Problema e consequência:**
O planejamento das obras vive em planilhas separadas por obra e por nível (curto prazo, pendências, cronogramas no MS Project). Isso tem quatro efeitos:
- **Retrabalho:** a mesma informação é copiada entre planilhas toda semana.
- **Indicadores frágeis:** o PPC e o Pareto de causas dependem de fórmulas que cada um mantém do seu jeito.
- **Sem rastreabilidade:** não se sabe quem alterou um compromisso ou uma pendência, nem quando.
- **Pendências sem evidência:** as pendências de terminalidade não têm foto de antes e depois amarrada ao item, o que dificulta cobrar o empreiteiro e comprovar a correção na entrega.

Na planilha da Blentt, por exemplo, 386 compromissos marcados como "Não" estavam sem causa, e 194 linhas tinham data ausente ou fora da semana indicada (157 sem data e 37 fora da semana). O Pareto de causas fica distorcido e o aprendizado semanal se perde.

**Cenário atual e baseline:**
- **Processo atual:** o planejador monta a semana no Sheets, apura Sim/Não com a equipe e calcula o PPC na própria planilha. As pendências de terminalidade ficam em outra planilha, e as fotos ficam no celular ou no WhatsApp.
- **Áreas e usuários:** engenharia de obra (engenheiros, planejadores, estagiários, mestres) e empreiteiros, como responsáveis pelas pendências.
- **Volume medido na Blentt** (fonte: planilha PCP-BLT.xlsx, aba "Curto prazo", conferida após a importação no banco):
  - 116 semanas e 5.993 compromissos, ou cerca de 52 por semana;
  - 4.081 Sim, 1.456 Não e 456 não apurados;
  - 205 equipes.
  - PPC histórico de cerca de 73,7%: 4.081 ÷ (4.081 + 1.456), só sobre as linhas apuradas.
- **Tempo gasto hoje:** `[CONFIRMAR: horas por semana por obra no curto prazo, fonte = planejadores]` e `[CONFIRMAR: horas por semana na planilha de pendências]`.
- **Obras e usuários:** `[CONFIRMAR: número de obras ativas e de usuários]`.

**Resultados esperados:**
- **Operacionais:** menos tempo para montar a semana e fechar o PPC. O fechamento passa a ser feito no próprio sistema, com filtros por empreiteiro e equipe e PDFs do planejamento e do fechamento prontos, com a previsão do tempo.
- **Qualidade da informação:** a causa passa a sair de lista fechada, com justificativa. Cada alteração fica registrada com autor e data, e as semanas encerradas são travadas para não-admins.
- **Gestão de empreiteiros:** padrões de não cumprimento por empreiteiro aparecem na análise com IA. As pendências ficam com foto de antes e depois e data de correção obrigatória para resolver.
- **Estratégicos:** um padrão único para todas as obras da ATR, com histórico preservado, e base de dados para comparar o desempenho entre obras e empreiteiros.

**Tempo e produtividade:**
- Tempo atual: `[CONFIRMAR: X h/semana/obra]`.
- Tempo futuro estimado: `[CONFIRMAR: Y h/semana/obra]`.
- Horas economizadas: (X − Y) × nº de obras × 4,33 semanas = `[CALCULAR]` h/mês.
- Marcar como **valor estimado** até a medição na Blentt.

**Custos, investimento e retorno:**
- **Investimento de desenvolvimento:** tempo do participante, mais a assinatura de IA usada no desenvolvimento, `[CONFIRMAR: R$/mês × meses]`. Não houve desenvolvedor contratado. Um sistema equivalente feito sob encomenda por um fornecedor custaria `[CONFIRMAR: buscar uma referência ou deixar como "não cotado"]`.
- **Custo recorrente:**
  - Vercel: `[CONFIRMAR]`.
  - Supabase Pro da ATR: já contratado e dividido com o Takt Hub, `[CONFIRMAR: parcela atribuível]`.
  - API da Anthropic para a análise com IA: `[CONFIRMAR]`, sob demanda, com no máximo 1.500 linhas por análise.
  - Previsão do tempo nos PDFs: hoje usa o plano gratuito do Open-Meteo. O uso comercial pede plano pago, `[CONFIRMAR]`.
- **Economia mensal:** horas economizadas × custo-hora `[CONFIRMAR]` = `[CALCULAR]`. Economia anual = mensal × 12.
- **Perdas evitadas (qualitativo):** retrabalho na entrega de unidades por pendência sem evidência e atrasos por restrição não tratada.
- **Prazo de retorno:** investimento ÷ economia mensal = `[CALCULAR]` meses.

**Indicadores e medição:**

| Indicador | Periodicidade | Responsável | Método |
| --- | --- | --- | --- |
| PPC semanal por obra | Semanal | Planejador da obra | Calculado pelo sistema a partir dos compromissos |
| % de "Não" com causa e justificativa | Semanal | Planejador | Fechamento do curto prazo (meta 100%; histórico da Blentt: 386 de 1.456 sem causa, cerca de 26,5%) |
| Tempo para montar e fechar a semana | Mensal | Bruno, com os planejadores | Cronometragem antes e depois na Blentt |
| Pendências abertas, resolvidas e tempo médio de correção | Semanal | Engenheiro da obra | Aba Terminalidade (datas de observação e correção) |
| Usuários ativos e obras no sistema | Mensal | Bruno (admin) | Cadastro de usuários e registros de alteração |

**Premissas e memória de cálculo:**
- PPC = compromissos cumpridos ÷ compromissos apurados (contagem de compromissos, não média de percentuais).
- Volume da Blentt = contagem conferida no banco depois da importação de 08/10/2026.
- Horas economizadas = (tempo atual − tempo no sistema) × obras × 4,33. As fontes são `[CONFIRMAR: entrevista com os planejadores / cronometragem]`.
- Economia = horas × custo-hora `[CONFIRMAR: fonte do custo-hora]`.

**Resultados já comprovados:**
- **Comprovado:** sistema em produção. O histórico completo da Blentt (116 semanas, 5.993 compromissos, 205 equipes) foi migrado sem perda e conferido no banco. As causas foram normalizadas por decisão da engenharia: os 386 "Não" sem causa receberam a causa "Causa não informada", sem inventar uma causa.
- **Comprovado:** uso real pelos planejadores da Blentt desde 08/10/2026. O retorno deles gerou um ciclo de melhorias publicado de 09 a 11/10/2026: fechamento em seção própria, classificação de uma vez, apontamento limpável, filtros e justificativas por causa.
- **Ainda não medido:** economia de horas e variação do PPC após a implantação. Serão medidas até 31/12/2026 e registradas na atualização final.

---

## 5.3 Nível de implementação e maturidade — peso 25%

**Estágio atual — selecionar:** Teste ou piloto (solução desenvolvida, em uso controlado numa obra).
Justificativa: o curto prazo e a terminalidade estão em produção, usados pela equipe da Blentt desde 08/10/2026. Os módulos de longo prazo, vagões e médio prazo estão desenvolvidos e liberados só para testadores. A meta é atingir a implantação plena (uso recorrente com resultados medidos) até 31/12/2026.

**Desenvolvimento realizado:**
- **Aplicação e infraestrutura:** aplicação web (Next.js e TypeScript) com banco Postgres no Supabase da ATR e publicação automática na Vercel (servidores em São Paulo). São cerca de 43,7 mil linhas de código e 103 versões publicadas entre 08/09 e 14/10/2026.
- **Qualidade:** testes automáticos de regra de negócio e uma bancada de 33 cenários que reproduz o cálculo do MS Project. Cada versão passa por verificação automática no GitHub (tipos, padrão de código, testes, migrações do banco, build e teste de fumaça) antes de ir ao ar.
- **Acesso e segurança:** login Google restrito à ATR, papéis (consulta, planejador, gestor, admin), acesso por obra, liberação de módulos por usuário e pedido de acesso na tela de login.
- **Módulos:**
  - **Curto prazo:** planilha semanal, fechamento, PPC, Pareto, PDFs.
  - **Terminalidade:** pendências com fotos comprimidas, edição em lote, modo de campo sem sinal.
  - **Médio prazo:** cronograma no padrão do MS Project, com agendamento automático, 8 tipos de restrição, prazo final e exportação .xml para abrir no Project.
  - **Longo prazo:** planejador com fluxograma e Linha de Balanço.
  - **Vagões:** takt, liberações e dívidas.
  - **Apoio:** modelo federado e repositório de arquivos IFC.
- **Integrações:** Prevision (leitura de obras e atividades) e importador do histórico das planilhas.
- **IA no produto:** análise das justificativas de não cumprimento com o Claude (Anthropic).

**Protótipo:** não se aplica como protótipo separado. A solução já é o sistema funcional em produção, em `https://obra360-atr.vercel.app` (o acesso exige conta ATR cadastrada; veja o vídeo e os prints anexos).
Limitações:
- O modo de campo da terminalidade foi testado em navegador simulado sem rede, mas ainda não em celular real.
- A análise com IA depende de configurar a chave da API `[CONFIRMAR situação]`.
- O modelo federado não detecta interferências.

**Testes ou piloto:**
- **Ambiente:** produção, obra Blentt.
- **Período:** desde 08/10/2026.
- **Participantes:** planejadores da obra (Daniel e Pedro) e `[CONFIRMAR: demais usuários]`.
- **Volume:** histórico de 5.993 compromissos e as semanas correntes.
- **Falhas e ajustes:** o retorno de 09 a 11/10 pediu o fechamento em seção própria, a classificação de uma vez, a ordem de inclusão das linhas, a possibilidade de limpar o apontamento, filtros e justificativas por causa. Tudo foi corrigido e publicado.
- **Outros ajustes:**
  - o volume de dados recarregado estourava o consumo do banco, e a tela passou a recarregar só quando há mudança;
  - um usuário com módulo liberado via a tela vazia, e isso foi corrigido.

**Implantação e uso real:**
- **Área:** engenharia de obra.
- **Início:** 08/10/2026.
- **Frequência:** semanal, no ciclo do planejamento e do fechamento, e diária para pendências.
- **Usuários:** `[CONFIRMAR]`.
- **Incorporação ao processo:** o sistema substituiu a aba "Curto prazo" da planilha da Blentt e a planilha de pendências.

**Evidências de funcionamento:** veja o índice de evidências (seção 5.7): vídeo, prints, PDFs gerados pelo sistema e o relatório da análise das justificativas da Blentt.

**Próximo avanço até 31/12/2026:**
1. Medir o tempo antes e depois e o PPC na Blentt.
2. Levar o curto prazo e a terminalidade para as demais obras `[CONFIRMAR quais]`.
3. Ativar a análise com IA em produção.
4. Testar o modo de campo em celular real na vistoria.
5. Liberar o médio prazo depois de conferir a exportação no MS Project.

---

## 5.4 Viabilidade técnica e financeira — peso 15%

**Escopo e entregas:**
- **Dentro do escopo:** os cinco níveis por obra (longo, vagões, médio, curto, terminalidade), usuários e permissões, importação de histórico, relatórios em PDF, análise com IA das justificativas e o modo de campo da terminalidade.
- **Fora do escopo:** BIM 4D (cancelado em 02/10/2026 para concentrar esforço no planejamento) e orçamento.
- **Critério de conclusão:** cada módulo liberado a todos os usuários das obras ativas, com o histórico migrado.

**Plano e prazo:**
- 08/09 a 14/10/2026: desenvolvimento dos módulos (feito).
- 08/10/2026: go-live do curto prazo e da terminalidade (feito).
- Até 15/11/2026: medição antes e depois na Blentt e ativação da análise com IA.
- Até 15/12/2026: expansão para as demais obras e liberação do médio prazo.
- 31/12/2026: atualização final do card com os resultados medidos.

**Recursos e responsáveis:**
- **Bruno:** dono do produto e condução do desenvolvimento com IA, `[CONFIRMAR: horas por semana dedicadas]`.
- **Planejadores das obras:** uso e retorno.
- **Ferramentas:** Claude Code, GitHub, Vercel e Supabase.

**Dependências:**
- Supabase Pro da organização ATR (projeto dividido com o Takt Hub).
- Projeto Google Cloud da ATR, usado no login.
- Chave da API da Anthropic.
- Adesão das equipes de obra e decisão da engenharia sobre as próximas obras.

**Custos:**
- **Investimento inicial:** só tempo interno e a assinatura de IA `[CONFIRMAR]`.
- **Recorrentes:** Vercel, Supabase (parcela), API da Anthropic e Open-Meteo comercial, `[CONFIRMAR valores]`.
- **Armazenamento de fotos:** estimado em cerca de 1 GB por obra de 300 apartamentos, porque as fotos são comprimidas para cerca de 300 KB. Cabe nos 100 GB do plano Pro, e o excedente custa US$ 0,021 por GB por mês.

**Fornecedor e cotação — selecionar:** `[CONFIRMAR]`.
Não há desenvolvedor nem fornecedor contratado. Há, porém, plataformas pagas (assinatura de IA, Vercel, Supabase, API). Pela seção 5.8, isso conta como custo externo, então é mais seguro marcar "há custo externo" e anexar como cotação as páginas de preço ou as faturas de cada plataforma.

**Riscos e mitigação:**

| Risco | Mitigação |
| --- | --- |
| Dependência de uma só pessoa que conhece o sistema | Documentação técnica completa no repositório (README e docs por módulo), código versionado no GitHub e testes automáticos. Outro profissional com IA consegue continuar. |
| Consumo do banco acima do plano | Recarga só quando os dados mudam e leitura por recorte, já implantadas. Carregar por janela de semanas está previsto. |
| Banco dividido com o Takt Hub | Esquemas separados e grants explícitos; restaurar um backup volta os dois sistemas, o que exige coordenação. |
| Adesão das equipes | Implantação obra a obra, com o retorno dos planejadores incorporado em dias, e uso no celular. |
| Custo da IA | Análise sob demanda, com limite de linhas e de tamanho da resposta. |

**Continuidade:** manutenção interna pelo participante com IA. Atualizações publicadas automaticamente após a verificação no GitHub. Histórico preservado no banco da ATR.

**Custo-benefício:** o custo é baixo e recorrente (plataformas em nuvem), sem contratar desenvolvimento. Em troca, a ATR tem um sistema sob medida para o seu processo, que replica o MS Project e as planilhas que a equipe já usa e que é ajustado em dias a partir do retorno da obra.

---

## 5.5 Grau de inovação — peso 10%

**Prática atual e soluções semelhantes:** planilhas do Google Sheets por obra, cronogramas no MS Project e fotos no WhatsApp. No mercado existem softwares de planejamento e de vistoria, como o Prevision, com o qual o Obra 360 já se integra, mas eles são genéricos, cobrados por licença e não seguem o fluxo e as planilhas da ATR.

**Diferencial:**
- Um sistema sob medida, feito por um engenheiro da própria ATR com agentes de IA, em semanas e sem fornecedor, que junta os cinco níveis de planejamento numa só base.
- O médio prazo reproduz as regras de cálculo do MS Project (validadas numa bancada de 33 cenários) e exporta para ele. A equipe não precisa abandonar a ferramenta que conhece para conferir.
- A terminalidade funciona no canteiro sem sinal.

**Papel da inteligência artificial:**
1. **Construção:** agentes de IA escreveram e testaram o código a partir das regras definidas pelo engenheiro. Também converteram a planilha histórica da Blentt e fizeram a engenharia reversa das regras do MS Project a partir de bibliotecas abertas.
2. **Operação:** o botão "Analisar com IA" envia ao modelo Claude as falhas da semana ou da obra (causa, justificativa, empreiteiro, equipe e atividade). O modelo devolve os temas recorrentes por causa, as repetições por empreiteiro e cinco ações recomendadas com responsável, transformando texto livre que hoje ninguém lê em plano de ação para a reunião semanal.

**Potencial de transformação:** a reunião semanal deixa de ser só a apuração do PPC e passa a discutir causas recorrentes e ações por empreiteiro. A IA também muda quem pode criar ferramentas na ATR: a área de engenharia passa a desenvolver as próprias soluções, no ritmo da obra.

---

## 5.6 Aplicabilidade, escalabilidade e integração — peso 10%

**Aplicação e usuários:**
- **Quem usa:** engenheiros, planejadores, estagiários e mestres; os gestores consultam.
- **Forma de uso:** navegador no computador e no celular, com login pela conta Google da ATR.
- **Facilidade de adoção:** as telas seguem as colunas das planilhas atuais, há um tour guiado e o celular mostra as linhas como cartões.

**Replicação e escala:** o sistema é multi-obra desde o início. Uma obra nova é cadastrada nas configurações, com a semana 1, os empreiteiros, as equipes e os pavimentos e apartamentos, sem programação. O importador traz o histórico da planilha de qualquer obra no formato padrão. O mesmo desenho serve às demais obras e empreendimentos da ATR.

**Integrações:**
- Google Workspace (login).
- Supabase (banco e fotos, no mesmo projeto do Takt Hub).
- Prevision (obras e atividades).
- MS Project (exportação .xml).
- Planilhas Google/Excel (importação do histórico).
- Open-Meteo (previsão do tempo nos PDFs).
- API da Anthropic (análise com IA).

**Manutenção e responsável futuro:** Bruno, com IA. O esforço é baixo e sob demanda. A documentação no repositório permite passar a manutenção a outro colaborador ou fornecedor.

**Limitações e condições para expansão:**
- Cadastrar os usuários e os locais de cada obra.
- Converter as planilhas antigas para o formato do importador.
- Acompanhar o consumo do banco à medida que as obras entram.
- Revisão jurídica da página de privacidade.

---

## 5.7 Estruturação, clareza e evidências — peso 5%

**Índice de evidências** (o Bruno anexa; o Claude no Chrome indica o campo):

| # | Evidência | Tipo | Classificação |
| --- | --- | --- | --- |
| 1 | Vídeo de demonstração, 3 a 5 min: curto prazo, fechamento, análise com IA, terminalidade no celular e médio prazo `[CONFIRMAR: gravar]` | Vídeo | Comprovado em uso |
| 2 | Prints das cinco abas e do fechamento com PPC e Pareto da Blentt `[CONFIRMAR]` | Imagens | Comprovado em uso |
| 3 | PDFs do planejamento e do fechamento semanal gerados pelo sistema `[CONFIRMAR]` | PDF | Comprovado em uso |
| 4 | Relatório da análise das justificativas da Blentt feito com IA (link do documento no Claude, a compartilhar) | Link | Resultado de teste |
| 5 | Resumo da importação: 116 semanas, 5.993 compromissos, 205 equipes (documentação do go-live) | Documento | Comprovado |
| 6 | Planilha de memória de cálculo (horas, custo-hora, economia, retorno) `[CONFIRMAR: montar]` | Planilha | Estimado |
| 7 | Páginas de preço ou faturas das plataformas `[CONFIRMAR]` | PDF | Cotação |
| 8 | Endereço do sistema: `https://obra360-atr.vercel.app` (exige cadastro) | Link | Comprovado em uso |

**Rastreabilidade:** os volumes da Blentt vêm da contagem no banco após a importação de 08/10/2026. As horas e os custos vêm de `[CONFIRMAR: fontes]`. A memória de cálculo está no anexo 6.

**Classificação dos resultados:**
- **Comprovado em uso real:** sistema em produção, histórico migrado e uso semanal na Blentt desde 08/10/2026.
- **Resultado de teste:** análise com IA das justificativas e modo de campo sem sinal (simulado).
- **Estimado:** economia de horas, economia financeira e retorno.

**Declaração final:** marcar a confirmação de completude, veracidade, autoria e ciência das regras **somente depois da revisão do Bruno**.

---

## Atualização final (até 31/12/2026, no mesmo card)

Não preencher agora. Na atualização, registrar:
- o estágio alcançado;
- as horas e o PPC medidos antes e depois;
- as obras e os usuários ativos;
- as pendências resolvidas com foto;
- os resultados da análise com IA;
- o teste do modo de campo no celular;
- as novas evidências.
