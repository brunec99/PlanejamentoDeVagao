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
  {
    migration: '0029_work_location',
    label: 'Local da obra para a previsão do tempo nos PDFs',
    probe: { kind: 'column', table: 'work_settings', column: 'latitude' },
    effect: 'Os PDFs do curto prazo saem sem a faixa do tempo e o local da obra não pode ser salvo.',
    critical: false,
  },
  {
    migration: '0030_test_access',
    label: 'Permissão de teste do médio prazo',
    probe: { kind: 'column', table: 'profiles', column: 'test_access' },
    effect: 'O botão "Permissão de teste" da tela de usuários não grava, e ninguém além de admins e desenvolvedores abre o médio prazo.',
    critical: false,
  },
  {
    migration: '0031_module_access',
    label: 'Módulos liberados por usuário',
    probe: { kind: 'column', table: 'profiles', column: 'module_access' },
    effect:
      'A liberação de módulos na tela de usuários não grava, e ninguém além de admins e desenvolvedores abre os módulos em desenvolvimento.',
    critical: false,
  },
  {
    migration: '0032_access_requests',
    label: 'Pedidos de acesso',
    probe: { kind: 'table', table: 'access_requests' },
    effect: 'O botão "Solicitar acesso" da tela de login não registra o pedido, e a lista de pedidos em Configurações não aparece.',
    critical: false,
  },
  {
    migration: '0034_terminality_resolution_note',
    label: 'Descrição da correção na terminalidade',
    probe: { kind: 'column', table: 'terminality_items', column: 'resolution_note' },
    effect: 'Resolver uma pendência com o texto "Como foi corrigido" não grava; sem o texto, resolve normalmente.',
    critical: false,
  },
  {
    migration: '0035_agent',
    label: 'Agente de IA: leituras guardadas, uso por pessoa e limites',
    probe: { kind: 'table', table: 'agent_usage' },
    effect: 'O agente de IA não guarda leituras, não contabiliza o custo nem aplica limites; o radar determinístico continua.',
    critical: false,
  },
  {
    migration: '0036_commitment_order',
    label: 'Ordem das linhas da planilha do curto prazo',
    probe: { kind: 'column', table: 'weekly_commitments', column: 'order_index' },
    effect: 'Inserir linha no meio e arrastar linhas na planilha só valem até recarregar: a ordem não fica gravada.',
    critical: false,
  },
  {
    migration: '0037_delete_work',
    label: 'Exclusão de obra pelo administrador',
    // O ator fictício não é admin: a função recusa antes de tocar em qualquer linha.
    probe: { kind: 'function', name: 'delete_work', args: { p_work_id: '__probe__', p_code: '__probe__', p_actor_id: '__probe__' } },
    effect: 'O botão "Excluir obra" das Configurações da obra responde pedindo a migração; nada é apagado.',
    critical: false,
  },
  {
    migration: '0038_lob',
    label: 'Linha de Balanço, fluxos de serviços e medições com fotos',
    probe: { kind: 'table', table: 'lob_activities' },
    effect: 'As visões Linha de Balanço, Fluxos de serviços e Medições da aba 1 respondem "indisponível"; o Planejador e os vagões seguem.',
    critical: false,
  },
  {
    migration: '0039_commitment_local',
    label: 'Local da linha da planilha do curto prazo',
    probe: { kind: 'column', table: 'weekly_commitments', column: 'local_id' },
    effect:
      'O campo Local da planilha da semana só vale até recarregar: o local não fica gravado, e o filtro de local do PDF não acha linhas.',
    critical: false,
  },
  {
    migration: '0040_safety',
    label: 'Segurança do trabalho: vistorias dos TSTs, com fotos',
    probe: { kind: 'table', table: 'safety_photos' },
    effect: 'A aba 6 (Segurança do trabalho) responde "indisponível" e ninguém pode ser marcado como TST; as demais seguem normais.',
    critical: false,
  },
  {
    migration: '0041_agent_global',
    label: 'Claudia geral: uso de IA sem obra ("Geral (várias obras)")',
    probe: { kind: 'function', name: 'agent_usage_allows_general', args: {} },
    effect:
      'A pergunta da Claudia geral que lê várias obras é gravada na obra da tela (ou na primeira consultada), e a linha "Geral (várias obras)" não aparece em Configurações → Agente de IA; o teto do mês segue somando tudo.',
    critical: false,
  },
  {
    migration: '0043_pending_board',
    label: 'Quadro de Restrições (aba 1.4): quadro Kanban com conversa e checklists',
    probe: { kind: 'table', table: 'pending_cards' },
    effect: 'O Quadro de Restrições (aba 1.4) responde "indisponível"; as demais abas seguem normais.',
    critical: false,
  },
  {
    migration: '0044_lob_costs',
    label: 'Apropriação de custos por pacote de serviço (peso do IDP na Linha de Balanço)',
    probe: { kind: 'table', table: 'lob_cost_items' },
    effect: 'A visão Custos da aba 1 pede a migração e não grava; o avanço físico e o IDP da Linha de Balanço seguem pesados pela duração.',
    critical: false,
  },
  {
    migration: '0045_headcount',
    label: 'Histograma de mão de obra: efetivo diário por empresa e função',
    probe: { kind: 'table', table: 'headcount_entries' },
    effect: 'A aba 7 (Histograma) responde "indisponível"; as demais seguem normais.',
    critical: false,
  },
  {
    migration: '0046_production',
    label: 'Controle de produtividade: serviço, equipe e produção do dia',
    probe: { kind: 'table', table: 'production_entries' },
    effect: 'A aba 8 (Controle de produtividade) responde "indisponível"; as demais seguem normais.',
    critical: false,
  },
  {
    migration: '0047_equipment_checklist',
    label: 'Checklist de equipamentos: modelos, equipamentos da obra e inspeções',
    probe: { kind: 'table', table: 'checklist_runs' },
    effect: 'A aba 9 (Checklist de equipamentos) responde "indisponível"; as demais seguem normais.',
    critical: false,
  },
  {
    migration: '0048_checklist_operator',
    label: 'Checklist de equipamentos: link do operador (QR), assinatura e fotos',
    probe: { kind: 'column', table: 'checklist_equipment', column: 'public_token' },
    effect: 'A aba 9 segue lendo, mas não grava inspeção nem equipamento, e o QR do operador não existe.',
    critical: false,
  },
  {
    migration: '0050_weekly_summary',
    label: 'Resumo semanal por e-mail: chave "Receber o resumo semanal" dos admins',
    probe: { kind: 'column', table: 'profiles', column: 'weekly_summary' },
    effect:
      'O resumo de sábado não é enviado a ninguém e a chave em Configurações → Usuários não grava; o envio avulso pelo botão segue funcionando.',
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
