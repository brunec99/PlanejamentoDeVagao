/** Geradores dos cadastros da terminalidade (aba 5): nomes de pavimentos e de unidades a partir de
 * uma sequência ("do 1° ao 20° pavto", "01 a 04" → 401…404) ou de uma lista colada da planilha.
 * Funções puras, sem React, para a tela de configurações e os testes. O servidor continua sendo
 * quem rejeita nomes repetidos; aqui só se evita mandar o que já existe. */

/** Teto de uma geração de uma vez: protege de um "1 a 2000" digitado sem querer. */
export const MAX_GENERATED = 200;

/** Chave de comparação de nomes: sem acento, sem caixa e com espaços normalizados, como o servidor. */
export const nameKey = (name: string) => name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('pt-BR');

/** Remove vazios e repetidos (mantém a primeira grafia), preservando a ordem. */
export function uniqueNames(names: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of names) {
    const name = raw.replace(/\s+/g, ' ').trim();
    const key = nameKey(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(name);
  }
  return result;
}

/** Lista livre colada ou digitada. Por padrão aceita vírgula, ponto e vírgula, tabulação e quebra de
 * linha ("401, 402; 403\n404"); com `lines: true`, só a quebra de linha separa (pavimentos podem ter
 * vírgula no nome). */
export function parseNameList(text: string, { lines = false }: { lines?: boolean } = {}): string[] {
  return uniqueNames(text.split(lines ? /\r?\n/ : /[\r\n,;\t]+/));
}

/** Só os nomes que ainda não existem (comparação sem acento e sem caixa). */
export function missingNames(existing: readonly string[], candidates: readonly string[]): string[] {
  const taken = new Set(existing.map(nameKey));
  return uniqueNames(candidates).filter(name => !taken.has(nameKey(name)));
}

function checkRange(from: number, to: number, what: string) {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < 0)
    throw new RangeError(`Informe números inteiros, a partir de zero, para ${what}.`);
  if (from > to) throw new RangeError(`O início precisa ser menor ou igual ao fim (${what}).`);
  if (to - from + 1 > MAX_GENERATED) throw new RangeError(`Gere no máximo ${MAX_GENERATED} ${what} de uma vez.`);
}

/** "1° pavto" … "20° pavto", com extras antes (Garagem, Térreo) e depois (Cobertura). A ordem é a de
 * baixo para cima, a mesma do `orderIndex`. Lança `RangeError` com mensagem pronta para a tela. */
export function floorNames({
  from,
  to,
  suffix = '° pavto',
  extras = {},
}: {
  from: number;
  to: number;
  suffix?: string;
  extras?: { before?: readonly string[]; after?: readonly string[] };
}): string[] {
  checkRange(from, to, 'pavimentos');
  const numbered = Array.from({ length: to - from + 1 }, (_, i) => `${from + i}${suffix}`);
  return uniqueNames([...(extras.before ?? []), ...numbered, ...(extras.after ?? [])]);
}

/** Unidades de um pavimento pelo número dele: pavimento 4, de 1 a 4 → "401" … "404"; pavimento 12 →
 * "1201" …. `pad` é o número de dígitos da unidade dentro do andar. */
export function unitNames({ floorNumber, from, to, pad = 2 }: { floorNumber: number; from: number; to: number; pad?: number }): string[] {
  if (!Number.isInteger(floorNumber) || floorNumber < 0) throw new RangeError('O pavimento precisa ter um número para gerar as unidades.');
  if (!Number.isInteger(pad) || pad < 1 || pad > 4) throw new RangeError('Use de 1 a 4 dígitos para a unidade.');
  checkRange(from, to, 'unidades');
  if (String(to).length > pad) throw new RangeError(`Com ${pad} dígito(s), a unidade vai no máximo até ${'9'.repeat(pad)}.`);
  return Array.from({ length: to - from + 1 }, (_, i) => `${floorNumber}${String(from + i).padStart(pad, '0')}`);
}

/** Número do pavimento no nome: "4° pavto", "4º Pavimento", "4 pav", "Pavimento 4" → 4. Sem número
 * ("Térreo", "Cobertura") → null. */
export function parseFloorNumber(name: string): number | null {
  const text = name.trim();
  const leading = /^(\d+)/.exec(text);
  if (leading) return Number(leading[1]);
  const trailing = /^(?:pav(?:to|imento)?|andar)\.?\s*(\d+)\b/i.exec(text);
  return trailing ? Number(trailing[1]) : null;
}

export interface FloorUnitPlan {
  floorId: string;
  floorName: string;
  /** Nomes a criar (já sem os que o pavimento tem). */
  names: string[];
  /** Por que o pavimento fica de fora: sem número no nome ou já tem todas as unidades do padrão. */
  skipped?: 'sem-numero' | 'completo';
}

/** O mesmo padrão de unidades aplicado a vários pavimentos: um plano por pavimento, na ordem dada. */
export function planUnitsForFloors(
  floors: readonly { id: string; name: string }[],
  existingByFloor: ReadonlyMap<string, readonly string[]>,
  pattern: { from: number; to: number; pad?: number },
): FloorUnitPlan[] {
  return floors.map(floor => {
    const floorNumber = parseFloorNumber(floor.name);
    if (floorNumber === null) return { floorId: floor.id, floorName: floor.name, names: [], skipped: 'sem-numero' };
    const names = missingNames(existingByFloor.get(floor.id) ?? [], unitNames({ floorNumber, ...pattern }));
    return names.length
      ? { floorId: floor.id, floorName: floor.name, names }
      : { floorId: floor.id, floorName: floor.name, names, skipped: 'completo' };
  });
}

/** Resumo curto de uma lista longa para a prévia: "401, 402 … 404". */
export function previewNames(names: readonly string[], head = 3): string {
  if (names.length <= head + 1) return names.join(', ');
  return `${names.slice(0, head).join(', ')} … ${names[names.length - 1]}`;
}
