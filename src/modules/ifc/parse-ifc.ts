const UNREADABLE = 'Não foi possível ler o arquivo como IFC. Confirme que é um modelo IFC válido e não corrompido.';

export interface IfcSummary { storeys: string[]; elementCount: number }

/** Lê pavimentos e quantidade de elementos no navegador. Só funciona no cliente: o `import` é dinâmico para o carregador do WASM nunca rodar no SSR. */
export async function readIfcSummary(file: File): Promise<IfcSummary> {
  if (!/\.ifc$/i.test(file.name)) throw new Error('O repositório armazena apenas modelos IFC.');
  if (file.size === 0) throw new Error('Arquivo vazio.');
  const { IfcAPI, IFCBUILDINGSTOREY, IFCELEMENT } = await import('web-ifc');
  const api = new IfcAPI();
  // O script copy-wasm publica apenas web-ifc.wasm em public/wasm/: caminho absoluto e thread única para não buscar a variante multithread.
  api.SetWasmPath('/wasm/', true);
  try { await api.Init(undefined, true); }
  catch { throw new Error('Não foi possível iniciar o leitor de IFC neste navegador.'); }

  const bytes = new Uint8Array(await file.arrayBuffer());
  let modelId = -1;
  try {
    modelId = api.OpenModel(bytes);
    if (modelId < 0 || !api.IsModelOpen(modelId)) throw new Error(UNREADABLE);
    const storeys: string[] = [];
    for (const id of api.GetLineIDsWithType(modelId, IFCBUILDINGSTOREY)) {
      const line = api.GetLine(modelId, id);
      const name = String(line?.Name?.value ?? line?.LongName?.value ?? '').trim();
      if (name && !storeys.includes(name)) storeys.push(name);
    }
    const elementCount = api.GetLineIDsWithType(modelId, IFCELEMENT, true).size();
    if (storeys.length === 0 && elementCount === 0) throw new Error(`${UNREADABLE} Nenhum pavimento ou elemento foi encontrado.`);
    return { storeys, elementCount };
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new Error(detail.startsWith(UNREADABLE) ? detail : `${UNREADABLE} (${detail})`);
  } finally {
    if (modelId >= 0) api.CloseModel(modelId);
  }
}
