# Engenharia reversa do MS Project para o médio prazo

Data: 13/10/2026. Complementa `docs/planejamento-tres-niveis.md` (etapa 5), que descreve o que entrou no sistema; este documento registra a pesquisa que embasou as decisões, para não ser refeita.

## A pergunta

O usuário pediu a aba 3 "o mais próximo possível do MS Project" e que se buscasse no GitHub o que já existe de consolidado sobre o Project em aplicações online, com um ambiente de testes antes de levar ao sistema. O que se buscou foi, em ordem de valor: (1) o **comportamento** de agendamento do Project (o que a equipe conhece e confere), (2) um **motor** pronto que o reproduzisse e (3) o **formato de arquivo** do Project, para a equipe conferir o resultado no próprio Project.

## O que existe, e o veredito

| Projeto                                                                        | Licença                          | O que é                                                                                                                              | Veredito                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------ | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **MPXJ** (`joniles/mpxj`, Java, v16.10)                                        | LGPL 2.1                         | A biblioteca padrão para ler e escrever `.mpp` e o XML do Project (MSPDI). Desde a v14 traz `MicrosoftScheduler`, um CPM "observando e tentando replicar" o Project, com a ressalva de que a coincidência não é garantida | **Referência principal.** O motor novo segue as regras do `MicrosoftScheduler` (seção abaixo) e a exportação segue o `MSPDIWriter`. Não entrou como dependência: é Java, e o que importa dele são as regras, reimplementadas em TypeScript |
| **TruePPM** (`TruePPM/trueppm`, TS/Python/Rust)                                | Apache-2.0                       | P3M open-core; o README do scheduler lista cada regra e marca onde difere do Project; 62 fixtures JSON com ES/EF/LS/LF e folgas, alguns salvos pelo próprio Project                                           | Referência de fidelidade e fonte de cenários futuros. O motor canônico é Python; o TS é só pré-visualização                                                                                                                                   |
| **gantt-schedule-engine** (TS)                                                 | MIT                              | Motor headless em horas, só vínculo TI, sem restrições; 291 testes                                                                   | Referência para datas reais e data de status. Não serve como dependência                                                                                                                                                                     |
| **fluxgantt** (`@fluxgantt/core` 0.2.1, TS)                                    | MIT                              | Motor headless em horas com `Temporal`; restrições inertes (reservadas ao tier pago); sem folga livre nem datas reais                 | Não serve como dependência; só aritmética de horas/fuso como referência                                                                                                                                                                       |
| **planit** (TS)                                                                | PolyForm Noncommercial           | Melhor semântica de restrições entre os TS (NIAD/NIDD/NTAD/NTDD, OMBP/OMTP, folga negativa por prazo do projeto)                     | A licença veta uso comercial: só leitura, nada copiado                                                                                                                                                                                       |
| **GanttProject** (Java/Kotlin, 1,1 mil estrelas)                               | GPL-3.0                          | Scheduler por grafo com TI/II/TT/IT, defasagem em dias úteis e só "início mais cedo"; marco TI cai no dia seguinte (o Project põe no mesmo dia) | Referência secundária; ~50 casos de teste anotados                                                                                                                                                                                           |
| **ProjectLibre** (Java, CPL)                                                   | CPL 1.0                          | O clone desktop do Project (sucessor do OpenProj); motor em `TaskSchedule`/`CriticalPath`, sem testes nem fixtures com resultado esperado | **Lido e comparado** (notas da sessão): concorda com o MPXJ nas restrições, na folga negativa no predecessor e em MSO/MFO fixando as datas tardias; difere do Project em não usar o prazo final no término tardio e em mudar a duração (sem NTAD) ao digitar o término |
| OpenProject (Ruby, 16 mil estrelas)                                            | GPL-3.0                          | Agendamento simples por "segue/precede", sem CPM                                                                                     | Descartado                                                                                                                                                                                                                                   |
| DHTMLX Gantt, SVAR Gantt, frappe-gantt, gantt-task-react                       | MIT (edições gratuitas)          | Componentes de Gantt; auto-agendamento, caminho crítico e calendários só nas edições pagas, ou inexistentes                          | Descartados: o Obra 360 já tem Gantt próprio alinhado à tabela                                                                                                                                                                               |
| OpenPath, Gantt_Lib, pixi-gantt, milestone-planner, open-msp-viewer, miku-project | variadas, algumas sem licença | Protótipos sem testes, ou só visualização/conversão de XML                                                                           | Descartados                                                                                                                                                                                                                                  |
| Bryntum Gantt                                                                  | comercial                        | Publicou um benchmark de 14 casos de correção de agendamento                                                                         | Página inacessível (403); os casos foram recriados à mão na bancada                                                                                                                                                                          |

