'use client';
import { useEffect, useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { CommandForm, TextField, value } from '@/modules/planejamento/forms';
import { usePlanning } from '@/modules/planejamento/planning-provider';
import { Callout, Empty, LoadState, Missing, StatCard } from '@/modules/planejamento/ui';
import { selectWorkPlanning } from '@/application/use-cases/get-planning';
import { formatTimestamp } from '@/shared/format';
import { extractIfc, type Extraction } from './extract-ifc';

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];
function formatSize(bytes: number) {
  let size = bytes, unit = 0;
  while (size >= 1024 && unit < UNITS.length - 1) { size /= 1024; unit += 1; }
  return `${size.toLocaleString('pt-BR', { maximumFractionDigits: unit === 0 || size >= 10 ? 0 : 1 })} ${UNITS[unit]}`;
}
const count = (total: number) => total.toLocaleString('pt-BR');

/** O que a versão já tem transcrito no banco. Não vem do snapshot do planejamento de propósito:
 * são centenas de milhares de linhas por modelo, e o snapshot trafega inteiro a cada comando. */
interface Transcription { extractedAt: string | null; elementRows: number; hasGeometry: boolean }

/** Se a rota de estado não responder, a tela continua de pé sem a coluna — saber quantas linhas
 * foram gravadas é informação extra, não pré-requisito para listar modelos e versões. */
function useTranscriptions(workId: string) {
  const [rows, setRows] = useState<Record<string, Transcription>>();
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch(`/api/ifc/status?workId=${encodeURIComponent(workId)}`, { cache: 'no-store' });
        if (!res.ok) throw new Error('sem estado de transcrição');
        const body = (await res.json()) as { versoes?: { versionId?: string; extractedAt?: string | null; elementRows?: number; hasGeometry?: boolean }[] };
        const map: Record<string, Transcription> = {};
        for (const row of body.versoes ?? []) if (row.versionId) map[row.versionId] = { extractedAt: row.extractedAt ?? null, elementRows: row.elementRows ?? 0, hasGeometry: row.hasGeometry === true };
        if (active) setRows(map);
      } catch { if (active) setRows(undefined); }
    })();
    return () => { active = false; };
  }, [workId, attempt]);
  return { rows, reload: () => setAttempt(n => n + 1) };
}

/** Guardar o arquivo só tem sentido se der para trazer de volta. O endereço é assinado na hora:
 * o bucket é privado, então não existe URL permanente para publicar na tabela. */
function DownloadFile({ versionId, fileName }: { versionId: string; fileName: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const open = async () => {
    setBusy(true); setError('');
    try {
      const res = await fetch(`/api/ifc/download-url?versionId=${encodeURIComponent(versionId)}`, { cache: 'no-store' });
      const body = (await res.json().catch(() => ({}))) as { url?: unknown; error?: unknown };
      if (!res.ok || typeof body.url !== 'string') throw new Error(typeof body.error === 'string' ? body.error : 'Não foi possível abrir o arquivo guardado.');
      window.location.assign(body.url);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível abrir o arquivo guardado.'); }
    finally { setBusy(false); }
  };
  return <>
    <button type="button" className="mt-0.5 block text-[11px] font-semibold text-blue-700 hover:underline disabled:cursor-wait disabled:opacity-50"
      disabled={busy} onClick={open} aria-label={`Baixar o arquivo ${fileName}`}>{busy ? 'abrindo…' : 'baixar arquivo'}</button>
    {error && <span role="alert" className="mt-0.5 block whitespace-normal text-[11px] font-semibold text-rose-600">{error}</span>}
  </>;
}

export function ModelsOverview({ workId }: { workId: string }) {
  const context = usePlanning();
  const { rows: transcriptions, reload } = useTranscriptions(workId);
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
  const currentElements = latest.reduce((sum, v) => sum + v.elementCount, 0);
  const stored = versions.filter(v => v.storagePath).length;
  const person = (id: string) => data.users.find(u => u.id === id)?.name ?? id;
  const canUpload = actor.role !== 'viewer';
  const columns = ['Versão', 'Arquivo', 'Arquivo original', 'Pavimentos lidos', 'Elementos', ...(transcriptions ? ['Transcrição'] : []), 'Enviado por', 'Quando'];

  return <>
    <p className="eyebrow">{selected.work.code}</p>
    <h1 className="page-title">Modelos IFC</h1>
    <p className="mt-1 max-w-3xl text-sm text-slate-500">O IFC é uma base de dados: no envio, o modelo é transcrito em tabelas — elementos, propriedades, quantidades e caixas envolventes — e é essa transcrição que o repositório guarda. Guardar o arquivo .ifc original é opcional. Todas as versões são preservadas: cada envio empilha uma versão nova, sem substituir as anteriores.</p>

    <div className="my-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      <StatCard label="Modelos cadastrados" value={models.length} />
      <StatCard label="Versões transcritas" value={versions.length} />
      <StatCard label="Pavimentos distintos" value={storeys.size} />
      <StatCard label="Elementos na versão atual" value={count(currentElements)} />
      <StatCard label="Com arquivo guardado" value={`${stored} de ${versions.length}`} />
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
        ? <div className="p-5"><Empty>Nenhum modelo cadastrado nesta obra. Cadastre o modelo acima e depois envie o arquivo IFC para transcrição.</Empty></div>
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
                    <table className="data-table min-w-[1040px]">
                      <thead><tr>{columns.map(l => <th scope="col" key={l}>{l}</th>)}</tr></thead>
                      <tbody>{list.map(v => <tr key={v.id} className={v.version === current.version ? undefined : 'opacity-70'}>
                        <th scope="row" className="whitespace-nowrap">v{v.version}
                          <span className={`mt-0.5 block text-[11px] ${v.version === current.version ? 'font-semibold text-emerald-600' : 'font-normal text-slate-400'}`}>{v.version === current.version ? 'versão atual' : 'histórico'}</span></th>
                        <td className="break-all">{v.fileName}</td>
                        <td className="whitespace-nowrap">
                          <span className="tabular-nums">{formatSize(v.fileSize)}</span>
                          {v.storagePath
                            ? <DownloadFile versionId={v.id} fileName={v.fileName} />
                            : <span className="mt-0.5 block text-[11px] font-semibold text-amber-600">arquivo não guardado</span>}
                        </td>
                        <td>{v.storeys.length === 0
                          ? <span className="text-slate-300">—</span>
                          : <span className="flex flex-wrap gap-1">{v.storeys.map(s => <span key={s} className="badge-muted px-2 py-0.5 text-[11px]">{s}</span>)}</span>}</td>
                        <td className="tabular-nums">{count(v.elementCount)}</td>
                        {transcriptions && <TranscriptionCell row={transcriptions[v.id]} />}
                        <td>{person(v.uploadedBy)}</td>
                        <td className="whitespace-nowrap">{formatTimestamp(v.createdAt)}</td>
                      </tr>)}</tbody>
                    </table>
                  </div>}

              {canUpload && <UploadVersion modelId={model.id} modelName={model.name} onDone={reload} />}
            </div>;
          })}</div>}
    </section>

    <div className="mt-5"><Callout tone="info">Uma versão nova nunca substitui as anteriores: o histórico completo fica disponível para comparação. Os pavimentos, os elementos e as quantidades vêm da transcrição feita no momento do envio — o planejamento lê as tabelas, não o arquivo.</Callout></div>
  </>;
}

