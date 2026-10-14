import type { Command } from './use-cases/commands';

/** Go-live do curto prazo: só ele (com a lista de obras e as configurações) fica aberto a todos. Os
 * demais módulos da obra seguem em desenvolvimento e ficam restritos a quem desenvolve o sistema.
 * Ser desenvolvedor não é um papel: soma-se ao papel (consulta, planejador, gestor, admin) e às obras
 * liberadas, que continuam valendo. Funções puras: o proxy, as rotas e os testes usam as mesmas. */

/** Primeiro admin, provisionado no primeiro login; também o desenvolvedor quando `DEVELOPER_EMAILS` falta. */
export const BOOTSTRAP_ADMIN_EMAIL = 'bruno.engenharia@atrincorporadora.com.br';

export const RESTRICTED_MODULE_MESSAGE = 'Módulo disponível apenas para desenvolvimento.';

/** Seções da obra restritas ao desenvolvimento. Ficam abertas `curto-prazo` e `configuracoes`. */
export const RESTRICTED_SECTIONS = ['longo-prazo', 'vagoes', 'medio-prazo', 'federacao', 'ifc', 'dividas', 'importar'] as const;

/** APIs que só servem às seções restritas. `/api/history` é lido pelo vagão e pelo médio prazo. */
export const RESTRICTED_API_PREFIXES = ['/api/long-term-plan', '/api/prevision', '/api/ifc', '/api/history'] as const;

/** Comandos do curto prazo, das equipes (configurações da obra) e da administração; o resto é dos
 * módulos em desenvolvimento. Os papéis continuam conferidos em `applyCommand`. */
export const NON_DEVELOPER_COMMANDS: ReadonlySet<Command['type']> = new Set<Command['type']>([
  'create_commitment',
  'update_commitment',
  'delete_commitment',
  'record_fulfillment',
  'clear_fulfillment',
  'create_team',
  'update_team',
  'delete_team',
  'set_role',
  'set_module_access',
  'grant_access',
  'revoke_access',
  'create_work',
]);

/** Catálogo de módulos que a tela de usuários mostra (14/10/2026): os sempre abertos aparecem marcados
 * e travados; os em desenvolvimento o admin libera por pessoa (`User.modules`), sem torná-la admin nem
 * desenvolvedora. Admin e `DEVELOPER_EMAILS` veem todos. */
export interface ModuleInfo {
  section: string;
  label: string;
  hint: string;
  group: 'Planejamento' | 'Apoio';
  /** Aberto a todos desde o go-live; não depende de liberação. */
  open?: boolean;
}
export const MODULES: readonly ModuleInfo[] = [
  { section: 'longo-prazo', label: 'Longo prazo', hint: 'Fluxograma, linha de balanço e restrições', group: 'Planejamento' },
  { section: 'vagoes', label: 'Vagões', hint: 'Períodos de takt, atividades e liberações', group: 'Planejamento' },
  { section: 'medio-prazo', label: 'Médio prazo', hint: 'Cronograma do mês no padrão do Project', group: 'Planejamento' },
  { section: 'curto-prazo', label: 'Curto prazo', hint: 'Planilha semanal, PPC e causas', group: 'Planejamento', open: true },
  { section: 'terminalidade', label: 'Terminalidade', hint: 'Pendências por apartamento, com fotos', group: 'Planejamento', open: true },
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
  'longo-prazo': ['/api/long-term-plan', '/api/prevision'],
  vagoes: ['/api/history'],
  'medio-prazo': ['/api/history'],
  federacao: ['/api/ifc'],
  ifc: ['/api/ifc'],
  importar: ['/api/prevision'],
};
/** Comandos de cada módulo em desenvolvimento. Comando sem módulo aqui fica só com quem desenvolve;
 * os papéis e as obras continuam conferidos em `applyCommand`. */
const SECTION_COMMANDS: Record<string, readonly Command['type'][]> = {
  'longo-prazo': ['create_restriction', 'resolve_restriction', 'move_restriction', 'create_baseline'],
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
  federacao: ['create_link_rule', 'delete_link_rule'],
  ifc: ['create_ifc_model', 'add_ifc_version'],
  dividas: ['create_pending', 'resolve_pending'],
  importar: ['import_activities'],
};

export interface ModuleAccess {
  developer: boolean;
  /** Módulos em desenvolvimento liberados para a pessoa. */
  modules: readonly string[];
}

/** Quem pode abrir uma seção da obra: as abertas, todos; as em desenvolvimento, quem desenvolve e
 * quem tem o módulo liberado. */
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

/** Lista de módulos gravável: só seções em desenvolvimento conhecidas, sem repetição, na ordem do catálogo. */
export function normalizeModules(list: unknown): string[] {
  const wanted = new Set(Array.isArray(list) ? list.filter((s): s is string => typeof s === 'string') : []);
  return MODULES.map(m => m.section).filter(section => wanted.has(section) && isRestrictedSection(section));
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

const RESTRICTED_PAGE = new RegExp(`^/obras/([^/]+)/(?:${RESTRICTED_SECTIONS.join('|')})(?:/|$)`);

/** Para uma página restrita da obra, o endereço do curto prazo da mesma obra; senão, null. */
export function restrictedPageRedirect(pathname: string): string | null {
  const workId = pathname.match(RESTRICTED_PAGE)?.[1];
  return workId ? `/obras/${workId}/curto-prazo` : null;
}

/** A seção restrita de um endereço de página da obra ("medio-prazo"), ou null. */
export function restrictedSectionOf(pathname: string): string | null {
  const match = pathname.match(RESTRICTED_PAGE);
  return match ? pathname.slice(match[0].indexOf(match[1]) + match[1].length + 1).split('/')[0] : null;
}

export function isRestrictedApi(pathname: string): boolean {
  return RESTRICTED_API_PREFIXES.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
