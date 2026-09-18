/** A geometria das telas 3D vem da transcrição, não do arquivo: cada elemento é a caixa envolvente
 * gravada na tabela. O IFC inteiro esbarraria no limite por arquivo do Storage e travaria o
 * navegador; seis números por elemento cabem numa consulta paginada.
 *
 * A caixa está em coordenadas do arquivo, com Z na vertical — o mesmo eixo da elevação que o IFC
 * declara no pavimento. Girar para a convenção da tela (Y na vertical) é trabalho de quem desenha.
 *
 * Duas telas leem daqui: o visualizador de modelos, com uma versão, e o 4D, que federa várias. */

type Raw = Record<string, unknown>;
// Coluna `numeric` do Postgres chega como string no JSON: todo número da resposta passa por Number().
const num = (value: unknown) => Number(value);
const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

/** Ausência com nome: o filtro por pavimento usa string vazia para dizer "todos", então o elemento
 * sem pavimento na estrutura espacial precisa de um rótulo próprio em vez de ''. */
export const NO_STOREY = 'Sem pavimento';
export const NO_CLASS = 'Sem classe IFC';

export interface BoxRow {
  versionId: string;
  expressId: number;
  globalId: string;
  ifcClass: string;
  name: string;
  storey: string;
  min: [number, number, number];
  max: [number, number, number];
}
/** `declared` é quanto a tabela diz ter; `rows` é quanto veio com caixa numérica utilizável. A
 * diferença entre os dois é informação de tela: elemento transcrito sem geometria aproveitável. */
export interface BoxReading { rows: BoxRow[]; declared: number }
export type BoxProgress = (read: number, declared: number) => void;

async function readVersion(versionId: string, signal: AbortSignal, rows: BoxRow[], onPage: (read: number, total: number) => void) {
  let read = 0;
  for (let page = 0; ; page++) {
    const res = await fetch(`/api/ifc/elements?versionId=${encodeURIComponent(versionId)}&geometria=1&pagina=${page}`, { cache: 'no-store', signal });
    const body: Raw = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(text(body.error) || 'Não foi possível ler a geometria transcrita desta versão.');
    const batch = Array.isArray(body.elementos) ? body.elementos as Raw[] : [];
    const total = num(body.total) || 0;
    const size = num(body.porPagina) || batch.length;
    read += batch.length;
    for (const item of batch) {
      const min: [number, number, number] = [num(item.min_x), num(item.min_y), num(item.min_z)];
      const max: [number, number, number] = [num(item.max_x), num(item.max_y), num(item.max_z)];
      if (![...min, ...max].every(Number.isFinite)) continue;
      rows.push({
        versionId, expressId: num(item.express_id), globalId: text(item.global_id),
        ifcClass: text(item.ifc_class) || NO_CLASS, name: text(item.name),
        storey: text(item.storey) || NO_STOREY, min, max,
      });
    }
    onPage(read, total);
    if (!batch.length || !size || (page + 1) * size >= total) return { read, declared: total };
  }
}

/** Lê as caixas de uma ou mais versões, em série, somando o progresso de todas — o 4D mostra o
 * modelo federado como um só, e uma barra por versão não diria nada ao engenheiro. */
export async function readBoxes(versionIds: string[], signal: AbortSignal, onProgress: BoxProgress): Promise<BoxReading> {
  const rows: BoxRow[] = [];
  let doneRead = 0, doneDeclared = 0;
  for (const versionId of versionIds) {
    const version = await readVersion(versionId, signal, rows, (read, total) => onProgress(doneRead + read, doneDeclared + total));
    doneRead += version.read; doneDeclared += version.declared;
  }
  return { rows, declared: doneDeclared };
}
