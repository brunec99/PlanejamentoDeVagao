import { normalizeActivities, normalizeProjects } from './normalize';
const ORIGIN = 'https://api.prevision.com.br';
// This module is imported only by a server Route Handler. No credentials enter client modules.
export class PrevisionError extends Error { constructor(message: string, public status: number) { super(message); } }
async function request(path: string): Promise<unknown> {
  const token = process.env.PREVISION_API_TOKEN;
  if (!token) throw new PrevisionError('Configure PREVISION_API_TOKEN no servidor.', 503);
  try {
    const response = await fetch(`${ORIGIN}${path}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new PrevisionError(response.status === 401 || response.status === 403 ? 'O Prevision recusou a credencial ou o acesso a esta obra.' : response.status === 429 ? 'Limite de consultas atingido. Aguarde um minuto.' : 'O Prevision não conseguiu atender a consulta.', response.status === 429 ? 429 : 502);
    return await response.json();
  } catch (error) {
    if (error instanceof PrevisionError) throw error;
    throw new PrevisionError('Não foi possível conectar ao Prevision. Tente novamente.', 502);
  }
}
export async function listProjects() { return normalizeProjects(await request('/construction/api/v1/projects')); }
export async function listActivities(projectId: string) {
  if (!/^\d+$/.test(projectId)) throw new PrevisionError('Identificador de obra inválido.', 400);
  return normalizeActivities(await request(`/construction-schedule/api/v1/project/${projectId}/activities`));
}
