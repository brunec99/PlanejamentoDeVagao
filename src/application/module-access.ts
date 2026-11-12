import type { Command } from './use-cases/commands';

/** Acesso aos módulos da obra. Abertos a todos que têm a obra: a lista de obras, o dashboard (aba 0) e as
 * configurações da obra. Os demais — inclusive o curto prazo e a terminalidade desde 08/11/2026 e, desde
 * 12/11/2026, a segurança do trabalho, o checklist de equipamentos e o Quadro de Restrições (migração 0049,
 * que manteve quem já usava) — ficam com quem desenvolve, com os admins e com quem tem o módulo liberado
 * pelo admin. Ser desenvolvedor não é um papel: soma-se ao papel (consulta, planejador, gestor, admin) e às
 * obras liberadas, que continuam valendo. Funções puras: o proxy, as rotas e os testes usam as mesmas. */

/** Primeiro admin, provisionado no primeiro login; também o desenvolvedor quando `DEVELOPER_EMAILS` falta. */
export const BOOTSTRAP_ADMIN_EMAIL = 'bruno.engenharia@atrincorporadora.com.br';

export const RESTRICTED_MODULE_MESSAGE = 'Módulo não liberado para você. Peça a liberação a um administrador.';

/** Seções da obra liberadas por pessoa. Ficam abertas `dashboard` e `configuracoes`. `restricoes` (o Kanban, antes
 * dentro de `vagoes`), `seguranca` e `checklist` entraram em 12/11/2026, a pedido do usuário. Curto prazo e
 * terminalidade entraram aqui em 08/11/2026, a pedido do usuário; quem já os usava foi mantido (migração 0042).
 * O histograma (aba 7) e o controle de produtividade (aba 8) nasceram aqui em 11/11/2026. */
export const RESTRICTED_SECTIONS = [
  'longo-prazo',
  'vagoes',
  'medio-prazo',
  'curto-prazo',
  'restricoes',
  'terminalidade',
  'histograma',
  'produtividade',
  'seguranca',
  'checklist',
  'federacao',
  'ifc',
  'dividas',
  'importar',
] as const;

/** APIs que só servem às seções restritas. `/api/history` é lido pelo vagão e pelo médio prazo. A terminalidade
 * inclui `/api/terminalidade/campo`, de onde o modo de campo (`/campo/terminalidade`, fora do proxy) lê os dados. */
export const RESTRICTED_API_PREFIXES = [
  '/api/long-term-plan',
  '/api/lob',
  '/api/prevision',
  '/api/ifc',
  '/api/history',
  '/api/pendencias',
  '/api/curto-prazo',
  '/api/terminalidade',
  '/api/histograma',
  '/api/produtividade',
  // 12/11/2026. `/api/seguranca/campo` (modo de campo, fora do proxy) e `/api/checklist/arquivos` vão junto.
  // O link do operador do checklist fica em `/api/publico/`, fora do proxy, e não depende de módulo.
  '/api/seguranca',
  '/api/checklist',
] as const;

/** Comandos das equipes (configurações da obra) e da administração; o resto é dos módulos liberados por pessoa
 * (os do curto prazo saíram daqui em 08/11/2026). Os papéis continuam conferidos em `applyCommand`. */
export const NON_DEVELOPER_COMMANDS: ReadonlySet<Command['type']> = new Set<Command['type']>([
  'create_team',
  'update_team',
  'delete_team',
  'set_role',
  'set_module_access',
  'grant_access',
  'revoke_access',
  'set_access_batch',
  'create_work',
]);

/** Catálogo de módulos que a tela de usuários mostra (14/10/2026): os abertos não viram coluna na grade; os
 * demais o admin libera por pessoa (`User.modules`), sem torná-la admin nem desenvolvedora. Admin e
 * `DEVELOPER_EMAILS` veem todos. */
