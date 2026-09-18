/** O mapa liga as duas metades do modelo. A geometria vive convertida (Fragments), que sabe
 * desenhar mas não sabe de obra; a tabela transcrita sabe a classe e o pavimento de cada
 * elemento, mas não desenha. O GlobalId do IFC é o que existe nos dois lados — é por ele que a
 * regra de vínculo, que decide o serviço a partir de pavimento e tipo, alcança o item na cena.
 * O nome vem daqui também, e não do .frag: assim a geometria convertida dispensa os atributos e
 * fica menor, sem a tela perder o que mostrar quando o engenheiro clica num elemento.
 *
 * Duas telas leem daqui: o visualizador de modelos, com uma versão, e o 4D, que federa várias. */

type Raw = Record<string, unknown>;
const num = (value: unknown) => Number(value);
const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

/** Ausência com nome: o filtro por pavimento usa string vazia para dizer "todos", então o
 * elemento sem pavimento na estrutura espacial precisa de um rótulo próprio em vez de ''. */
export const NO_STOREY = 'Sem pavimento';
export const NO_CLASS = 'Sem classe IFC';

export interface MapRow { versionId: string; globalId: string; ifcClass: string; name: string; storey: string }
/** `declared` é quanto a tabela diz ter; `rows` é quanto veio com GlobalId utilizável. */
export interface ElementMap { rows: MapRow[]; declared: number }
export type MapProgress = (read: number, declared: number) => void;

async function readVersion(versionId: string, signal: AbortSignal, rows: MapRow[], onPage: (read: number, total: number) => void) {
  let read = 0;
  for (let page = 0; ; page++) {
    const res = await fetch(`/api/ifc/elements?versionId=${encodeURIComponent(versionId)}&mapa=1&pagina=${page}`, { cache: 'no-store', signal });
    const body: Raw = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(text(body.error) || 'Não foi possível ler os elementos transcritos desta versão.');
    const batch = Array.isArray(body.elementos) ? body.elementos as Raw[] : [];
    const total = num(body.total) || 0;
    const size = num(body.porPagina) || batch.length;
    read += batch.length;
    for (const item of batch) {
      const globalId = text(item.global_id);
      if (!globalId) continue;
      rows.push({ versionId, globalId, ifcClass: text(item.ifc_class) || NO_CLASS, name: text(item.name), storey: text(item.storey) || NO_STOREY });
    }
    onPage(read, total);
    if (!batch.length || !size || (page + 1) * size >= total) return { read, declared: total };
  }
}

/** Lê o mapa de uma ou mais versões, em série, somando o progresso — o 4D mostra o conjunto
 * federado como um só, e uma barra por versão não diria nada ao engenheiro. */
export async function readElementMap(versionIds: string[], signal: AbortSignal, onProgress: MapProgress): Promise<ElementMap> {
  const rows: MapRow[] = [];
  let doneRead = 0, doneDeclared = 0;
  for (const versionId of versionIds) {
    const version = await readVersion(versionId, signal, rows, (read, total) => onProgress(doneRead + read, doneDeclared + total));
    doneRead += version.read; doneDeclared += version.declared;
  }
  return { rows, declared: doneDeclared };
}