function TranscriptionCell({ row }: { row?: Transcription }) {
  if (!row?.extractedAt) return <td className="whitespace-nowrap text-slate-400">não transcrita</td>;
  return <td className="whitespace-nowrap">
    <span className="font-semibold tabular-nums text-slate-700">{count(row.elementRows)} linhas</span>
    <span className={`mt-0.5 block text-[11px] ${row.hasGeometry ? 'text-emerald-600' : 'text-amber-600'}`}>{row.hasGeometry ? 'com geometria' : 'sem geometria'}</span>
  </td>;
}

// Um modelo de obra passa de centenas de milhares de linhas, e o corpo de uma rota serverless não
// aguarda o modelo inteiro: a transcrição sobe fatiada, em série, para o servidor nunca receber
// mais do que consegue gravar numa requisição.
const ELEMENT_BATCH = 1000;
const ROW_BATCH = 4000;
type Batch = Partial<Pick<Extraction, 'elements' | 'properties' | 'quantities'>>;

function UploadVersion({ modelId, modelName, onDone }: { modelId: string; modelName: string; onDone: () => void }) {
  const context = usePlanning();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [keepFile, setKeepFile] = useState(false);
  const [step, setStep] = useState('');
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [message, setMessage] = useState('');
  if (context.state !== 'ready') return null;
  const busy = step !== '';
  const clear = () => { setError(''); setWarning(''); setMessage(''); };

  /** Guarda o arquivo no Storage e devolve o caminho, ou lança explicando a recusa. */
  const storeFile = async (ifc: File) => {
    setStep('Preparando o envio do arquivo…');
    const res = await fetch('/api/ifc/upload-url', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ modelId, fileName: ifc.name }) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error ?? 'Falha ao preparar o envio.');
    setStep(`Enviando ${formatSize(ifc.size)} ao Storage… pode levar alguns minutos, mantenha esta aba aberta.`);
    // O arquivo vai direto para o Storage: um IFC é bem maior que o limite de corpo da nossa própria API.
    const sent = await fetch(body.signedUrl, { method: 'PUT', body: ifc, headers: { 'content-type': 'application/octet-stream' } });
    if (!sent.ok) {
      // O Storage explica a recusa no corpo; engolir isso num "tente novamente" esconde
      // justamente o caso comum, que é o arquivo passar do limite por arquivo do projeto.
      const detail = await sent.text().catch(() => '');
      throw new Error(sent.status === 413 || /exceeded the maximum allowed size/i.test(detail)
        ? `O arquivo tem ${formatSize(ifc.size)} e passa do limite por arquivo do Storage. Aumente o limite em Storage → Settings no painel do Supabase (o plano gratuito trava em 50 MB) e tente de novo.`
        : `O Storage recusou o envio (HTTP ${sent.status}).${detail ? ` ${detail.slice(0, 200)}` : ''}`);
    }
    return String(body.path);
  };

  const send = async () => {
    if (!file || busy) return;
    clear();
    try {
      if (!/\.ifc$/i.test(file.name)) throw new Error('O repositório transcreve apenas modelos IFC.');
      if (file.size === 0) throw new Error('Arquivo vazio.');

      setStep('Lendo o modelo neste navegador… pode levar alguns minutos em modelos grandes.');
      const { elements, properties, quantities } = await extractIfc(file);
      const storeys = [...new Set(elements.map(e => e.storey).filter((s): s is string => Boolean(s)))];

      // Guardar o arquivo é conveniência, não requisito: se o Storage recusar, a versão ainda
      // vale pelas tabelas, e o usuário fica sabendo depois que só o anexo ficou de fora.
      let storagePath: string | undefined;
      if (keepFile) {
        try { storagePath = await storeFile(file); }
        catch (cause) { setWarning(`Os dados do modelo foram transcritos, mas o arquivo original não coube no Storage e a versão ficou sem anexo. ${cause instanceof Error ? cause.message : 'O Storage recusou o envio.'}`); }
      }

      setStep('Registrando versão…');
      const versionId = await context.execute({ type: 'add_ifc_version', modelId, fileName: file.name, fileSize: file.size, storagePath, storeys, elementCount: elements.length });

      const batches: Batch[] = [];
      for (let i = 0; i < elements.length; i += ELEMENT_BATCH) batches.push({ elements: elements.slice(i, i + ELEMENT_BATCH) });
      for (let i = 0; i < properties.length; i += ROW_BATCH) batches.push({ properties: properties.slice(i, i + ROW_BATCH) });
      for (let i = 0; i < quantities.length; i += ROW_BATCH) batches.push({ quantities: quantities.slice(i, i + ROW_BATCH) });
      // Modelo sem nada ainda precisa de uma requisição: é ela que marca a versão como transcrita.
      if (!batches.length) batches.push({});

      const total = elements.length + properties.length + quantities.length;
      let written = 0;
      for (const [index, batch] of batches.entries()) {
        const done = written + (batch.elements?.length ?? 0) + (batch.properties?.length ?? 0) + (batch.quantities?.length ?? 0);
        setStep(`Gravando ${count(done)} de ${count(total)} linhas… ${total ? Math.round((done / total) * 100) : 100}%`);
        // `reset` na primeira requisição torna a regravação idempotente; `finish` na última
        // é o que marca a versão como transcrita e conta as linhas no banco.
        const res = await fetch('/api/ifc/elements', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ versionId, reset: index === 0, finish: index === batches.length - 1, ...batch }) });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(`${body.error ?? 'Falha ao gravar a transcrição do modelo.'} A versão foi registrada, mas a transcrição parou em ${count(written)} de ${count(total)} linhas.`);
        written = done;
      }

      setMessage(`Versão registrada · ${storeys.length} ${storeys.length === 1 ? 'pavimento' : 'pavimentos'}, ${count(elements.length)} elementos e ${count(total)} linhas transcritas${storagePath ? ' · arquivo original guardado no Storage' : ''}.`);
      setFile(null);
      if (input.current) input.current.value = '';
      onDone();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível transcrever o modelo.'); }
    finally { setStep(''); }
  };

  return <div className="mt-4 border-t border-slate-100 pt-4">
    <div className="flex flex-wrap items-center gap-3">
      <input ref={input} className="field w-auto max-w-full text-xs" type="file" accept=".ifc" disabled={busy}
        aria-label={`Arquivo IFC para ${modelName}`}
        onChange={e => { setFile(e.target.files?.[0] ?? null); clear(); }} />
      <button className="button" type="button" disabled={busy || !file} onClick={send}><Upload size={15} />{busy ? 'Transcrevendo…' : 'Enviar nova versão'}</button>
    </div>
    <label className="mt-3 flex items-start gap-2 text-xs">
      <input type="checkbox" className="mt-0.5 accent-blue-700" checked={keepFile} disabled={busy}
        aria-label={`Guardar o arquivo original de ${modelName} no Storage`}
        onChange={e => { setKeepFile(e.target.checked); clear(); }} />
      <span>
        <span className="font-semibold text-slate-700">Guardar também o arquivo original no Storage</span>
        <span className="block text-slate-500">O planejamento usa as tabelas transcritas; o arquivo serve apenas para baixar de volta — e é ele que pode não caber no limite do Storage.</span>
      </span>
    </label>
    {busy && <p role="status" className="mt-2 text-xs font-semibold text-blue-700">{step}</p>}
    {error && <div className="mt-2"><Callout tone="danger" role="alert">{error}</Callout></div>}
    {warning && <div className="mt-2"><Callout tone="warning" role="status">{warning}</Callout></div>}
    {message && <div className="mt-2"><Callout tone="success" role="status">{message}</Callout></div>}
  </div>;
}