export interface ModuleInfo {
  section: string;
  label: string;
  hint: string;
  group: 'Planejamento' | 'Apoio';
  /** Aberto a todos que têm a obra; não depende de liberação. */
  open?: boolean;
}
export const MODULES: readonly ModuleInfo[] = [
  // 04/11/2026: a aba 0 é aberta a todos; dentro dela, cada quadro segue o acesso ao módulo de origem.
  { section: 'dashboard', label: 'Dashboard', hint: 'Os cinco níveis numa página, com filtros e PDF', group: 'Planejamento', open: true },
  { section: 'longo-prazo', label: 'Longo prazo', hint: 'Linha de balanço, fluxos e medições', group: 'Planejamento' },
  { section: 'vagoes', label: 'Vagões', hint: 'Períodos de takt, atividades e liberações (abre pelo longo prazo)', group: 'Planejamento' },
  { section: 'medio-prazo', label: 'Médio prazo', hint: 'Cronograma do mês no padrão do Project', group: 'Planejamento' },
  // 08/11/2026: curto prazo e terminalidade deixaram de ser abertos a todos e passaram a ser liberados por pessoa.
  { section: 'curto-prazo', label: 'Curto prazo', hint: 'Planilha semanal, PPC e causas', group: 'Planejamento' },
  // 12/11/2026: o Kanban (antes "Lista de pendência", dentro de Vagões) com item e liberação próprios.
  {
    section: 'restricoes',
    label: 'Quadro de Restrições',
    hint: 'Kanban de pendências com prazo, conversa e checklist',
    group: 'Planejamento',
  },
  { section: 'terminalidade', label: 'Terminalidade', hint: 'Pendências por apartamento, com fotos', group: 'Planejamento' },
  // Liberada por pessoa desde 12/11/2026 (antes, aberta a todos); dentro dela só o tipo TST (`User.tst`) e os admins gravam.
  { section: 'seguranca', label: 'Segurança do trabalho', hint: 'Vistorias dos TSTs, com fotos', group: 'Planejamento' },
  // 11/11/2026: aba 7, liberada por pessoa; quem tem o módulo lança, o papel consulta só visualiza.
  { section: 'histograma', label: 'Histograma', hint: 'Efetivo diário por empresa e função', group: 'Planejamento' },
  // 11/11/2026: aba 8, liberada por pessoa; quem tem o módulo lança, o papel consulta só visualiza.
  { section: 'produtividade', label: 'Produtividade', hint: 'Serviço, equipe e produção por homem-dia', group: 'Planejamento' },
  // Liberado por pessoa desde 12/11/2026; TST e admins registram, o cadastro é do admin. O QR do operador não passa por aqui.
  { section: 'checklist', label: 'Checklist de equipamentos', hint: 'Inspeção diária, semanal e mensal', group: 'Planejamento' },
  { section: 'federacao', label: 'Modelo federado', hint: 'Modelos IFC combinados', group: 'Apoio' },
  { section: 'ifc', label: 'Arquivos IFC', hint: 'Repositório e versões dos modelos', group: 'Apoio' },
  { section: 'dividas', label: 'Dívidas', hint: 'Pendências que passam de um vagão para outro', group: 'Apoio' },
  { section: 'importar', label: 'Integrações', hint: 'Importação do Prevision', group: 'Apoio' },
  { section: 'configuracoes', label: 'Configurações da obra', hint: 'Semana 1, local e equipes', group: 'Apoio', open: true },
];
const RESTRICTED = new Set<string>(RESTRICTED_SECTIONS);
const isRestrictedSection = (section: string) => RESTRICTED.has(section);
export const grantableSection = (section: string) => isRestrictedSection(section);

/** APIs de cada módulo: quem tem o módulo liberado usa a API dele. */
const SECTION_APIS: Record<string, readonly string[]> = {
  'longo-prazo': ['/api/long-term-plan', '/api/lob', '/api/prevision'],
  vagoes: ['/api/history'],
  // 12/11/2026: o Kanban tem módulo próprio; até então ia com `vagoes`.
  restricoes: ['/api/pendencias'],
  'medio-prazo': ['/api/history'],
  'curto-prazo': ['/api/curto-prazo'],
  terminalidade: ['/api/terminalidade'],
  histograma: ['/api/histograma'],
  produtividade: ['/api/produtividade'],
  seguranca: ['/api/seguranca'],
  checklist: ['/api/checklist'],
  federacao: ['/api/ifc'],
  ifc: ['/api/ifc'],
  importar: ['/api/prevision'],
};
/** Comandos de cada módulo liberado por pessoa. Comando sem módulo aqui fica só com quem desenvolve;
 * os papéis e as obras continuam conferidos em `applyCommand`. */