Conclusão: **não existe motor TypeScript consolidado e livre que reproduza o Project**. Os que existem ou são em horas sem restrições, ou escondem o CPM na edição paga, ou têm licença incompatível. O que existe de consolidado é o **conhecimento** (MPXJ e a documentação da Microsoft) e o **formato** (MSPDI). Por isso a decisão foi ampliar o motor próprio e exportar para o Project.

## Regras adotadas (do `MicrosoftScheduler` do MPXJ e dos artigos da Microsoft)

> Registro de 13/10/2026. Parte destas regras foi desmentida pelo Project real em 20/10/2026 (IT na tabela, folga negativa, NIDD sem sucessora, tarefa em andamento); o que vale hoje está em "Correções de 21/10/2026".

- Passada direta em ordem topológica: início = máximo entre o que cada predecessora permite; TI empurra para o dia útil seguinte ao término (marco fica no dia do término); TT recua a duração; **IT termina no dia útil anterior ao início da predecessora** (terminar às 08:00 é terminar às 17:00 da véspera) — isso corrigiu o motor antigo, que terminava no mesmo dia. As três regras de IT, II/TT sem defasagem e marco no dia do término foram conferidas pelo TruePPM contra arquivos `.mpp` salvos pelo próprio Project (README do scheduler, seção "Conventions"; fixtures `link_types_2013` e `task_links_cross_version`), inclusive "IT+2 dias" a partir de uma segunda-feira terminando na terça.
- Restrições: NIAD/NTAD só empurram para a frente; NIDD/NTDD/DIE/DTE **prendem** a data mesmo contra a rede ("as tarefas sempre respeitam as datas de restrição", padrão do Project), e o vínculo fica marcado como desrespeitado; OMTP vai para as datas tardias numa segunda passada direta.
- Passada inversa: término tardio = mínimo do que as sucessoras permitem (inverso exato da direta), senão o fim do projeto (maior término); **prazo final e NTDD/DTE cortam o término tardio; NIDD/DIE cortam o início tardio**.
- Folga total = menor entre a do término e a do início, em dias úteis; tarefa iniciada só tem a do término; tarefa concluída nunca é crítica e tem folga livre zero; folga livre nunca negativa; crítica = folga total ≤ limite (0, configurável como no Project). Resumo é crítico quando alguma subtarefa é.
- **A folga negativa aparece na predecessora** cujo término tardio fica antes do término cedo, não na tarefa presa pela restrição (que fica com zero e o vínculo desrespeitado). MPXJ e ProjectLibre fazem igual (o ProjectLibre comenta: "o conflito aparece como folga negativa, geralmente no predecessor da tarefa restrita"); o Project real deve ser conferido pela exportação. DIE e DTE fixam as datas tardias na data (folga sempre zero), nos dois. **O Project real discorda** (conferido em 20/10/2026): a tarefa presa também fica com a folga negativa — ver "Conferência no Project real", regra 1.
- Prazo final não reprograma: só reduz a folga e acende o indicador quando o término passa dele.
- Predecessoras determinantes = as cujo limite coincide com o início agendado quando é a rede que manda.

## A bancada (ambiente de testes)

Montada fora do repositório (`scratchpad/bancada/`): 33 cenários com o resultado esperado do Project (vínculos nos quatro tipos com defasagem útil e corrida, marcos, feriados, dias corridos, as oito restrições, prazo final em três situações, dois caminhos, folga total diferente da livre, resumo, datas reais, predecessora determinante) e um executor que imprime as divergências. O motor antigo divergia em 4 pontos (IT, e a semântica de folga nas restrições inflexíveis, acertada pela leitura do MPXJ); o novo confere em 169/169 checagens.

