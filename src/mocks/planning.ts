import type { PlanningData, RecordBase } from '../domain/entities';
export const DEMO_DATE = '2026-09-08';
const base = (id: string): RecordBase => ({ id, createdAt: '2026-08-20T12:00:00Z', updatedAt: '2026-09-08T12:00:00Z' });
export function createMockData(): PlanningData {
  const progresses = [100, 75, 40, 25, 0, 100];
  const periods = [
    ['2026-08-22', '2026-08-26'], ['2026-08-27', '2026-08-31'],
    ['2026-09-01', '2026-09-05'], ['2026-09-06', '2026-09-10'],
    ['2026-09-11', '2026-09-15'], ['2026-09-01', '2026-09-05'],
  ];
  return {
    works: [
      { ...base('obra-1'), name: 'Residencial Horizonte', code: 'RH-01', description: 'Produção em ciclos de cinco dias', active: true },
      { ...base('obra-2'), name: 'Edifício Aurora', code: 'EA-02', description: 'Obra em preparação, ainda sem vagões planejados', active: true },
    ],
    locations: [
      { ...base('local-1'), workId: 'obra-1', name: '1º pavimento · Torre A', code: 'TA-P1' },
      { ...base('local-2'), workId: 'obra-1', name: '2º pavimento · Torre A', code: 'TA-P2' },
      { ...base('local-3'), workId: 'obra-1', name: 'Térreo · Torre B', code: 'TB-TER' },
    ],
    sequences: ['seq-1', 'seq-2', 'seq-3'].map((id, i) => ({ ...base(id), workId: 'obra-1', name: ['Planejamento principal', 'Planejamento complementar', 'Ciclo piloto'][i], defaultTaktDays: 5, calendar: 'calendar_days' })),
    wagons: progresses.map((_, i) => ({
      ...base(`v${i + 1}`), sequenceId: i < 3 ? 'seq-1' : i < 5 ? 'seq-2' : 'seq-3',
      number: i + 1, predecessorId: i === 1 || i === 2 || i === 4 ? `v${i}` : undefined,
      plannedStart: periods[i][0], plannedEnd: periods[i][1], taktDays: 5,
      actualStart: i === 4 ? undefined : periods[i][0], responsibleIds: ['user-1'],
    })),
    // Every wagon groups different trades and locations in the same temporal window.
    activities: [
      ...progresses.map((progress, i) => ({ ...base(`a${i + 1}`), wagonId: `v${i + 1}`, name: 'Execução de revestimentos', locationId: 'local-1', responsibleId: 'user-1', plannedStart: periods[i][0], plannedEnd: periods[i][1], progress, status: progress === 100 ? 'completed' as const : progress > 0 ? 'in_progress' as const : 'not_started' as const, weight: 2, mandatory: true, origin: 'mock' as const })),
      ...progresses.map((progress, i) => ({ ...base(`b${i + 1}`), wagonId: `v${i + 1}`, name: 'Instalação de pontos elétricos', locationId: i % 2 === 0 ? 'local-2' : 'local-3', responsibleId: 'user-2', plannedStart: periods[i][0], plannedEnd: periods[i][1], progress, status: progress === 100 ? 'completed' as const : progress > 0 ? 'in_progress' as const : 'not_started' as const, weight: 1, mandatory: true, origin: 'mock' as const })),
    ],
    criteria: progresses.map((_, i) => ({ ...base(`c${i + 1}`), activityId: `a${i + 1}`, description: 'Inspeção de qualidade aprovada', mandatory: true, fulfilled: i === 0, confirmedAt: i === 0 ? '2026-08-26T15:00:00Z' : undefined, confirmedBy: i === 0 ? 'user-1' : undefined })),
    pendingItems: [{ ...base('p1'), wagonId: 'v2', description: 'Concluir revestimentos e pontos elétricos do período e aprovar a inspeção', responsibleId: 'user-1', dueDate: '2026-09-07', status: 'open', blocksTerminality: true }],
    restrictions: [{ ...base('r1'), wagonId: 'v3', activityId: 'a3', description: 'Material de revestimento aguardando entrega', responsibleId: 'user-1', dueDate: '2026-09-09', status: 'open', blocksExecution: true, blocksTerminality: true }],
    releases: [
      ...['v4', 'v6'].map((wagonId, i) => ({ ...base(`initial-${wagonId}`), wagonId, type: 'initial' as const, authorizedBy: 'user-1', releasedAt: `2026-09-0${i === 0 ? 6 : 1}T10:00:00Z`, acceptedPendingIds: [], acknowledgedDebtIds: [] })),
      { ...base('l1'), wagonId: 'v1', type: 'initial', authorizedBy: 'user-1', releasedAt: '2026-08-22T10:00:00Z', acceptedPendingIds: [], acknowledgedDebtIds: [] },
      { ...base('l2'), wagonId: 'v2', predecessorId: 'v1', type: 'normal', authorizedBy: 'user-1', releasedAt: '2026-08-27T10:00:00Z', acceptedPendingIds: [], acknowledgedDebtIds: [] },
      { ...base('l3'), wagonId: 'v3', predecessorId: 'v2', type: 'exceptional', justification: 'Equipe dedicada concluirá as pendências sem interferir nas atividades do próximo período.', authorizedBy: 'user-1', regularizationResponsibleId: 'user-1', dueDate: '2026-09-07', releasedAt: '2026-09-01T10:00:00Z', acceptedPendingIds: ['p1'], acknowledgedDebtIds: [] },
    ],
    debts: [{ ...base('d1'), pendingItemId: 'p1', releaseId: 'l3', responsibleId: 'user-1', dueDate: '2026-09-07' }],
    users: [
      { ...base('user-3'), name: 'Ana Souza', role: 'viewer', workIds: ['obra-1', 'obra-2'] },
      { ...base('user-1'), name: 'Marina Costa', role: 'manager', workIds: ['obra-1', 'obra-2'] },
      { ...base('user-2'), name: 'Rafael Lima', role: 'planner', workIds: ['obra-1'] },
    ],
    history: [{ id: 'h1', entityId: 'v3', entityType: 'wagon', action: 'exceptional_release', authorId: 'user-1', occurredAt: '2026-09-01T10:00:00Z', changes: { releaseId: 'l3', pendingItemIds: ['p1'] } }],
  };
}
