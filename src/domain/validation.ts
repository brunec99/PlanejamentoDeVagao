export function requireText(value: string, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} é obrigatório.`);
  return value.trim();
}
export function validateDate(value: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) throw new Error('Data inválida.');
}
export function validatePeriod(start: string, end: string): void {
  validateDate(start); validateDate(end);
  if (end < start) throw new Error('Término deve ser igual ou posterior ao início.');
}
export function periodDays(start: string, end: string, business: boolean): number {
  validatePeriod(start, end);
  let count = 0;
  for (let time = Date.parse(start); time <= Date.parse(end); time += 86400000) {
    const day = new Date(time).getUTCDay();
    if (!business || (day !== 0 && day !== 6)) count++;
  }
  return count;
}
