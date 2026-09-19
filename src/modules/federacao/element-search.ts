import type { MapRow } from '../ifc/element-map';

export interface SearchPart { versionId: string; label: string; rows: Map<number, MapRow> }
export interface ElementResult { versionId: string; label: string; localId: number; row: MapRow }
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Busca apenas nos modelos/pavimentos visíveis; limita o DOM sem truncar a contagem. */
export function searchElements(parts: SearchPart[], query: string, hidden: string[], storey: string, limit = 50) {
  const words = normalize(query.trim()).split(/\s+/).filter(Boolean);
  const results: ElementResult[] = [];
  let total = 0;
  for (const part of parts) {
    if (hidden.includes(part.versionId)) continue;
    for (const [localId, row] of part.rows) {
      if (storey && row.storey !== storey) continue;
      if (words.length) {
        const value = normalize(`${row.name} ${row.ifcClass} ${row.globalId} ${row.storey} ${part.label}`);
        if (!words.every(word => value.includes(word))) continue;
      }
      total++;
      if (results.length < limit) results.push({ versionId: part.versionId, label: part.label, localId, row });
    }
  }
  return { results, total };
}
