'use client';
import { useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { CommandForm, TextField, value } from '@/modules/planejamento/forms';
import { usePlanning } from '@/modules/planejamento/planning-provider';
import { Callout, Empty, LoadState, Missing, StatCard } from '@/modules/planejamento/ui';
import { selectWorkPlanning } from '@/application/use-cases/get-planning';
import { formatTimestamp } from '@/shared/format';
import { readIfcSummary } from './parse-ifc';

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];
function formatSize(bytes: number) {
  let size = bytes, unit = 0;
  while (size >= 1024 && unit < UNITS.length - 1) { size /= 1024; unit += 1; }
  return `${size.toLocaleString('pt-BR', { maximumFractionDigits: unit === 0 || size >= 10 ? 0 : 1 })} ${UNITS[unit]}`;
}

export function ModelsOverview({ workId }: { workId: string }) {
  const context = usePlanning();
  if (context.state !== 'ready') return <LoadState error={context.state === 'error'} />;
  const { planning } = context;
  const selected = selectWorkPlanning(planning, workId);
  const actor = planning.data.users.find(u => u.id === context.actorId);
  if (!selected || !actor?.workIds.includes(workId)) return <Missing label="Obra não encontrada" />;
  const { data } = planning;
  const models = data.ifcModels.filter(m => m.workId === workId).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  const versionsOf = (modelId: string) => data.ifcVersions.filter(v => v.modelId === modelId).sort((a, b) => b.version - a.version);
  const versions = models.flatMap(m => versionsOf(m.id));
  const latest = models.map(m => versionsOf(m.id)[0]).filter(Boolean);
  const storeys = new Set(latest.flatMap(v => v.storeys));
  const totalSize = versions.reduce((sum, v) => sum + v.fileSize, 0);
  const person = (id: string) => data.users.find(u => u.id === id)?.name ?? id;
  const canUpload = actor.role !== 'viewer';

  return <>
    <p className="eyebrow">{selected.work.code}</p>
    <h1 className="page-title">Modelos IFC</h1>
    <p className="mt-1 max-w-3xl text-sm text-slate-500">O repositório armazena apenas arquivos IFC e preserva todas as versões: cada envio empilha uma versão nova, sem substituir as anteriores.</p>

    <div className="my-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard label="Modelos cadastrados" value={models.length} />
      <StatCard label="Versões armazenadas" value={versions.length} />
      <StatCard label="Pavimentos distintos" value={storeys.size} />
      <StatCard label="Tamanho total" value={formatSize(totalSize)} />
    </div>

    <div className="mb-6">
      <CommandForm title="Cadastrar modelo" submit="Cadastrar modelo" command={d => ({ type: 'create_ifc_model', workId, name: value(d, 'name'), discipline: value(d, 'discipline') })}>
        <TextField name="name" label="Nome do modelo" />
        <TextField name="discipline" label="Disciplina (arquitetura, estrutura, instalações…)" />
      </CommandForm>
    </div>

    <section data-tour="ifc-models" className="panel overflow-hidden">
      <h2 className="border-b border-slate-100 px-5 py-3.5 text-sm font-bold text-slate-800">Modelos e versões</h2>
      {models.length === 0
        ? <div className="p-5"><Empty>Nenhum modelo cadastrado nesta obra. Cadastre o modelo acima e depois envie o arquivo IFC.</Empty></div>
        : <div className="divide-y divide-slate-100">{models.map(model => {
            const list = versionsOf(model.id);
            const current = list[0];
            return <div key={model.id} className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-800">{model.name}</h3>
                  <p className="mt-0.5 text-xs text-slate-500">{model.discipline} · {list.length} {list.length === 1 ? 'versão' : 'versões'}</p>
                </div>
                {current && <span className="badge-muted">Versão atual v{current.version} · {current.storeys.length} {current.storeys.length === 1 ? 'pavimento' : 'pavimentos'}</span>}
              </div>

              {list.length === 0
                ? <div className="mt-3"><Empty>Nenhuma versão enviada ainda.</Empty></div>
                : <div className="mt-3 overflow-x-auto custom-scrollbar" role="region" aria-label={`Versões de ${model.name}`} tabIndex={0}>
                    <table className="data-table min-w-[900px]">
                      <thead><tr>{['Versão', 'Arquivo', 'Tamanho', 'Pavimentos lidos', 'Elementos', 'Enviado por', 'Quando'].map(l => <th scope="col" key={l}>{l}</th>)}</tr></thead>
                      <tbody>{list.map(v => <tr key={v.id} className={v.version === current.version ? undefined : 'opacity-70'}>
                        <th scope="row" className="whitespace-nowrap">v{v.version}
                          <span className={`mt-0.5 block text-[11px] ${v.version === current.version ? 'font-semibold text-emerald-600' : 'font-normal text-slate-400'}`}>{v.version === current.version ? 'versão atual' : 'histórico'}</span></th>
                        <td className="break-all">{v.fileName}</td>
                        <td className="whitespace-nowrap tabular-nums">{formatSize(v.fileSize)}</td>
                        <td>{v.storeys.length === 0
                          ? <span className="text-slate-300">—</span>
                          : <span className="flex flex-wrap gap-1">{v.storeys.map(s => <span key={s} className="badge-muted px-2 py-0.5 text-[11px]">{s}</span>)}</span>}</td>
                        <td className="tabular-nums">{v.elementCount.toLocaleString('pt-BR')}</td>
                        <td>{person(v.uploadedBy)}</td>
                        <td className="whitespace-nowrap">{formatTimestamp(v.createdAt)}</td>
                      </tr>)}</tbody>
                    </table>
                  </div>}

              {canUpload && <UploadVersion modelId={model.id} modelName={model.name} />}
            </div>;
          })}</div>}
    </section>

    <div className="mt-5"><Callout tone="info">Uma versão nova nunca substitui as anteriores: o histórico completo fica disponível para comparação. Os pavimentos listados são os que foram lidos do próprio arquivo no momento do envio.</Callout></div>
  </>;
}

