/* Bancada de engenharia reversa do MS Project.
 *
 * Cada cenário descreve um cronograma pequeno e o resultado que o MS Project (agendado a partir
 * da data de início, "as tarefas sempre respeitam as datas de restrição" ligado, folga crítica
 * = 0) dá para ele. As datas são dias (sem hora): o Project trabalha com 08:00–17:00 e o que
 * acaba às 17:00 de um dia faz a sucessora começar às 08:00 do dia útil seguinte.
 *
 * Calendário: segunda a sexta, sem feriados salvo quando indicado. 2026-09-07 é segunda-feira.
 * Durações em dias úteis ("d") ou corridos ("dd"); 0 é marco. Folgas em dias úteis. */

export type Restricao = 'ASAP' | 'ALAP' | 'SNET' | 'SNLT' | 'FNET' | 'FNLT' | 'MSO' | 'MFO';
export interface TarefaCenario {
  id: string;
  dur: string;
  /** Início digitado quando não há predecessora (vale como o início guardado no plano). */
  inicio?: string;
  nivel?: number;
  restricao?: { tipo: Restricao; data?: string };
  prazo?: string;
  inicioReal?: string;
  terminoReal?: string;
  progresso?: number;
}
export interface VinculoCenario {
  de: string;
  para: string;
  tipo?: 'TI' | 'II' | 'TT' | 'IT';
  lag?: number;
  corrido?: boolean;
}
export interface Esperado {
  inicio?: string;
  termino?: string;
  inicioTardio?: string;
  terminoTardio?: string;
  folgaTotal?: number;
  folgaLivre?: number;
  critica?: boolean;
  /** Vínculo ou restrição desrespeitados (o Project mostra folga negativa e o aviso de conflito). */
  conflito?: boolean;
  prazoPerdido?: boolean;
  /** Ids das predecessoras que de fato mandam na data ("predecessoras determinantes"). */
  determinantes?: string[];
}
export interface Cenario {
  nome: string;
  feriados?: string[];
  tarefas: TarefaCenario[];
  vinculos?: VinculoCenario[];
  esperado: Record<string, Esperado>;
  nota?: string;
}

const seg = '2026-09-07';

