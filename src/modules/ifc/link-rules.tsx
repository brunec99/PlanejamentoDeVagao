'use client';
import { useState } from 'react';
import type { LinkRule, LinkRuleCriterion, LinkRuleProperty } from '@/domain/entities';
import { rulesNeedingReview, serviceForElement } from '@/domain/rules';
import { selectWorkPlanning } from '@/application/use-cases/get-planning';
import { usePlanning } from '@/modules/planejamento/planning-provider';
import { Callout, Empty } from '@/modules/planejamento/ui';
import { CommandForm, Field, TextField, value } from '@/modules/planejamento/forms';

const properties: LinkRuleProperty[] = ['pavimento', 'tipo'];
const operatorLabels: Record<LinkRuleCriterion['operator'], string> = { igual: 'igual', contem: 'contém' };
const criteriaLabel = (rule: LinkRule) => rule.criteria.map(c => `${c.property} ${operatorLabels[c.operator]} ${c.value}`).join(' · ');
const byText = (a: string, b: string) => a.localeCompare(b, 'pt-BR');

function criteriaFrom(data: FormData): LinkRuleCriterion[] {
  const criteria: LinkRuleCriterion[] = [];
  for (const property of properties) {
    const raw = value(data, `${property}Value`);
    if (raw) criteria.push({ property, operator: value(data, `${property}Operator`) === 'contem' ? 'contem' : 'igual', value: raw });
  }
  return criteria;
}

export function LinkRules({ workId }: { workId: string }) {
  const context = usePlanning();
  if (context.state !== 'ready') return null;
  const { planning } = context;
  const selected = selectWorkPlanning(planning, workId);
  const actor = planning.data.users.find(u => u.id === context.actorId);
  if (!selected || !actor?.workIds.includes(workId)) return null;
  const { data } = planning;
  const wagonIds = new Set(selected.wagons.map(w => w.id));
  const services = [...new Set(data.activities.filter(a => wagonIds.has(a.wagonId)).map(a => a.name))].sort(byText);
  const models = data.ifcModels.filter(m => m.workId === workId);
  const versions = data.ifcVersions.filter(v => models.some(m => m.id === v.modelId));
  const storeys = [...new Set(models.flatMap(m => versions.filter(v => v.modelId === m.id).sort((a, b) => b.version - a.version).slice(0, 1).flatMap(v => v.storeys)))].sort(byText);
  const rules = data.linkRules.filter(r => r.workId === workId).sort((a, b) => a.order - b.order);
  const review = rulesNeedingReview(rules, storeys);
  const needsReview = (rule: LinkRule) => review.some(r => r.id === rule.id);

  return <section className="mt-8" aria-labelledby="regras-title">
    <h2 id="regras-title" className="text-lg font-bold text-slate-900">Vinculação por regras</h2>
    <p className="mt-1 text-sm text-slate-500">Os elementos do modelo são vinculados a um serviço pelas suas propriedades — nesta versão, pavimento e tipo —, e não um a um. A ordem de cadastro decide a precedência: a primeira regra que casa com o elemento define o serviço.</p>

    <datalist id="regras-pavimentos">{storeys.map(storey => <option key={storey} value={storey} />)}</datalist>
    <datalist id="regras-servicos">{services.map(service => <option key={service} value={service} />)}</datalist>

    <div className="my-5 space-y-4">
      {versions.length === 0 && <Callout tone="info">Nenhuma versão de modelo enviada nesta obra. As regras já podem ser cadastradas — a lista de pavimentos disponíveis se preenche quando o primeiro modelo for enviado.</Callout>}
      <CommandForm title="Cadastrar regra" submit="Cadastrar regra" command={d => ({ type: 'create_link_rule', workId, serviceName: value(d, 'serviceNameOther') || value(d, 'serviceName'), criteria: criteriaFrom(d) })}>
        <Field label="Serviço"><select className="field" name="serviceName" defaultValue=""><option value="">Selecione um serviço da obra</option>{services.map(service => <option key={service} value={service}>{service}</option>)}</select></Field>
        <TextField name="serviceNameOther" label="Outro serviço (usado quando preenchido)" required={false} />
        {properties.map(property => <Field key={property} label={property === 'pavimento' ? 'Critério de pavimento (opcional)' : 'Critério de tipo de elemento (opcional)'}>
          <div className="flex flex-wrap gap-2">
            <select className="field max-w-36" name={`${property}Operator`} defaultValue={property === 'pavimento' ? 'contem' : 'igual'} aria-label={`Operador do critério de ${property}`}><option value="igual">igual a</option><option value="contem">contém</option></select>
            <input className="field max-w-64" name={`${property}Value`} list={property === 'pavimento' ? 'regras-pavimentos' : undefined} placeholder={property === 'pavimento' ? 'Ex.: 3º Pavimento' : 'Ex.: IfcWall'} aria-label={`Valor do critério de ${property}`} />
          </div>
        </Field>)}
        <p className="text-xs text-slate-500">Deixe em branco o critério que não se aplica. Ao menos um critério é obrigatório.</p>
      </CommandForm>
    </div>

    <section className="panel overflow-hidden" aria-labelledby="regras-lista-title">
      <h3 id="regras-lista-title" className="border-b border-slate-100 px-5 py-3.5 text-sm font-bold text-slate-800">Regras da obra</h3>
      {rules.length === 0
        ? <div className="p-5"><Empty>Nenhuma regra cadastrada. Sem regras, nenhum elemento do modelo é vinculado a serviço algum.</Empty></div>
        : <div className="overflow-x-auto custom-scrollbar" role="region" aria-label="Regras de vinculação da obra" tabIndex={0}>
            <table className="data-table min-w-[820px]">
              <thead><tr>{['Ordem', 'Serviço', 'Critérios', 'Situação', 'Ações'].map(l => <th scope="col" key={l}>{l}</th>)}</tr></thead>
              <tbody>{rules.map(rule => <tr key={rule.id}>
                <th scope="row" className="tabular-nums">{rule.order}</th>
                <td className="font-semibold text-slate-800">{rule.serviceName}</td>
                <td>{criteriaLabel(rule)}</td>
                <td>{needsReview(rule) ? <span className="font-semibold text-amber-600">Revisar</span> : rule.criteria.some(c => c.property === 'pavimento') ? <span className="text-slate-500">Pavimento localizado</span> : <span className="text-slate-500">Sem critério de pavimento</span>}</td>
                <td>{actor.role !== 'viewer' && <DeleteRule rule={rule} />}</td>
              </tr>)}</tbody>
            </table>
          </div>}
    </section>

    <section data-tour="ifc-rules" className="mt-5 space-y-4" aria-labelledby="regras-revisao-title">
      <h3 id="regras-revisao-title" className="eyebrow">Revisão dos vínculos</h3>
      {review.length > 0
        ? <Callout tone="warning" role="status">O pavimento indicado nas regras abaixo não existe nos modelos atuais desta obra, então o vínculo precisa ser revisado — nenhuma correspondência é presumida em seu lugar.<span className="mt-2 block font-semibold">{review.map(r => `${r.serviceName} (${criteriaLabel(r)})`).join(' · ')}</span></Callout>
        : rules.length > 0
          ? <Callout tone="success" role="status">Nenhuma regra pendente de revisão: os pavimentos usados nos critérios existem nos modelos atuais desta obra.</Callout>
          : <Empty>Cadastre a primeira regra para acompanhar aqui os vínculos que precisam de revisão.</Empty>}
      {rules.length > 0 && <RuleTester rules={rules} />}
    </section>
  </section>;
}