const SECTION_COMMANDS: Record<string, readonly Command['type'][]> = {
  // 04/11/2026: o Gantt de legalização da aba 1 usa o cronograma do médio prazo (regra 4: quem vê a
  // aba 1 vê e edita o Gantt), então leva junto a gravação, a linha de base e a exclusão do cronograma.
  // Esses três comandos não sabem distinguir o tipo do plano antes de ler o banco: quem tem só a aba 1
  // poderia, por uma chamada feita à mão, gravar um plano do mês. Aceito por enquanto (mesma equipe).
  'longo-prazo': [
    'create_restriction',
    'resolve_restriction',
    'move_restriction',
    'create_baseline',
    'create_legalization_plan',
    'update_legalization_plan',
    'save_plan_revision',
    'freeze_plan_baseline',
    'delete_plan',
  ],
  vagoes: [
    'create_sequence',
    'create_wagon',
    'edit_wagon',
    'create_location',
    'create_activity',
    'update_activity',
    'create_criterion',
    'set_criterion',
    'create_pending',
    'resolve_pending',
    'release',
    'assign_team',
    'record_progress',
    'link_activities',
    'unlink_activities',
    'set_activity_note',
    'set_takt',
    'set_sequence_start',
    'regenerate_sequence',
    'create_restriction',
    'resolve_restriction',
    'move_restriction',
    'create_baseline',
  ],
  'medio-prazo': [
    'create_plan',
    'import_plan',
    'delete_plan',
    'freeze_plan_baseline',
    'save_plan_revision',
    'create_plan_task',
    'update_plan_task',
    'indent_plan_task',
    'outdent_plan_task',
    'delete_plan_task',
    'set_plan_task_note',
    'link_plan_tasks',
    'unlink_plan_tasks',
    'replace_plan_predecessors',
    'create_restriction',
    'resolve_restriction',
    'move_restriction',
  ],
  // 08/11/2026: a planilha semanal. A terminalidade grava pela rota própria (`/api/terminalidade/commands`).
  'curto-prazo': [
    'create_commitment',
    'update_commitment',
    'delete_commitment',
    'reorder_commitments',
    'record_fulfillment',
    'record_fulfillments',
    'clear_fulfillment',
  ],
  federacao: ['create_link_rule', 'delete_link_rule'],
  ifc: ['create_ifc_model', 'update_ifc_model', 'add_ifc_version'],
  dividas: ['create_pending', 'resolve_pending'],
  importar: ['import_activities'],
};

export interface ModuleAccess {
  developer: boolean;
  /** Módulos liberados para a pessoa. */
  modules: readonly string[];
}

/** Quem pode abrir uma seção da obra: as abertas, todos; as demais, quem desenvolve e quem tem o módulo
 * liberado. */
export function hasSectionAccess(section: string, access: ModuleAccess): boolean {
  return !isRestrictedSection(section) || access.developer || access.modules.includes(section);
}

const matchesPrefix = (pathname: string, prefix: string) => pathname === prefix || pathname.startsWith(`${prefix}/`);
/** Módulos que dão acesso a uma API restrita (vazio quando ela não é de módulo nenhum). */
export function sectionsForApi(pathname: string): string[] {
  return Object.entries(SECTION_APIS)
    .filter(([, prefixes]) => prefixes.some(prefix => matchesPrefix(pathname, prefix)))
    .map(([section]) => section);
}
export function hasApiAccess(pathname: string, access: ModuleAccess): boolean {
  return access.developer || sectionsForApi(pathname).some(section => access.modules.includes(section));
}

/** O comando pode ser aplicado por quem tem este acesso (os papéis continuam conferidos em `applyCommand`). */
export function isCommandAllowed(type: unknown, access: ModuleAccess): boolean {
  if (access.developer || isCommandAllowedForNonDeveloper(type)) return true;
  if (typeof type !== 'string') return false;
  return access.modules.some(section => SECTION_COMMANDS[section]?.includes(type as Command['type']));
}

/** Lista de módulos gravável: só seções liberáveis conhecidas, sem repetição, na ordem do catálogo. */
export function normalizeModules(list: unknown): string[] {
  const wanted = new Set(Array.isArray(list) ? list.filter((s): s is string => typeof s === 'string') : []);
  return MODULES.map(m => m.section).filter(section => wanted.has(section) && isRestrictedSection(section));
}