export const CENARIOS: Cenario[] = [
  {
    nome: 'Cadeia TI simples',
    tarefas: [
      { id: 'A', dur: '2d', inicio: seg },
      { id: 'B', dur: '3d' },
      { id: 'C', dur: '1d' },
    ],
    vinculos: [
      { de: 'A', para: 'B' },
      { de: 'B', para: 'C' },
    ],
    esperado: {
      A: {
        inicio: '2026-09-07',
        termino: '2026-09-08',
        inicioTardio: '2026-09-07',
        terminoTardio: '2026-09-08',
        folgaTotal: 0,
        folgaLivre: 0,
        critica: true,
      },
      B: { inicio: '2026-09-09', termino: '2026-09-11', folgaTotal: 0, critica: true, determinantes: ['A'] },
      C: { inicio: '2026-09-14', termino: '2026-09-14', folgaTotal: 0, folgaLivre: 0, critica: true, determinantes: ['B'] },
    },
  },
  {
    nome: 'TI com defasagem positiva: a espera conta a partir do término, e a sucessora começa no dia útil seguinte',
    tarefas: [
      { id: 'A', dur: '2d', inicio: seg },
      { id: 'B', dur: '2d' },
    ],
    vinculos: [{ de: 'A', para: 'B', lag: 2 }],
    esperado: { B: { inicio: '2026-09-11', termino: '2026-09-14' } },
    nota: 'Project: A termina ter 17:00; +2 dias úteis = qui 17:00; B começa sex 08:00.',
  },
  {
    nome: 'TI com antecipação (defasagem negativa)',
    tarefas: [
      { id: 'A', dur: '3d', inicio: seg },
      { id: 'B', dur: '2d' },
    ],
    vinculos: [{ de: 'A', para: 'B', lag: -1 }],
    esperado: { B: { inicio: '2026-09-09', termino: '2026-09-10' } },
    nota: 'A termina qua 17:00; -1 dia = ter 17:00; B começa qua 08:00.',
  },
  {
    nome: 'TI com defasagem em dias corridos atravessando o fim de semana',
    tarefas: [
      { id: 'A', dur: '4d', inicio: seg },
      { id: 'B', dur: '1d' },
    ],
    vinculos: [{ de: 'A', para: 'B', lag: 2, corrido: true }],
    esperado: { B: { inicio: '2026-09-14', termino: '2026-09-14' } },
    nota: 'A termina qui 10/09 17:00; +2 dias corridos = sáb 12/09 17:00; B começa no dia útil seguinte, seg 14/09.',
  },
  {
    nome: 'II com defasagem',
    tarefas: [
      { id: 'A', dur: '5d', inicio: seg },
      { id: 'B', dur: '2d' },
    ],
    vinculos: [{ de: 'A', para: 'B', tipo: 'II', lag: 1 }],
    esperado: { B: { inicio: '2026-09-08', termino: '2026-09-09' } },
  },
  {
    nome: 'TT: a sucessora recua a própria duração para terminar junto',
    tarefas: [
      { id: 'A', dur: '2d', inicio: seg },
      { id: 'B', dur: '3d' },
    ],
    vinculos: [{ de: 'A', para: 'B', tipo: 'TT' }],
    esperado: { B: { inicio: '2026-09-04', termino: '2026-09-08' } },
  },
  {
    nome: 'TT com defasagem negativa',
    tarefas: [
      { id: 'A', dur: '5d', inicio: seg },
      { id: 'B', dur: '2d' },
    ],
    vinculos: [{ de: 'A', para: 'B', tipo: 'TT', lag: -2 }],
    esperado: { B: { inicio: '2026-09-08', termino: '2026-09-09' } },
    nota: 'A termina sex 11/09; -2 dias úteis = qua 09/09; B de 2 dias termina qua e começa ter.',
  },
  {
    nome: 'IT: a sucessora termina quando a predecessora começa (às 08:00, ou seja, no fim do dia útil anterior)',
    tarefas: [
      { id: 'A', dur: '2d', inicio: seg },
      { id: 'B', dur: '2d' },
    ],
    vinculos: [{ de: 'A', para: 'B', tipo: 'IT' }],
    esperado: { B: { inicio: '2026-09-03', termino: '2026-09-04' } },
    nota: 'Project: término de B = seg 08:00 = sex 17:00 → B termina sex 04/09. Difere do motor antigo, que punha B terminando na segunda.',
  },
  {
    nome: 'Marco em TI fica no dia em que a predecessora termina; depois dele a tarefa começa no dia útil seguinte',
    tarefas: [
      { id: 'A', dur: '2d', inicio: seg },
      { id: 'M', dur: '0d' },
      { id: 'B', dur: '1d' },
    ],
    vinculos: [
      { de: 'A', para: 'M' },
      { de: 'M', para: 'B' },
    ],
    esperado: {
      M: { inicio: '2026-09-08', termino: '2026-09-08', critica: true },
      B: { inicio: '2026-09-09', termino: '2026-09-09' },
    },
  },
  {
    nome: 'Fim de semana e feriado no meio da duração',
    feriados: ['2026-09-07'],
    tarefas: [
      { id: 'A', dur: '3d', inicio: '2026-09-03' },
      { id: 'B', dur: '1d' },
    ],
    vinculos: [{ de: 'A', para: 'B' }],
    esperado: {
      A: { inicio: '2026-09-03', termino: '2026-09-08' },
      B: { inicio: '2026-09-09', termino: '2026-09-09' },
    },
    nota: 'A ocupa qui 03, sex 04 e ter 08 (seg 07 é feriado).',
  },
  {
    nome: 'Duração em dias corridos atravessa fim de semana e feriado',
    feriados: ['2026-09-07'],
    tarefas: [{ id: 'A', dur: '5dd', inicio: '2026-09-04' }],
    esperado: { A: { inicio: '2026-09-04', termino: '2026-09-08' } },
  },
  {
    nome: 'Não iniciar antes de (NIAD) mais tarde que a rede: a restrição manda',
    tarefas: [
      { id: 'A', dur: '2d', inicio: seg },
      { id: 'B', dur: '2d', restricao: { tipo: 'SNET', data: '2026-09-14' } },
    ],
    vinculos: [{ de: 'A', para: 'B' }],
    esperado: {
      A: { folgaTotal: 3, folgaLivre: 3, critica: false },
      B: { inicio: '2026-09-14', termino: '2026-09-15', critica: true, determinantes: [] },
    },
    nota: 'A pode atrasar até qua 09, qui 10, sex 11 (3 dias úteis) sem mexer em B.',
  },
  {
    nome: 'NIAD mais cedo que a rede: a rede manda',
    tarefas: [
      { id: 'A', dur: '2d', inicio: seg },
      { id: 'B', dur: '2d', restricao: { tipo: 'SNET', data: '2026-09-01' } },
    ],
    vinculos: [{ de: 'A', para: 'B' }],
    esperado: { B: { inicio: '2026-09-09', termino: '2026-09-10', determinantes: ['A'] } },
  },
  {
    nome: 'Não iniciar depois de (NIDD) violado pela rede: a restrição prende e a folga fica negativa',
    tarefas: [
      { id: 'A', dur: '2d', inicio: seg },
      { id: 'B', dur: '2d', restricao: { tipo: 'SNLT', data: '2026-09-08' } },
    ],
    vinculos: [{ de: 'A', para: 'B' }],
    esperado: {
      B: { inicio: '2026-09-08', termino: '2026-09-09', folgaTotal: 0, critica: true, conflito: true },
      A: { folgaTotal: -1, critica: true },
    },
    nota: 'A rede pede B em qua 09; a restrição segura B em ter 08, sobrepondo A. A folga negativa aparece na predecessora (término tardio de A antes do término cedo), como no MicrosoftScheduler do MPXJ; B fica com 0 e o vínculo desrespeitado.',
  },
  {
    nome: 'NIDD respeitado: não altera nada',
    tarefas: [
      { id: 'A', dur: '2d', inicio: seg },
      { id: 'B', dur: '2d', restricao: { tipo: 'SNLT', data: '2026-09-16' } },
    ],
    vinculos: [{ de: 'A', para: 'B' }],
    esperado: { B: { inicio: '2026-09-09', termino: '2026-09-10', inicioTardio: '2026-09-09', folgaTotal: 0, critica: true } },
    nota: 'O Project ainda assim usa a data da restrição no cálculo tardio: início tardio = min(rede, 16/09) = 09/09.',
  },
  {
    nome: 'Não terminar antes de (NTAD): a tarefa se afasta para terminar na data',
    tarefas: [
      { id: 'A', dur: '2d', inicio: seg },
      { id: 'B', dur: '2d', restricao: { tipo: 'FNET', data: '2026-09-16' } },
    ],
    vinculos: [{ de: 'A', para: 'B' }],
    esperado: { B: { inicio: '2026-09-15', termino: '2026-09-16' } },
  },
  {
    nome: 'Não terminar depois de (NTDD) violado: a restrição prende o término',
    tarefas: [
      { id: 'A', dur: '2d', inicio: seg },
      { id: 'B', dur: '2d', restricao: { tipo: 'FNLT', data: '2026-09-09' } },
    ],
    vinculos: [{ de: 'A', para: 'B' }],
    esperado: { B: { inicio: '2026-09-08', termino: '2026-09-09', folgaTotal: 0, critica: true, conflito: true }, A: { folgaTotal: -1 } },
  },
  {
    nome: 'Deve iniciar em (DIE) ignora a rede quando é mais tarde',
    tarefas: [
      { id: 'A', dur: '2d', inicio: seg },
      { id: 'B', dur: '2d', restricao: { tipo: 'MSO', data: '2026-09-14' } },
    ],
    vinculos: [{ de: 'A', para: 'B' }],
    esperado: {
      B: { inicio: '2026-09-14', termino: '2026-09-15', inicioTardio: '2026-09-14', folgaTotal: 0, critica: true, conflito: false },
    },
  },
  {
    nome: 'DIE antes da rede: conflito e folga negativa',
    tarefas: [
      { id: 'A', dur: '2d', inicio: seg },
      { id: 'B', dur: '2d', restricao: { tipo: 'MSO', data: '2026-09-07' } },
    ],
    vinculos: [{ de: 'A', para: 'B' }],
    esperado: {
      B: { inicio: '2026-09-07', termino: '2026-09-08', folgaTotal: 0, critica: true, conflito: true },
      A: { folgaTotal: -2, critica: true },
    },
  },
  {
    nome: 'Deve terminar em (DTE)',
    tarefas: [
      { id: 'A', dur: '2d', inicio: seg },
      { id: 'B', dur: '2d', restricao: { tipo: 'MFO', data: '2026-09-11' } },
    ],
    vinculos: [{ de: 'A', para: 'B' }],
    esperado: { B: { inicio: '2026-09-10', termino: '2026-09-11', terminoTardio: '2026-09-11', folgaTotal: 0, critica: true } },
  },
  {
    nome: 'O mais tarde possível (OMTP) desliza para a folga e aparece como crítica',
    tarefas: [
      { id: 'A', dur: '2d', inicio: seg },
      { id: 'B', dur: '5d' },
      { id: 'C', dur: '1d', restricao: { tipo: 'ALAP' } },
    ],
    vinculos: [
      { de: 'A', para: 'B' },
      { de: 'A', para: 'C' },
    ],
    esperado: {
      B: { inicio: '2026-09-09', termino: '2026-09-15', folgaTotal: 0, critica: true },
      C: { inicio: '2026-09-15', termino: '2026-09-15', inicioTardio: '2026-09-15', folgaTotal: 0, critica: true },
    },
    nota: 'O fim do projeto é 15/09 (B). C sem sucessora pode terminar em 15/09, e OMTP a leva para lá. O Project mostra OMTP com folga 0.',
  },
  {
    nome: 'Prazo final antes do término: folga negativa, crítica e indicador de prazo perdido',
    tarefas: [
      { id: 'A', dur: '2d', inicio: seg, prazo: '2026-09-07' },
      { id: 'B', dur: '5d' },
    ],
    vinculos: [{ de: 'A', para: 'B' }],
    esperado: { A: { termino: '2026-09-08', terminoTardio: '2026-09-07', folgaTotal: -1, critica: true, prazoPerdido: true } },
    nota: 'Prazo final não reprograma: A continua terminando em 08/09.',
  },
  {
    nome: 'Prazo final depois do término tardio não muda a folga',
    tarefas: [
      { id: 'A', dur: '2d', inicio: seg },
      { id: 'B', dur: '5d', prazo: '2026-09-22' },
    ],
    vinculos: [{ de: 'A', para: 'B' }],
    esperado: { B: { termino: '2026-09-15', terminoTardio: '2026-09-15', folgaTotal: 0, prazoPerdido: false } },
  },
  {
    nome: 'Prazo final numa tarefa com folga reduz a folga sem torná-la crítica',
    tarefas: [
      { id: 'A', dur: '2d', inicio: seg },
      { id: 'B', dur: '5d' },
      { id: 'C', dur: '1d', prazo: '2026-09-11' },
      { id: 'D', dur: '1d' },
    ],
    vinculos: [
      { de: 'A', para: 'B' },
      { de: 'A', para: 'C' },
      { de: 'B', para: 'D' },
      { de: 'C', para: 'D' },
    ],
    esperado: { C: { termino: '2026-09-09', terminoTardio: '2026-09-11', folgaTotal: 2, critica: false } },
    nota: 'Sem o prazo, C teria folga 4 (término tardio 15/09). O prazo em 11/09 corta para 2.',
  },
  {
    nome: 'Dois caminhos: só o mais longo é crítico; a folga do curto é a diferença',
    tarefas: [
      { id: 'A', dur: '2d', inicio: seg },
      { id: 'B', dur: '5d' },
      { id: 'C', dur: '2d' },
      { id: 'D', dur: '1d' },
    ],
    vinculos: [
      { de: 'A', para: 'B' },
      { de: 'A', para: 'C' },
      { de: 'B', para: 'D' },
      { de: 'C', para: 'D' },
    ],
    esperado: {
      A: { critica: true, folgaTotal: 0 },
      B: { inicio: '2026-09-09', termino: '2026-09-15', critica: true, folgaTotal: 0 },
      C: {
        inicio: '2026-09-09',
        termino: '2026-09-10',
        inicioTardio: '2026-09-14',
        terminoTardio: '2026-09-15',
        folgaTotal: 3,
        folgaLivre: 3,
        critica: false,
      },
      D: { inicio: '2026-09-16', termino: '2026-09-16', critica: true, determinantes: ['B'] },
    },
  },
  {
    nome: 'Folga total diferente da folga livre',
    tarefas: [
      { id: 'A', dur: '2d', inicio: seg },
      { id: 'B', dur: '1d' },
      { id: 'C', dur: '3d' },
      { id: 'E', dur: '10d', inicio: seg },
    ],
    vinculos: [
      { de: 'A', para: 'B' },
      { de: 'B', para: 'C' },
    ],
    esperado: {
      E: { inicio: '2026-09-07', termino: '2026-09-18', folgaTotal: 0, critica: true },
      C: { inicio: '2026-09-10', termino: '2026-09-14', terminoTardio: '2026-09-18', folgaTotal: 4, folgaLivre: 4 },
      B: { inicio: '2026-09-09', termino: '2026-09-09', terminoTardio: '2026-09-15', folgaTotal: 4, folgaLivre: 0 },
      A: { folgaTotal: 4, folgaLivre: 0 },
    },
    nota: 'O fim do projeto é 18/09 por causa de E. B pode atrasar 4 dias úteis sem atrasar o projeto, mas qualquer dia atrasa C.',
  },
  {
    nome: 'Resumo recebe envelope das datas, folga e criticidade dos filhos',
    tarefas: [
      { id: 'S', dur: '0d', nivel: 0 },
      { id: 'A', dur: '2d', inicio: seg, nivel: 1 },
      { id: 'B', dur: '3d', nivel: 1 },
      { id: 'X', dur: '8d', inicio: seg, nivel: 0 },
    ],
    vinculos: [{ de: 'A', para: 'B' }],
    esperado: {
      S: { inicio: '2026-09-07', termino: '2026-09-11', terminoTardio: '2026-09-16', folgaTotal: 3, critica: false },
      X: { inicio: '2026-09-07', termino: '2026-09-16', critica: true },
    },
  },
  {
    nome: 'Início real prende a tarefa contra a rede',
    tarefas: [
      { id: 'A', dur: '2d', inicio: seg },
      { id: 'B', dur: '2d', inicioReal: '2026-09-14', progresso: 50 },
    ],
    vinculos: [{ de: 'A', para: 'B' }],
    esperado: { B: { inicio: '2026-09-14', termino: '2026-09-15', determinantes: [] } },
  },
  {
    nome: 'Início real antes do que a rede permitia: a tarefa fica onde começou e o vínculo aparece desrespeitado',
    tarefas: [
      { id: 'A', dur: '2d', inicio: seg },
      { id: 'B', dur: '2d', inicioReal: '2026-09-07', progresso: 50 },
    ],
    vinculos: [{ de: 'A', para: 'B' }],
    esperado: { B: { inicio: '2026-09-07', termino: '2026-09-08', conflito: true } },
  },
  {
    nome: 'Predecessora determinante entre várias',
    tarefas: [
      { id: 'A', dur: '2d', inicio: seg },
      { id: 'X', dur: '1d', inicio: seg },
      { id: 'B', dur: '2d' },
    ],
    vinculos: [
      { de: 'A', para: 'B' },
      { de: 'X', para: 'B' },
    ],
    esperado: {
      B: { inicio: '2026-09-09', determinantes: ['A'] },
      X: { folgaTotal: 1, folgaLivre: 1, critica: false },
    },
  },
  {
    nome: 'Marco com NIAD',
    tarefas: [
      { id: 'A', dur: '2d', inicio: seg },
      { id: 'M', dur: '0d', restricao: { tipo: 'SNET', data: '2026-09-11' } },
    ],
    vinculos: [{ de: 'A', para: 'M' }],
    esperado: { M: { inicio: '2026-09-11', termino: '2026-09-11' } },
  },
  {
    nome: 'Data de restrição em fim de semana cai no dia útil seguinte',
    tarefas: [{ id: 'A', dur: '2d', inicio: seg, restricao: { tipo: 'SNET', data: '2026-09-12' } }],
    esperado: { A: { inicio: '2026-09-14', termino: '2026-09-15' } },
  },
  {
    nome: 'IT com defasagem conta a partir do início da predecessora (conferido pelo TruePPM contra .mpp do Project)',
    tarefas: [
      { id: 'A', dur: '3d', inicio: seg },
      { id: 'B', dur: '2d' },
    ],
    vinculos: [{ de: 'A', para: 'B', tipo: 'IT', lag: 2 }],
    esperado: { B: { inicio: '2026-09-07', termino: '2026-09-08' } },
    nota: 'A começa seg 08:00; +2 dias úteis = qua 08:00; B termina qua 08:00 = ter 17:00.',
  },
  {
    nome: 'Marco com defasagem que atravessa o fim de semana aparece no dia útil seguinte',
    tarefas: [
      { id: 'A', dur: '4d', inicio: seg },
      { id: 'M', dur: '0d' },
    ],
    vinculos: [{ de: 'A', para: 'M', lag: 2 }],
    esperado: { M: { inicio: '2026-09-14', termino: '2026-09-14' } },
    nota: 'A termina qui 10/09 17:00; +2 dias úteis = seg 14/09 17:00; o marco é mostrado na segunda.',
  },
];
