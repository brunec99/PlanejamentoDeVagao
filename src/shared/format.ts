export const wagonLabel = (number: number) => `Vagão ${String(number).padStart(2, '0')}`;
export function formatDate(value: string) { return value.slice(8, 10) + '/' + value.slice(5, 7) + '/' + value.slice(0, 4); }
export function formatTimestamp(value: string) { return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(value)); }
export const statusLabels = { terminal: 'Terminal', in_production: 'Em produção', restricted: 'Com restrição', not_started: 'Não iniciado' };
export const activityLabels = { not_started: 'Não iniciada', in_progress: 'Em andamento', completed: 'Concluída' };
export const releaseLabels = { initial: 'Inicial', normal: 'Normal', exceptional: 'Excepcional' };
export const planningPath = (workId: string) => `/obras/${encodeURIComponent(workId)}/planejamento`;
export const wagonPath = (workId: string, wagonId: string) => `/obras/${encodeURIComponent(workId)}/vagoes/${encodeURIComponent(wagonId)}`;