function UploadVersion({ modelId, modelName }: { modelId: string; modelName: string }) {
  const context = usePlanning();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [step, setStep] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  if (context.state !== 'ready') return null;
  const busy = step !== '';

  const send = async () => {
    if (!file || busy) return;
    setError(''); setMessage('');
    try {
      setStep('Lendo o modelo…');
      const summary = await readIfcSummary(file);
      setStep('Preparando o envio…');
      const res = await fetch('/api/ifc/upload-url', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ modelId, fileName: file.name }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Falha ao preparar o envio.');
      setStep(`Enviando ${formatSize(file.size)}… pode levar alguns minutos, mantenha esta aba aberta.`);
      // O arquivo vai direto para o Storage: um IFC é bem maior que o limite de corpo da nossa própria API.
      const sent = await fetch(body.signedUrl, { method: 'PUT', body: file, headers: { 'content-type': 'application/octet-stream' } });
      if (!sent.ok) {
        // O Storage explica a recusa no corpo; engolir isso num "tente novamente" esconde
        // justamente o caso comum, que é o arquivo passar do limite por arquivo do projeto.
        const detail = await sent.text().catch(() => '');
        throw new Error(sent.status === 413 || /exceeded the maximum allowed size/i.test(detail)
          ? `O arquivo tem ${formatSize(file.size)} e passa do limite por arquivo do Storage. Aumente o limite em Storage → Settings no painel do Supabase (o plano gratuito trava em 50 MB) e tente de novo.`
          : `O Storage recusou o envio (HTTP ${sent.status}).${detail ? ` ${detail.slice(0, 200)}` : ''}`);
      }
      setStep('Registrando versão…');
      await context.execute({ type: 'add_ifc_version', modelId, fileName: file.name, fileSize: file.size, storagePath: body.path, storeys: summary.storeys, elementCount: summary.elementCount });
      setMessage(`Versão registrada · ${summary.storeys.length} ${summary.storeys.length === 1 ? 'pavimento' : 'pavimentos'} e ${summary.elementCount.toLocaleString('pt-BR')} elementos lidos do arquivo.`);
      setFile(null);
      if (input.current) input.current.value = '';
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível enviar o modelo.'); }
    finally { setStep(''); }
  };

  return <div className="mt-4 border-t border-slate-100 pt-4">
    <div className="flex flex-wrap items-center gap-3">
      <input ref={input} className="field w-auto max-w-full text-xs" type="file" accept=".ifc" disabled={busy}
        aria-label={`Arquivo IFC para ${modelName}`}
        onChange={e => { setFile(e.target.files?.[0] ?? null); setError(''); setMessage(''); }} />
      <button className="button" type="button" disabled={busy || !file} onClick={send}><Upload size={15} />{busy ? 'Enviando…' : 'Enviar nova versão'}</button>
    </div>
    {busy && <p role="status" className="mt-2 text-xs font-semibold text-blue-700">{step}</p>}
    {error && <div className="mt-2"><Callout tone="danger" role="alert">{error}</Callout></div>}
    {message && <div className="mt-2"><Callout tone="success" role="status">{message}</Callout></div>}
  </div>;
}