function DeleteRule({ rule }: { rule: LinkRule }) {
  const context = usePlanning();
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  if (context.state !== 'ready') return null;
  return <div className="space-y-2">
    <button type="button" className="button-ghost" disabled={busy} aria-label={`Excluir a regra do serviço ${rule.serviceName}`} onClick={async () => {
      if (busy) return; setBusy(true); setError('');
      try { await context.execute({ type: 'delete_link_rule', ruleId: rule.id }); }
      catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível excluir a regra.'); }
      finally { setBusy(false); }
    }}>{busy ? 'Excluindo…' : 'Excluir'}</button>
    {error && <Callout tone="danger" role="alert">{error}</Callout>}
  </div>;
}

function RuleTester({ rules }: { rules: LinkRule[] }) {
  const [pavimento, setPavimento] = useState(''); const [tipo, setTipo] = useState('');
  const [result, setResult] = useState<{ pavimento: string; tipo: string; service?: string }>();
  return <div className="command-box">
    <p className="text-sm font-semibold text-slate-700">Testar regra</p>
    <p className="mt-1 text-xs text-slate-500">Simulação local: informe as propriedades de um elemento e veja qual serviço as regras atuais vinculariam. Nada é enviado nem gravado.</p>
    <div className="mt-3 flex flex-wrap items-end gap-2">
      <Field label="Pavimento do elemento"><input className="field max-w-56" list="regras-pavimentos" value={pavimento} onChange={e => setPavimento(e.target.value)} /></Field>
      <Field label="Tipo do elemento"><input className="field max-w-56" value={tipo} onChange={e => setTipo(e.target.value)} placeholder="Ex.: IfcWall" /></Field>
      <button type="button" className="button-ghost" onClick={() => setResult({ pavimento, tipo, service: serviceForElement(rules, { pavimento, tipo }) })}>Testar</button>
    </div>
    {result && <p role="status" className="mt-3 text-sm text-slate-600">{result.service
      ? <>Um elemento com pavimento “{result.pavimento || '—'}” e tipo “{result.tipo || '—'}” seria vinculado ao serviço <span className="font-semibold text-slate-800">{result.service}</span>.</>
      : <>Nenhuma regra casa com pavimento “{result.pavimento || '—'}” e tipo “{result.tipo || '—'}”. Esse elemento ficaria sem serviço vinculado.</>}</p>}
  </div>;
}
