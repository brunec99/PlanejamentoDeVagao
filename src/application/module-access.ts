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
  'set_test_access',
  'grant_access',
  'revoke_access',
  'create_work',
]);

/** Permissão de teste (14/10/2026): quem está testando o curto prazo pode receber, pelo admin, acesso
 * ao médio prazo sem virar admin nem entrar em DEVELOPER_EMAILS. Vale só para a aba 3, a API que ela
 * lê e os comandos dela; o resto dos módulos em desenvolvimento continua com quem desenvolve. */
export const TESTER_SECTIONS: ReadonlySet<string> = new Set(['medio-prazo']);
export const TESTER_API_PREFIXES = ['/api/history'] as const;
export const TESTER_COMMANDS: ReadonlySet<Command['type']> = new Set<Command['type']>([
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
]);

export interface ModuleAccess {
  developer: boolean;
  tester: boolean;
}

/** Quem pode abrir uma seção restrita: quem desenvolve, todas; quem tem permissão de teste, o médio prazo. */
export function hasSectionAccess(section: string, access: ModuleAccess): boolean {
  return access.developer || (access.tester && TESTER_SECTIONS.has(section));
}

export function isTesterApi(pathname: string): boolean {
  return TESTER_API_PREFIXES.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/** O comando pode ser aplicado por quem tem este acesso (os papéis continuam conferidos em `applyCommand`). */
export function isCommandAllowed(type: unknown, access: ModuleAccess): boolean {
  if (access.developer) return true;
  if (isCommandAllowedForNonDeveloper(type)) return true;
  return access.tester && typeof type === 'string' && TESTER_COMMANDS.has(type as Command['type']);
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
