// Popula um projeto Supabase recém-criado com os mesmos dados fictícios de src/mocks/planning.ts,
// mas com usuários reais no Supabase Auth. Rode uma única vez por projeto: `npm run seed`.
import { createClient } from '@supabase/supabase-js';
import type { PlanningData } from '../src/domain/entities';
import { createMockData } from '../src/mocks/planning';
import { planningDataToPayload } from '../src/infrastructure/repositories/supabase/mappers';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) throw new Error('Configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY em .env.local antes de rodar o seed.');
const client = createClient(url, serviceKey, { auth: { persistSession: false } });

const DEMO_PASSWORD = 'Demo123!';
const EMAILS: Record<string, string> = { 'user-1': 'gestor@demo.local', 'user-2': 'planejador@demo.local', 'user-3': 'consulta@demo.local' };

// Remaps every placeholder user id ("user-1"...) to the real Supabase Auth id created for it,
// including the users array itself — commit_planning writes profiles like any other table,
// so the ids there must match auth.users or the FK insert fails.
function remapUserIds(data: PlanningData, idMap: Record<string, string>): PlanningData {
  const map = (id?: string) => (id ? (idMap[id] ?? id) : id);
  return {
    ...data,
    wagons: data.wagons.map(w => ({ ...w, responsibleIds: w.responsibleIds.map(id => idMap[id] ?? id) })),
    activities: data.activities.map(a => ({ ...a, responsibleId: idMap[a.responsibleId] ?? a.responsibleId })),
    criteria: data.criteria.map(c => ({ ...c, confirmedBy: map(c.confirmedBy) })),
    pendingItems: data.pendingItems.map(p => ({ ...p, responsibleId: idMap[p.responsibleId] ?? p.responsibleId })),
    restrictions: data.restrictions.map(x => ({ ...x, responsibleId: idMap[x.responsibleId] ?? x.responsibleId })),
    releases: data.releases.map(r => ({ ...r, authorizedBy: idMap[r.authorizedBy] ?? r.authorizedBy, regularizationResponsibleId: map(r.regularizationResponsibleId) })),
    debts: data.debts.map(d => ({ ...d, responsibleId: idMap[d.responsibleId] ?? d.responsibleId })),
    history: data.history.map(h => ({ ...h, authorId: idMap[h.authorId] ?? h.authorId })),
    users: data.users.map(u => ({ ...u, id: idMap[u.id] ?? u.id })),
  };
}

async function main() {
  const idMap: Record<string, string> = {};
  for (const user of createMockData().users) {
    const email = EMAILS[user.id];
    const { data, error } = await client.auth.admin.createUser({ email, password: DEMO_PASSWORD, email_confirm: true });
    if (error || !data.user) throw new Error(`Falha ao criar ${email}: ${error?.message ?? 'sem usuário retornado'}`);
    idMap[user.id] = data.user.id;
    console.log(`Criado: ${email} (${user.role})`);
  }

  const payload = planningDataToPayload(remapUserIds(createMockData(), idMap));
  for (const [table, rows] of Object.entries(payload)) {
    if (rows.length === 0) continue;
    const { error } = await client.from(table).insert(rows as Record<string, unknown>[]);
    if (error) throw new Error(`Falha ao inserir em ${table}: ${error.message}`);
  }

  console.log('\nSeed concluído. Senha de demonstração para os três e-mails acima:', DEMO_PASSWORD);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
