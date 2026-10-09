import { addDays, startOfWeek } from './validation';

/** Semana encerrada do curto prazo (decisão do usuário, 08/10/2026): depois que a semana fica para trás,
 * os dados congelam e só admins alteram. A equipe tem até a terça-feira seguinte, inclusive, para lançar o
 * fechamento (Sim/Não, causa, justificativa); a partir da quarta, só admins. "Hoje" é a data civil de São
 * Paulo (`todayInSaoPaulo`), a mesma que o servidor usa nos comandos. */
export const WEEK_LOCK_GRACE_DAYS = 8;

/** Último dia em que a semana ainda aceita edição de quem não é admin: a terça-feira seguinte. */
export const weekLockLastDay = (weekStart: string) => addDays(startOfWeek(weekStart), WEEK_LOCK_GRACE_DAYS);

export const isWeekLocked = (weekStart: string, today: string) => today > weekLockLastDay(weekStart);

/** Quem pode alterar a semana: qualquer um com permissão de edição enquanto aberta; depois, só admin. */
export const canEditWeek = (weekStart: string, today: string, role: string) => role === 'admin' || !isWeekLocked(weekStart, today);