/** Acessos em lote (08/11/2026): o que muda numa pessoa quando o admin libera ou revoga as mesmas obras e
 * módulos para várias de uma vez. Admin vê todos os módulos (a grade trava as células dele), então o lote
 * não mexe nos módulos de admin, como o clique na célula. Devolve só os campos que mudam, ou `null` quando
 * a pessoa já está como o lote pede. Puro: o comando, a projeção local e a barra de seleção fazem a mesma conta. */
export function accessBatchChange(
  user: { role: string; workIds: readonly string[]; modules?: readonly string[] },
  batch: { workIds?: readonly string[]; sections?: readonly string[]; enabled: boolean },
): { workIds?: string[]; modules?: string[] } | null {
  const change: { workIds?: string[]; modules?: string[] } = {};
  const works = [...new Set(batch.workIds ?? [])];
  if (works.length) {
    const next = batch.enabled
      ? [...user.workIds, ...works.filter(id => !user.workIds.includes(id))]
      : user.workIds.filter(id => !works.includes(id));
    if (next.length !== user.workIds.length) change.workIds = next;
  }
  const sections = batch.sections ?? [];
  if (sections.length && user.role !== 'admin') {
    const current = normalizeModules(user.modules ?? []);
    const next = normalizeModules(batch.enabled ? [...current, ...sections] : current.filter(s => !sections.includes(s)));
    if (next.join() !== current.join()) change.modules = next;
  }
  return change.workIds || change.modules ? change : null;
}

/** Lista de `DEVELOPER_EMAILS` (vírgulas, sem diferença de maiúsculas); vazia ou ausente, o admin inicial. */
export function developerEmails(envValue: string | undefined): string[] {
  const list = (envValue ?? '')
    .split(',')
    .map(email => email.trim().toLowerCase())
    .filter(Boolean);
  return list.length ? list : [BOOTSTRAP_ADMIN_EMAIL];
}

export function isDeveloperEmail(email: string | null | undefined, envValue: string | undefined): boolean {
  if (!email) return false;
  return developerEmails(envValue).includes(email.trim().toLowerCase());
}

/** Quem vê os módulos em desenvolvimento: os e-mails de `DEVELOPER_EMAILS` e, desde 08/10/2026 a pedido
 * do usuário, todo perfil com papel admin. O proxy só conhece o e-mail da sessão e busca o papel apenas
 * quando o e-mail não basta e a página é restrita. */
export function hasDeveloperAccess(user: { email?: string | null; role?: string | null }, envValue: string | undefined): boolean {
  return isDeveloperEmail(user.email, envValue) || user.role === 'admin';
}

export function isCommandAllowedForNonDeveloper(type: unknown): boolean {
  return typeof type === 'string' && NON_DEVELOPER_COMMANDS.has(type as Command['type']);
}

const SECTION_PATTERN = RESTRICTED_SECTIONS.join('|');
const RESTRICTED_PAGE = new RegExp(`^/obras/([^/]+)/(${SECTION_PATTERN})(?:/|$)`);
/** Folhas de impressão fora do layout (`/imprimir/curto-prazo/obra-1`): seguem a regra da aba de origem. */
const RESTRICTED_PRINT = new RegExp(`^/imprimir/(${SECTION_PATTERN})/([^/]+)(?:/|$)`);

function restrictedPage(pathname: string): { workId: string; section: string } | null {
  const page = pathname.match(RESTRICTED_PAGE);
  if (page) return { workId: page[1], section: page[2] };
  const print = pathname.match(RESTRICTED_PRINT);
  return print ? { workId: print[2], section: print[1] } : null;
}

/** Para uma página restrita da obra, o dashboard da mesma obra (aba 0, aberta a todos); senão, null. Até
 * 08/11/2026 o destino era o curto prazo, que passou a ser liberado por pessoa. */
export function restrictedPageRedirect(pathname: string): string | null {
  const page = restrictedPage(pathname);
  return page ? `/obras/${page.workId}/dashboard` : null;
}

/** A seção restrita de um endereço de página da obra ("medio-prazo"), ou null. */
export function restrictedSectionOf(pathname: string): string | null {
  return restrictedPage(pathname)?.section ?? null;
}

export function isRestrictedApi(pathname: string): boolean {
  return RESTRICTED_API_PREFIXES.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
