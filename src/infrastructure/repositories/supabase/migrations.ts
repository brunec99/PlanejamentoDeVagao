/** Quais migrações o banco já tem, deduzido do que existe nele. As migrações são aplicadas à mão
 * no painel do Supabase e não deixam registro; o que dá para fazer é perguntar ao banco se cada
 * tabela, coluna ou função que uma migração cria está lá. Cada verificação é um `select` de zero
 * linhas, barato, e o código de erro diz se falta a tabela (42P01/PGRST205), a coluna (42703)
 * ou a função (42883/PGRST202). */
export interface MigrationCheck {
  migration: string;
  label: string;
  /** O que garante que a migração foi aplicada. */
  probe:
    | { kind: 'table'; table: string }
    | { kind: 'column'; table: string; column: string }
    | { kind: 'function'; name: string; args: Record<string, unknown> };
  /** O que para de funcionar sem ela. */
  effect: string;
  /** Faz parte do snapshot: sem ela, nenhuma tela carrega. */
  critical: boolean;
}

export const MIGRATION_CHECKS: MigrationCheck[] = [
  {
    migration: '0001_init',
    label: 'Tabelas do planejamento por vagões',
    probe: { kind: 'table', table: 'wagons' },
    effect: 'Nada funciona.',
    critical: true,
  },
  {
    migration: '0002_commit_planning_profiles',
    label: 'Perfis de usuário',
    probe: { kind: 'table', table: 'profiles' },
    effect: 'Login não provisiona perfil.',
    critical: true,
  },
  {
    migration: '0004_prevision_schedule',
    label: 'Cache do cronograma do Prevision',
    probe: { kind: 'table', table: 'prevision_activities' },
    effect: 'Integrações não lê nem salva o cronograma do Prevision.',
    critical: false,
  },
  {
    migration: '0006_sequence_start_date',
    label: 'Início da sequência',
    probe: { kind: 'column', table: 'production_sequences', column: 'start_date' },
    effect: 'Todas as telas.',
    critical: true,
  },
  {
    migration: '0007_teams_progress_baselines',
    label: 'Equipes, lançamentos, compromissos e linhas de base',
    probe: { kind: 'table', table: 'weekly_commitments' },
    effect: 'Todas as telas.',
    critical: true,
  },
  {
    migration: '0008_ifc_repository',
    label: 'Repositório IFC e regras de vínculo',
    probe: { kind: 'table', table: 'link_rules' },
    effect: 'Todas as telas.',
    critical: true,
  },
  {
    migration: '0009_restriction_lead_time',
    label: 'Lead time das restrições',
    probe: { kind: 'column', table: 'restrictions', column: 'lead_time_days' },
    effect: 'Todas as telas.',
    critical: true,
  },
  {
    migration: '0010_activity_network',
    label: 'Rede de atividades e anotações',
    probe: { kind: 'column', table: 'activities', column: 'notes' },
    effect: 'Todas as telas.',
    critical: true,
  },
  {
    migration: '0012_team_registry',
    label: 'Empresa no cadastro de equipes',
    probe: { kind: 'column', table: 'teams', column: 'company' },
    effect: 'Todas as telas.',
    critical: true,
  },
  {
    migration: '0013_monthly_plan',
    label: 'Plano do mês',
    probe: { kind: 'table', table: 'plan_tasks' },
    effect: 'Todas as telas.',
    critical: true,
  },
  {
    migration: '0014_weekly_from_scratch',
    label: 'Planilha semanal escrita do zero',
    probe: { kind: 'column', table: 'weekly_commitments', column: 'work_id' },
    effect: 'Todas as telas.',
    critical: true,
  },
  {
    migration: '0015_ifc_as_data',
    label: 'IFC transcrito em tabelas',
    probe: { kind: 'table', table: 'ifc_elements' },
    effect: 'Envio de IFC e quantitativo.',
    critical: false,
  },
  {
    migration: '0018_ifc_summary',
    label: 'Soma do quantitativo no banco',
    probe: { kind: 'function', name: 'ifc_version_summary', args: { p_version_id: '__probe__' } },
    effect: 'Quantitativo do modelo.',
    critical: false,
  },
  {
    migration: '0019_ifc_fragments',
    label: 'Geometria convertida (Fragments)',
    probe: { kind: 'table', table: 'ifc_fragments' },
    effect: 'Visualizadores 3D, federação e 4D.',
    critical: false,
  },
  {
    migration: '0020_outline_and_supplier',
    label: 'Item e subitem; fornecedor na planilha',
    probe: { kind: 'column', table: 'plan_tasks', column: 'level' },
    effect: 'Todas as telas.',
    critical: true,
  },
  {
    migration: '0021_ifc_federations',
    label: 'Composições do modelo federado',
    probe: { kind: 'table', table: 'ifc_federations' },
    effect: 'Salvar e abrir composições.',
    critical: false,
  },
  {
    migration: '0022_plan_link_types',
    label: 'Tipos de vínculo do plano do mês',
    probe: { kind: 'column', table: 'plan_dependencies', column: 'link_type' },
    effect: 'Todas as telas.',
    critical: true,
  },
  {
    migration: '0023_plan_revisions',
    label: 'Revisões, calendário e datas reais do plano',
    probe: { kind: 'column', table: 'plan_tasks', column: 'schedule_meta' },
    effect: 'Todas as telas.',
    critical: true,
  },
  {
    migration: '0024_long_term_plans',
    label: 'Planejador de longo prazo',
    probe: { kind: 'table', table: 'long_term_plans' },
    effect: 'Planejador de longo prazo.',
    critical: false,
  },
  {
    migration: '0025_work_settings',
    label: 'Configurações da obra (semana 1)',
    probe: { kind: 'table', table: 'work_settings' },
    effect: 'Semana 1 da numeração do curto prazo.',
    critical: false,
  },
  {
    migration: '0026_long_term_wagons',
    label: 'Geração de vagões pelo plano',
    probe: { kind: 'column', table: 'long_term_plans', column: 'synced_revision' },
    effect: 'Gerar vagões a partir do plano.',
    critical: false,
  },
  {
    migration: '0027_planning_snapshot',
    label: 'Leitura do planejamento numa ida só, por obra',
    probe: { kind: 'function', name: 'planning_snapshot', args: { p_work_ids: [] } },
    effect: 'Sem ela as telas carregam pelo caminho antigo, mais lento.',
    critical: false,
  },
  {
    migration: '0028_terminality',
    label: 'Terminalidade: pendências por apartamento, com fotos',
    probe: { kind: 'table', table: 'terminality_photos' },
    effect: 'A aba 5 (Terminalidade) não carrega nem grava; as demais seguem normais.',
    critical: false,
  },
];

