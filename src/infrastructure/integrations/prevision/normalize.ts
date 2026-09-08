import type { ImportedActivity } from '../../../application/use-cases/commands';
import { validatePeriod } from '../../../domain/validation';
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Resposta inesperada do Prevision.');
  return value as Record<string, unknown>;
}
export function normalizeProjects(payload: unknown): { id: string; name: string }[] {
  const body = object(payload);
  if (!Array.isArray(body.projects)) throw new Error('Lista de obras ausente na resposta.');
  return body.projects.map(item => { const p = object(item); if (!/^\d+$/.test(String(p.id)) || typeof p.name !== 'string') throw new Error('Obra inválida na resposta.'); return { id: String(p.id), name: p.name }; });
}
export function normalizeActivities(payload: unknown): { rows: ImportedActivity[]; skipped: number } {
  const body = object(payload); if (!Array.isArray(body.activities)) throw new Error('Lista de atividades ausente na resposta.');
  const rows: ImportedActivity[] = []; let skipped = 0;
  for (const item of body.activities) {
    try {
      const a = object(item);
      if (!Number.isInteger(a.id) || typeof a.service_name !== 'string' || !a.service_name.trim() || typeof a.floor_name !== 'string' || !a.floor_name.trim() || typeof a.start_at !== 'string' || typeof a.end_at !== 'string' || typeof a.percentage_completed !== 'number' || !Number.isFinite(a.percentage_completed) || a.percentage_completed < 0 || a.percentage_completed > 100) throw new Error('Atividade inválida.');
      const start = a.start_at.slice(0,10); const end = a.end_at.slice(0,10); validatePeriod(start,end);
      rows.push({externalId:String(a.id),name:a.service_name,location:a.floor_name,plannedStart:start,plannedEnd:end,progress:a.percentage_completed});
    } catch { skipped++; }
  }
  return { rows, skipped };
}
