import type { IfcModel, IfcModelVersion } from './entities';

/** Composições são cópias imutáveis: novos uploads não trocam suas versões. */
export interface SavedFederation {
  id: string;
  workId: string;
  name: string;
  versionIds: string[];
  createdAt: string;
  createdBy: string;
}

export function validateFederation(input: unknown, workId: string, models: Pick<IfcModel, 'id' | 'workId'>[], versions: Pick<IfcModelVersion, 'id' | 'modelId'>[]) {
  if (!input || typeof input !== 'object') throw new Error('Composição inválida.');
  const body = input as Record<string, unknown>;
  if (typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > 120) throw new Error('Informe um nome de até 120 caracteres.');
  if (!Array.isArray(body.versionIds) || !body.versionIds.length || body.versionIds.length > 200 || body.versionIds.some(id => typeof id !== 'string' || !id)) {
    throw new Error('Escolha de 1 a 200 modelos para a composição.');
  }
  const versionIds = body.versionIds as string[];
  const inWork = new Set(models.filter(model => model.workId === workId).map(model => model.id));
  const byId = new Map(versions.map(version => [version.id, version]));
  const seen = new Set<string>();
  for (const id of versionIds) {
    const version = byId.get(id);
    if (!version || !inWork.has(version.modelId)) throw new Error('Uma versão não pertence a esta obra ou não está disponível.');
    if (seen.has(version.modelId)) throw new Error('Escolha apenas uma versão de cada modelo.');
    seen.add(version.modelId);
  }
  return { name: body.name.trim(), versionIds: [...versionIds] };
}