export type MigrationStatus = { migration: string; label: string; effect: string; critical: boolean; applied: boolean; detail?: string };

const missingTable = (code?: string) => code === '42P01' || code === 'PGRST205';
const missingColumn = (code?: string) => code === '42703';
const missingFunction = (code?: string) => code === '42883' || code === 'PGRST202';

/** Interpreta o resultado de uma sondagem: ausente quando o código diz "não existe"; qualquer
 * outro erro é "não foi possível verificar", e não vira falso negativo. */
export function interpretProbe(check: MigrationCheck, error: { code?: string; message?: string } | null): MigrationStatus {
  const base = { migration: check.migration, label: check.label, effect: check.effect, critical: check.critical };
  if (!error) return { ...base, applied: true };
  const missing =
    check.probe.kind === 'table'
      ? missingTable(error.code)
      : check.probe.kind === 'column'
        ? missingColumn(error.code) || missingTable(error.code)
        : missingFunction(error.code);
  if (missing) return { ...base, applied: false };
  // Função que existe mas recusa o argumento de sondagem também conta como aplicada.
  if (check.probe.kind === 'function' && error.code && !missingFunction(error.code)) return { ...base, applied: true };
  return { ...base, applied: true, detail: `Não foi possível verificar: ${error.message ?? error.code ?? 'erro desconhecido'}` };
}

export function summarizeMigrations(statuses: MigrationStatus[]) {
  const missing = statuses.filter(s => !s.applied);
  return {
    total: statuses.length,
    applied: statuses.length - missing.length,
    missing: missing.map(s => s.migration),
    criticalMissing: missing.filter(s => s.critical).map(s => s.migration),
  };
}