Os mesmos cenários foram levados ao repositório como `tests/fixtures/cenarios-project.ts` + `tests/plan-cpm.test.ts`, para o CI repetir a bancada a cada mudança. O `@fluxgantt/core` foi instalado na bancada para comparação, mas não houve comparação útil: o modelo dele é em horas e sem restrições.

## Diferenças conhecidas em relação ao Project (não implementadas)

- O sistema guarda **dias**, não horas. Desde 21/10/2026 o motor distingue o começo e o fim do dia (ver "Correções de 21/10/2026"), mas frações de dia, como a parte feita de uma tarefa em andamento, a duração em horas ou a defasagem em horas, ainda são arredondadas para dias.
- Defasagem em **percentual** (`+50%`) e em horas: a coluna `lag_days` é inteira em dias (migração 0022); exigiria migração.
- **Duração restante** separada: o Project usa a duração restante em TT para tarefas em andamento; aqui a duração é inteira.
- **Restrição em resumo**: o Project aceita NIAD/NTDD em resumos; aqui o resumo é só envelope e o servidor recusa.
- **Tarefas manuais, recorrentes e inativas**, divisão manual de tarefa (a divisão automática da tarefa em andamento existe desde 21/10/2026), nivelamento de recursos e agendamento a partir do fim.

## O que o ProjectLibre acrescentou

- Confirma a ordem do passe direto (vínculos → pai → NIAD/NTAD como piso → NIDD/NTDD/DIE/DTE como teto, com "respeitar datas de restrição" sempre ligado e sem tela para desligar) e do passe inverso (fim do projeto = maior término cedo; teto por NTDD/DTE no término tardio e por NIDD/DIE no início tardio).
- Folga livre por tipo de vínculo igual à nossa; crítica = folga ≤ 0 sem limiar (o Project tem limiar; mantivemos o limiar).
- Digitar o início cria NIAD (NIDD se a data for anterior ao início do projeto); digitar o término **não** cria restrição no ProjectLibre, só muda a duração — seguimos o Project (NTAD).
- Prazo final no ProjectLibre é só indicador e losango no Gantt; não entra no término tardio. Seguimos a documentação da Microsoft (entra).
- Resumos aceitam NIAD e NTDD e seus predecessores empurram todos os filhos; marcos têm peso zero no % do resumo. Aqui o resumo não aceita restrição e o marco pesa 1 — pendências conhecidas.
- Não há "caminho da tarefa" nem predecessora determinante no ProjectLibre; a nossa é derivada do vínculo cujo limite coincide com o início.
- Nenhum teste unitário do motor nem fixture com resultado esperado: não serve como oráculo automático.

## Conferência no Project real (20–21/10/2026)

A pendência principal deste documento era conferir a bancada e a exportação num Project de verdade. A conferência foi feita em 20/10/2026, por automação. Em 21/10/2026 o usuário pediu "siga como o Project, corrija tudo", e tudo o que esta seção lista foi corrigido (ver "Correções de 21/10/2026", abaixo), inclusive os itens de exibição. As subseções a seguir guardam o que o Project fez e por que o motor mudou.

### Como foi feito

- **Onde**: Microsoft Project Professional 2019 (licença de varejo, pt-BR, versão 16.0.20430, Click-to-Run), na VM "Windows" do UTM do usuário (Windows 11 Home ARM; o Project roda emulado em x64; usuário `bruno` logado automaticamente). O calendário "Padrão" dessa instalação é 09:00–18:00. Para quem trabalha em dias, isso não muda nada.
- **Sem tela**: o `utmctl exec` do UTM manda comandos ao agente convidado da VM, que roda como SYSTEM. O Project não abre fora da sessão do usuário, então cada script do Project roda por uma tarefa agendada interativa na sessão do `bruno` e é comandado por COM (`MSProject.Application`). Tudo está em `scripts/ms-project/`:
  1. `node --import tsx scripts/ms-project/exportar-cenarios.ts <pasta>` grava `cenarios.json`, `motor.json` (o que o motor calcula) e `xml/NN.xml` (o MSPDI que o "Exportar para o Project" geraria).
  2. `vm.sh enviar <pasta>/cenarios.json` e depois `vm.sh usuario scripts/ms-project/montar-no-project.ps1 540`. O script monta cada cenário tarefa a tarefa, como a equipe digitaria, e grava `project.json` e os `.mpp` em `C:\Users\Public\msp\mpp\project\` (dá para abrir e olhar no Project).
  3. Enviar os `.xml` para `C:\Users\Public\msp\xml\` e rodar `vm.sh usuario scripts/ms-project/abrir-xml.ps1 400`, que grava `xml-aberto.json`.
  4. Baixar os resultados com `vm.sh baixar project.json` e `vm.sh baixar xml-aberto.json`, e rodar `python3 -I scripts/ms-project/comparar.py <pasta>`.
- **Modelagem no Project**: o início do projeto é o menor `inicio` do cenário, e um `inicio` mais tarde vira NIAD. Restrições de término e o prazo final ficam na hora de término padrão; as de início, na hora de início padrão. Nenhuma tarefa é manual nem estimada. Folgas foram convertidas de minutos para dias úteis.
- **Armadilhas encontradas**: `FieldNameToFieldConstant("Duration")` devolve a "Duração agendada", e a Duração de verdade é a constante 188743709. Em pt-BR, dia corrido se escreve "diasd". `DateAdd` não aceita minutos negativos (usar `DateSubtract`). O `utmctl exec` não espera o comando terminar, e o `file pull` sai com 0 mesmo quando falha. Um `FileSaveAs` no formato XML não gravou nada e outro travou o Project num diálogo invisível. Por isso não houve XML gravado pelo próprio Project para comparar.
- **O que rodou**: os 34 cenários da fixture e 21 cenários extras (X1–X21), criados durante a conferência para isolar cada regra suspeita. Os extras não estão na fixture; os que importam aparecem nas regras abaixo com a montagem descrita.

### Resultado em números

- **Fixture**: 162 de 173 checagens conferem com o Project. Os 11 valores esperados errados estão na tabela "Valores da fixture a corrigir".
- **Motor x Project**: 49 diferenças em 780 checagens (todas as tarefas × 10 campos), concentradas nas seis regras abaixo.
- **Exportação**: os 55 `.xml` abrem no Project sem erro, mas há dois defeitos (seção "Exportação"). Corrigido o primeiro, 48 dos 55 cenários dão o mesmo resultado abertos do `.xml` ou montados à mão.

### Regras do Project que o motor não seguia (mudam datas e folgas) — corrigidas em 21/10

1. **Folga negativa também na tarefa presa** (cenários 14, 17 e 19). Quando NIDD, NTDD ou DIE seguram a tarefa antes do que a rede pede, a tarefa presa fica com a mesma folga negativa da predecessora (−1, −1 e −2), e as duas ficam críticas. MPXJ e ProjectLibre põem a folga negativa só na predecessora e deixam a presa com zero; o Project real não faz assim.
2. **NIDD respeitado em tarefa sem sucessora** (15, X15). O início tardio é a própria data da restrição, mesmo depois do fim do projeto. No cenário 15, B tem início tardio em 16/09, folga 5 e não é crítica. No X15 (A → B com NIDD 30/09; outra tarefa E de 15 dias fecha o projeto em 25/09), B tem folga 15. Com sucessora, vale o menor entre a rede e a restrição (X1, X18), como o motor já faz. O NTDD não se comporta assim: com data depois do fim do projeto, o término tardio fica no fim do projeto (X17); antes do fim, vale o NTDD (X16).
3. **Tarefa iniciada com predecessora ainda aberta** (29, X11, X21, 28). Com "Dividir tarefas em andamento" ligado (o padrão), o trabalho restante não começa antes de a predecessora terminar. Pelo `.xml`, que guarda início real e %, a retomada fica no dia útil seguinte ao término da predecessora e o término é a retomada mais a duração restante. A predecessora se amarra à retomada (folga 0, não negativa), e as sucessoras são empurradas.
   - Cenário 29: B tem 2 dias, 50% e início real em 07/09, com A em 07–08/09. No Project, B termina em 09/09; o motor dá 08/09 e deixa A com folga −2.
   - X21: o mesmo, mais uma sucessora C, que no Project começa em 10/09 e no motor em 09/09.
   - Montando à mão, o resultado depende da ordem do lançamento: com o início real lançado depois do vínculo, B vai a 10/09, porque o Project conta a duração inteira a partir de quando a rede deixa.
   - Sem "dividir tarefas em andamento", o Project faz como o motor (B em 08/09, A com folga −1).
   - No cenário 28 (B iniciada depois de A), A também se amarra à retomada de B: folga 4 no Project, 3 no motor.
4. **Marco que não é empurrado por TI fica no começo do dia** (X9, X19, X20, 31). O marco com data digitada (NIAD ou DIE), ou sem predecessora, fica às 09:00, e a sucessora em TI começa no mesmo dia. No X9 (marco com NIAD em 11/09 → B), B começa em 11/09 no Project e em 14/09 no motor. A predecessora de um marco assim tem um dia a menos de folga: no cenário 31, 2 no Project e 3 no motor. Já o marco empurrado por TI fica no fim do dia, e a sucessora começa no dia seguinte (9, X14), como no motor.
5. **TT não puxa para antes do início do projeto** (6). B (3 dias) ligada por TT a A (2 dias, 07–08/09) começa em 07/09 e termina em 09/09: o vínculo só pede que B não termine antes de A. O motor recua B para 04/09. TI e II com antecipação, e IT, puxam a sucessora para antes do início do projeto (X5, X6, 8), e nesses casos o motor já acerta.
6. **Defasagem em dias corridos na passada inversa** (4). A termina na quinta; com +2 dias corridos, B começa na segunda. No Project, A tem folga +1: se terminar na sexta, +2 dias corridos dá domingo, e B ainda começa na segunda. O motor dá −1 e marca A como crítica. É defeito do motor.

### Diferenças de exibição (mesmo instante, dia diferente na tabela) — seguem o Project desde 21/10

7. **IT sem defasagem** (8, X8). O Project termina a sucessora no instante em que a predecessora começa (seg 07/09 09:00), e a tabela mostra 07/09. O motor mostra 04/09, a sexta, último dia trabalhado. Com defasagem, a conta passa pelo fim do dia anterior e os dois concordam (33). O motor antigo, antes desta bancada, mostrava como o Project.
8. **Duração em dias corridos** (11, X10). 5 diasd a partir de sex 04/09 terminam na qua 09/09 às 09:00 (5 × 24 h). A tabela do Project mostra 09/09, e o motor mostra 08/09. A sucessora começa em 09/09 nos dois.
9. **Datas tardias de marco depois de TI** (9, X14): aparecem no dia útil seguinte às 09:00. A folga é igual.
10. **Predecessoras determinantes** (`StartDriver`, o "Inspetor de tarefas"): o Project lista a predecessora mesmo quando quem manda é um NTAD, um OMTP ou um NIDD/NTDD violado (16, 21, 14, 17). Para NIAD mais tarde que a rede, não lista (12), como o motor.

### Exportação (`src/domain/mspdi.ts`)

- **`<HonorConstraints>` é lido invertido.** Com 1, que é o que o exportador grava, o Project desliga "As tarefas sempre respeitam as datas de restrição" e passa a ignorar NIDD, NTDD, DIE e DTE (cenários 14, 17, 19 e 20 saem nas datas da rede). Com 0, ou sem o elemento, a opção fica ligada. As três variantes foram abertas e conferidas. Correção: não gravar o elemento, ou gravar 0.
- **Início do projeto.** O `<StartDate>` sai como o menor início entre todas as tarefas. Quando um TT, um IT ou uma antecipação puxa uma tarefa para antes (cenários 6, 8, X5 e X6), as tarefas sem predecessora ("o mais breve possível") vão junto para esse início, e o cronograma inteiro se desloca. Correção: usar como início do projeto o das tarefas sem predecessora (a âncora do plano), ou exportar o início digitado como NIAD.
- Tarefa iniciada com predecessora aberta: ver regra 3. Com a mesma informação, o `.xml` e a montagem à mão podem dar dias diferentes. O `.xml` é a referência certa para o motor, que também só guarda início real e %.
- As duas correções foram testadas editando os `.xml` à mão: sem `<HonorConstraints>` e com `<StartDate>` em 07/09, 52 dos 55 cenários dão no Project o mesmo resultado abertos do `.xml` ou montados à mão. Os 3 restantes são os de tarefa iniciada (regra 3). O que sobra entre o motor e o Project são as regras 1–6.

### Valores da fixture que estavam errados (`tests/fixtures/cenarios-project.ts`) — corrigidos em 21/10

| Cenário                                         | Campo                    | Fixture    | Project real | Observação                                            |
| ----------------------------------------------- | ------------------------ | ---------- | ------------ | ----------------------------------------------------- |
| 6 TT                                            | B.inicio / B.termino     | 04/09–08/09 | 07/09–09/09  | regra 5                                                |
| 8 IT                                            | B.termino                | 04/09      | 07/09        | exibição (item 7): depende de decisão                  |
| 11 Dias corridos                                | A.termino                | 08/09      | 09/09        | exibição (item 8): depende de decisão                  |
| 14 NIDD violado                                 | B.folgaTotal             | 0          | −1           | regra 1                                                |
| 15 NIDD respeitado                              | B.inicioTardio, folga, crítica | 09/09, 0, sim | 16/09, 5, não | regra 2                                         |
| 17 NTDD violado                                 | B.folgaTotal             | 0          | −1           | regra 1                                                |
| 19 DIE antes da rede                            | B.folgaTotal             | 0          | −2           | regra 1                                                |
| 29 Início real antes da rede                    | B.termino                | 08/09      | 10/09 (à mão) / 09/09 (.xml) | regra 3; usar 09/09                    |

## Correções de 21/10/2026: o motor e a exportação seguem o Project

Decisão do usuário: "siga como o Project, corrija tudo". Os itens 7 e 8 (exibição) também passaram a mostrar o dia que o Project mostra. Para a tarefa em andamento (regra 3), a referência é o `.xml` aberto no Project, que guarda o estado como o sistema guarda (início real e %).

### Como o motor passou a pensar (`src/domain/plan-schedule.ts`)

O plano continua guardando dias. Dentro do `analyzeSchedule`, cada data é um **instante**: o dia mais a ponta dele, começo (08:00) ou fim (17:00). As regras abaixo foram medidas no Project, uma por uma:

- **Somar e subtrair dias úteis** imita o DateAdd/DateSubtract do Project. O resultado que cai na virada do dia sai como fim do dia na passada direta e como começo na passada inversa. Defasagem zero não mexe no instante.
- **Tarefa em dias úteis** começa sempre no começo de um dia útil. Na passada inversa, o término dela recua para o fim do último dia útil, exceto o da tarefa sem sucessora, que fica no fim do projeto como ele é.
- **Marco e duração em dias corridos** ficam no instante exato em que a rede deixa, mesmo às 17:00 ou num sábado. Exemplos:
  - o marco depois de TI fica no fim do dia da predecessora;
  - o marco com data digitada ou sem predecessora fica no começo do dia, e a sucessora começa no mesmo dia (X9, X19, X20, V5);
  - a tarefa em dias corridos depois de uma que termina sexta às 17:00 começa sexta às 17:00 (V4);
  - uma cadeia de tarefas de 1 dia corrido anda um dia por tarefa, inclusive no fim de semana (V3).
- **Término exigido** (TT, IT, NTAD, NTDD, DTE) fica no instante exigido quando a duração cabe exatamente até ele. É assim que o IT sem defasagem termina às 08:00 da segunda, e o TT com 2 dias corridos que cai no domingo termina no domingo às 17:00 (V1).
- **TT não puxa para antes do início do projeto**, nem com antecipação nem em marco (6, F1, F2, F3). TI, II e IT puxam (X5, X6, 8). O início do projeto é o primeiro início das tarefas sem predecessora.
- **Folga negativa na tarefa presa**: quando NIDD, NTDD ou DIE seguram a tarefa antes do que a rede pede, a folga sai de onde a rede a queria. Por isso a tarefa presa fica com a mesma folga negativa da predecessora (14, 17, 19).
- **Término tardio**:
  - sem sucessora, é o fim do projeto;
  - com sucessora, é o mínimo do que as sucessoras permitem, com teto no término tardio do projeto, que é o maior entre o fim do projeto e o término tardio das tarefas sem sucessora;
  - um NIDD em tarefa sem sucessora põe o início tardio na própria data, mesmo depois do fim do projeto, e leva junto o teto (15, X15). O NTDD não faz isso (X3, X16, X17).
- **Folga livre** é a conta inversa a partir das datas cedo das sucessoras: quanto a tarefa atrasa sem mexer nelas. Isso conta o dia corrido da defasagem (4) e usa o início real da sucessora iniciada (28).
- **Folga de tarefa em dias corridos** é contada em horas de relógio, em dias de 24 h. Do fim de um dia ao começo do seguinte são 15 h, ou 0,625 (V4, F8).
- **Tarefa em andamento**:
  - o restante é a duração vezes o que falta, arredondado para cima em dias, e não começa antes do que os vínculos permitem;
  - se for empurrado, a tarefa fica dividida: `TaskSchedule.stop` e `resume` dizem onde para e onde retoma;
  - na passada inversa, a predecessora se amarra à retomada (29, X11, X21, F6, F7, 28).
- **Predecessoras determinantes**, como o Inspetor de tarefas: NIAD, DIE e DTE tomam o lugar da rede, enquanto com NTAD, NIDD, NTDD e OMTP a predecessora da rede continua listada (12, 16, 18, 21). Um TT seguro no início do projeto não lista ninguém (F1).
- `TaskSchedule.edges` diz em que ponta do dia cada uma das quatro datas caiu. O Gantt usa isso para desenhar a barra e a exportação para escrever a hora. Por causa das pontas, `plannedEnd` de uma tarefa que termina às 08:00 é o dia em que ela termina às 08:00. A carga de recursos (`resourceTasks`) desconta esse dia.

### Exportação (`src/domain/mspdi.ts`)

- **`<HonorConstraints>`** não vai mais, e vale o padrão, ligado.
- **`<StartDate>`** é o início das tarefas sem predecessora.
- **Tarefa sem predecessora** que começa depois desse início sai como NIAD na data dela.
- **Horas**: cada data sai na ponta do dia que o motor calculou (08:00 ou o fim da jornada).
- **Folgas** de tarefa em dias corridos saem em dias de 24 h.
- **Tarefa dividida** sai com o término sem o empurrão (início real mais a duração inteira). Com o término já empurrado, o Project empurra de novo ao abrir. Gravar `<Stop>`/`<Resume>` não resolve, foi testado.

### Verificação

- `tests/fixtures/cenarios-project.ts` tem agora **69 cenários**: os 34 originais mais os 35 criados na conferência (X1–X21, F1–F8, V1–V6). Cada um traz o resultado do Project para todas as tarefas e todos os campos (datas cedo e tardias, folga total e livre, crítica, conflito, prazo perdido e predecessoras determinantes). `tests/plan-cpm.test.ts` confere todos: 76 de 76.
- **Motor x Project montado à mão**, mais o `.xml` para as tarefas em andamento: 1.492 checagens, 4 divergências. São as duas diferenças conhecidas abaixo, que ficaram fora da fixture com nota.
- **`.xml` exportado aberto no Project x motor**: ver "Rodada final" no fim desta seção.
- Os testes antigos que esperavam o comportamento anterior foram refeitos com o valor medido: marco na sexta (V5), tarefa iniciada a 10% (V2), IT na tabela (8) e TT corrido no domingo (V1). A cadeia de 1 dia corrido voltou ao valor antigo, que o Project confirma (V3).

### Diferenças conhecidas que ficam

- **Restante fracionado**: o Project conta 10% de 2 dias como 0,2 dia feito e deixa 0,2 dia de folga na predecessora (V2). O motor trabalha em dias inteiros e arredonda o restante para cima, então a predecessora fica com folga 0 e crítica.
- **Determinante com TT corrido e II**: no V1, o Inspetor de tarefas lista a predecessora do II, embora o início saia do TT; o motor lista a do TT.
- Continuam valendo as da seção "Diferenças conhecidas em relação ao Project", acima: defasagem em %, restrição em resumo, tarefas manuais e o resto.

## Pendências

- O oráculo automático é o próprio Project, pelos scripts de `scripts/ms-project/`. Toda mudança no motor deve ser conferida de novo com os passos de "Como foi feito", e cada divergência vira cenário na fixture.
- Recursos na exportação (`<Resources>`/`<Assignments>`): a coluna de recursos ainda chega vazia ao Project.
