'use client';
import { encodeGrid, decodeGrid } from './clipboard';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { MediumTermPlan, PlanTask, PlanDependency, PlanningData } from '@/domain/entities';
import { DEFAULT_CALENDAR, countedDays, endFor, parseDuration, planSnapshot, scheduleTasks, temporalTarget, type WorkCalendar } from '@/domain/plan-schedule';
import { parseLinks, formatLink, rollUpPlan } from '@/domain/rules';
import { validateDate } from '@/domain/validation';
import { usePlanning } from '@/modules/planejamento/planning-provider';
import { CommandForm, TextField, value } from '@/modules/planejamento/forms';
import { formatDate } from '@/shared/format';

type Draft = { tasks: PlanTask[]; links: PlanDependency[]; calendar: WorkCalendar };
type Col = 'name'|'duration'|'start'|'end'|'links'|'progress'|'elapsed'|'target'|'gap'|'team'|'baseEnd'|'variance'|'notes';
const columns: {key:Col;label:string;width:number;editable?:boolean}[] = [
  {key:'name',label:'EAP · Tarefa',width:300,editable:true},{key:'duration',label:'Duração',width:100,editable:true},
  {key:'start',label:'Início',width:120,editable:true},{key:'end',label:'Término',width:120,editable:true},
  {key:'links',label:'Predecessoras',width:140,editable:true},{key:'progress',label:'% concluído',width:100,editable:true},
  {key:'elapsed',label:'Decorrido / total',width:130},{key:'target',label:'% alvo',width:90},{key:'gap',label:'Desvio (pp)',width:100},
  {key:'team',label:'Responsável / equipe',width:180,editable:true},{key:'baseEnd',label:'Término da base',width:120},
  {key:'variance',label:'Variação (dias)',width:115},{key:'notes',label:'Anotações',width:220,editable:true},
];
const fieldLabels: Record<string,string> = {name:'Nome',plannedStart:'Início',plannedEnd:'Término',duration:'Duração',anchorStart:'Início de referência',teamId:'Equipe',progress:'Progresso',notes:'Anotações',level:'Nível',order:'Ordem',predecessors:'Predecessoras'};
const normalize=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const stamp=()=>({createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});
const dateInput=(s:string)=>{const m=s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);const d=m?`${m[3]}-${m[2]}-${m[1]}`:s;validateDate(d);return d;};
const initial=(data:PlanningData,plan:MediumTermPlan):Draft=>({tasks:data.planTasks.filter(t=>t.planId===plan.id).sort((a,b)=>a.order-b.order),links:data.planDependencies.filter(l=>data.planTasks.some(t=>t.planId===plan.id&&t.id===l.successorId)),calendar:structuredClone(plan.calendar??DEFAULT_CALENDAR)});

export function ScheduleSheet({workId}:{workId:string}) {
  const context=usePlanning();const [id,setId]=useState('');
  if(context.state!=='ready')return null;
  const actor=context.planning.data.users.find(u=>u.id===context.actorId);
  if(!actor?.workIds.includes(workId))return null;
  const plans=context.planning.data.plans.filter(p=>p.workId===workId&&!p.baselineOf);
  const plan=plans.find(p=>p.id===id)??plans[0];
  return <section className="panel my-5 overflow-hidden">
    {plan?<Sheet key={`${context.actorId}:${plan.id}`} plan={plan} data={context.planning.data} actorId={context.actorId} readOnly={actor.role==='viewer'} today={context.planning.today} execute={context.execute} plans={plans} choose={setId}/>:<div className="p-4"><h2 className="font-semibold">Plano do mês</h2><p className="my-3 text-sm">Crie um plano para começar.</p>{actor.role!=='viewer'&&<CommandForm title="Novo plano" submit="Criar plano" onDone={setId} command={d=>({type:'create_plan',workId,month:value(d,'month'),name:value(d,'name')})}><TextField name="month" label="Mês" type="month"/><TextField name="name" label="Nome"/></CommandForm>}</div>}
  </section>;
}
export function Sheet({plan,data,actorId,readOnly,today,execute,plans,choose}:{plan:MediumTermPlan;data:PlanningData;actorId:string;readOnly:boolean;today:string;execute:Extract<ReturnType<typeof usePlanning>,{state:'ready'}>['execute'];plans:MediumTermPlan[];choose:(id:string)=>void}) {
  const [draft,setDraft]=useState<Draft>(()=>initial(data,plan));
  const [base,setBase]=useState(()=>planSnapshot(plan,data.planTasks,data.planDependencies));
  const [original,setOriginal]=useState<Draft>(()=>initial(data,plan));
  const [past,setPast]=useState<Draft[]>([]),[future,setFuture]=useState<Draft[]>([]);
  const [locked,setLocked]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[review,setReview]=useState(false),[reason,setReason]=useState('');
  const [query,setQuery]=useState(''),[status,setStatus]=useState('all'),[team,setTeam]=useState(''),[reference,setReference]=useState(today);
  const [folded,setFolded]=useState<string[]>([]),[hidden,setHidden]=useState<string[]>([]),[widths,setWidths]=useState<Record<string,number>>({});
  const [preferencesLoaded,setPreferencesLoaded]=useState(false);
  const [selected,setSelected]=useState<{row:number;col:number}>({row:0,col:0}),[anchor,setAnchor]=useState<{row:number;col:number}>({row:0,col:0});
  const [editor,setEditor]=useState<{id:string;key:Col;text:string}|null>(null);
  const [baseId,setBaseId]=useState(''),[meeting,setMeeting]=useState(false),[reviewed,setReviewed]=useState<string[]>([]),[chart,setChart]=useState(false);
  const [fullDetails,setFullDetails]=useState(false);
  const committedEditor=useRef<object|null>(null);
  const reviewDialog=useRef<HTMLDialogElement>(null);
  const gridRef=useRef<HTMLTableElement>(null);const editRef=useRef<HTMLInputElement&HTMLSelectElement>(null);
  const prefKey=`schedule:${actorId}:${plan.id}`;
  const dirty=JSON.stringify(draft)!==JSON.stringify(original);
  const canEdit=!readOnly&&!locked&&!busy&&!plan.frozenAt;
  const teams=data.teams.filter(t=>t.workId===plan.workId);
  const roll=useMemo(()=>rollUpPlan(draft.tasks),[draft.tasks]);
  const changed=draft.tasks.filter(t=>JSON.stringify(t)!==JSON.stringify(original.tasks.find(o=>o.id===t.id))||JSON.stringify(draft.links.filter(l=>l.successorId===t.id))!==JSON.stringify(original.links.filter(l=>l.successorId===t.id)));
  const removed=original.tasks.filter(t=>!draft.tasks.some(n=>n.id===t.id));
  const baselines=data.plans.filter(p=>p.baselineOf===plan.id);
  const baselineTasks=data.planTasks.filter(t=>t.planId===baseId);const baselineRoll=rollUpPlan(baselineTasks);
  const visibleCols=columns.filter(c=>!hidden.includes(c.key)||c.key==='name');
  const filtering=!!query||status!=='all'||!!team;
  const included=new Set<string>();
  const parents:PlanTask[]=[];
  draft.tasks.forEach(t=>{
    while(parents.length&&parents.at(-1)!.level>=t.level)parents.pop();
    const v=roll.get(t.id)!;
    const hay=normalize([t.name,t.notes,plan.name,teams.find(e=>e.id===t.teamId)?.name,teams.find(e=>e.id===t.teamId)?.company].join(' '));
    const match=normalize(query).split(/\s+/).every(token=>hay.includes(token))&&(!team||t.teamId===team)&&
      (status==='all'||status==='zero'&&v.progress===0||status==='ongoing'&&v.progress>0&&v.progress<100||status==='done'&&v.progress===100||status==='late'&&v.progress<100&&v.plannedEnd<reference||status==='changed'&&changed.some(c=>c.id===t.id)||status==='notes'&&!!t.notes);
    if(filtering?match:!parents.some(p=>folded.includes(p.id))){included.add(t.id);if(filtering)parents.forEach(p=>included.add(p.id));}
    parents.push(t);
  });
  const rows=draft.tasks.filter(t=>included.has(t.id));
  const active=rows[selected.row];
  const bounds={r0:Math.min(anchor.row,selected.row),r1:Math.max(anchor.row,selected.row),c0:Math.min(anchor.col,selected.col),c1:Math.max(anchor.col,selected.col)};
  useEffect(()=>{try{const p=JSON.parse(localStorage.getItem(prefKey)??'{}');setFolded(Array.isArray(p.folded)?p.folded:[]);setHidden(Array.isArray(p.hidden)?p.hidden:[]);setWidths(p.widths&&typeof p.widths==='object'?Object.fromEntries(Object.entries(p.widths).filter(([k,v])=>columns.some(c=>c.key===k)&&typeof v==='number'&&v>=70&&v<=600).map(([k,v])=>[k,Number(v)])):{});}catch{}setPreferencesLoaded(true);},[prefKey]);
  useEffect(()=>{if(preferencesLoaded)try{localStorage.setItem(prefKey,JSON.stringify({folded,hidden,widths}));}catch{}},[prefKey,folded,hidden,widths,preferencesLoaded]);
  useEffect(()=>{const handler=(e:BeforeUnloadEvent)=>{if(dirty||editor){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',handler);return()=>window.removeEventListener('beforeunload',handler);},[dirty,editor]);
  useEffect(()=>{const guard=(e:MouseEvent)=>{const link=(e.target as HTMLElement).closest('a[href]');if(link&&(dirty||editor)&&!window.confirm('Sair e perder as alterações não salvas?')){e.preventDefault();e.stopPropagation();}};document.addEventListener('click',guard,true);return()=>document.removeEventListener('click',guard,true);},[dirty,editor]);
  // Actualizações externas não substituem um rascunho aberto.
  useEffect(()=>{if(!dirty&&!editor){const next=initial(data,plan);setDraft(next);setOriginal(next);setBase(planSnapshot(plan,data.planTasks,data.planDependencies));}},[data,plan,dirty]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(()=>{editRef.current?.focus();editRef.current?.select?.();},[editor?.id,editor?.key]);
  useEffect(()=>{if(review)reviewDialog.current?.showModal();else reviewDialog.current?.close();},[review]);
  function stage(next:Draft){setPast(p=>[...p.slice(-49),draft]);setFuture([]);setDraft(next);setError('');}
  function undo(){if(!past.length)return;setFuture(f=>[draft,...f]);setDraft(past.at(-1)!);setPast(p=>p.slice(0,-1));setEditor(null);}
  function redo(){if(!future.length)return;setPast(p=>[...p,draft]);setDraft(future[0]);setFuture(f=>f.slice(1));setEditor(null);}
  function focus(row:number,col:number,extend=false){const next={row:Math.max(0,Math.min(rows.length-1,row)),col:Math.max(0,Math.min(visibleCols.length-1,col))};setSelected(next);if(!extend)setAnchor(next);requestAnimationFrame(()=>gridRef.current?.querySelector<HTMLElement>(`[data-pos="${next.row}:${next.col}"]`)?.focus());}
  function raw(t:PlanTask,key:Col):string {
    const v=roll.get(t.id)!;const pair=baselineTasks.find(b=>b.sourceTaskId===t.id);const bv=pair?baselineRoll.get(pair.id):undefined;
    const target=['target','gap'].includes(key)?temporalTarget({...t,plannedStart:v.plannedStart,plannedEnd:v.plannedEnd},reference,draft.calendar):0;
    switch(key){case'name':return t.name;case'duration':return !v.summary&&t.duration?`${t.duration.value}${t.duration.unit}`:`${countedDays(v.plannedStart,v.plannedEnd,false,draft.calendar)}dd`;case'start':return formatDate(v.plannedStart);case'end':return formatDate(v.plannedEnd);case'progress':return `${Math.round(v.progress)}`;
      case'links':return draft.links.filter(l=>l.successorId===t.id).map(l=>formatLink(draft.tasks.findIndex(p=>p.id===l.predecessorId)+1,l)).join(', ');
      case'team':return teams.find(e=>e.id===t.teamId)?`${teams.find(e=>e.id===t.teamId)!.company} · ${teams.find(e=>e.id===t.teamId)!.name}`:'';
      case'notes':return t.notes??'';case'target':return `${Math.round(target)}%`;case'gap':return `${Math.round(v.progress-target)} pp`;
      case'elapsed':{const business=t.duration?!['dd','md'].includes(t.duration.unit):false;return `${reference<v.plannedStart?0:countedDays(v.plannedStart,reference>v.plannedEnd?v.plannedEnd:reference,business,draft.calendar)} / ${countedDays(v.plannedStart,v.plannedEnd,business,draft.calendar)}`;}
      case'baseEnd':return bv?formatDate(bv.plannedEnd):'';case'variance':return bv?String(Math.round((Date.parse(v.plannedEnd)-Date.parse(bv.plannedEnd))/86400000)):'';
    }
  }
  function editable(t:PlanTask,key:Col){return canEdit&&columns.find(c=>c.key===key)?.editable&&!(roll.get(t.id)?.summary&&['duration','start','end','progress','links'].includes(key));}
  function applyCells(entries:{id:string;key:Col;text:string}[]) {
    if(entries.length>1000)throw new Error('Limite de 1000 células por operação.');
    const next=structuredClone(draft);
    for(const entry of entries){const t=next.tasks.find(t=>t.id===entry.id)!;
      if(!t||!editable(t,entry.key))throw new Error('O intervalo contém uma célula bloqueada ou calculada.');
      switch(entry.key){
        case'name':if(!entry.text.trim())throw new Error('Nome é obrigatório.');t.name=entry.text.trim();break;
        case'notes':t.notes=entry.text;break;
        case'progress':{const n=Number(entry.text.replace('%',''));if(!entry.text.trim()||!Number.isFinite(n)||n<0||n>100)throw new Error('Progresso deve ficar entre 0 e 100.');t.progress=n;break;}
        case'team':{const match=teams.find(e=>e.id===entry.text||`${e.company} · ${e.name}`===entry.text);if(entry.text&&!match)throw new Error('Escolha uma equipe cadastrada na obra.');t.teamId=match?.id;break;}
        case'duration':t.duration=parseDuration(entry.text);break;
        case'start':{const start=dateInput(entry.text);t.duration??={value:countedDays(t.plannedStart,t.plannedEnd,false,next.calendar),unit:'dd'};t.anchorStart=start;t.plannedStart=start;t.plannedEnd=endFor(start,t.duration,next.calendar).end;break;}
        case'end':{const end=dateInput(entry.text);t.duration={value:countedDays(t.plannedStart,end,t.duration?!['dd','md'].includes(t.duration.unit):false,next.calendar),unit:t.duration&&!['dd','md'].includes(t.duration.unit)?'d':'dd'};if(!t.duration.value)throw new Error('Período sem dia de trabalho.');t.plannedEnd=end;break;}
        case'links':{const parsed=parseLinks(entry.text);if(parsed.invalid.length)throw new Error(`Predecessora inválida: ${parsed.invalid.join(', ')}`);next.links=next.links.filter(l=>l.successorId!==t.id);for(const l of parsed.links){const p=next.tasks[l.number-1];if(!p)throw new Error(`Linha ${l.number} não existe.`);next.links.push({id:crypto.randomUUID(),...stamp(),predecessorId:p.id,successorId:t.id,type:l.type,lagDays:l.lagDays,lagBusiness:l.lagBusiness});}break;}
      }
    }
    next.tasks=scheduleTasks(next.tasks,next.links,next.calendar);stage(next);
  }
  function commit(){if(!editor||committedEditor.current===editor)return true;try{applyCells([editor]);committedEditor.current=editor;setEditor(null);return true;}catch(e){setError((e as Error).message);editRef.current?.focus();return false;}}
  function begin(t:PlanTask,key:Col,seed?:string){if(editable(t,key)){setError('');setEditor({id:t.id,key,text:seed??(key==='team'?t.teamId??'':raw(t,key))});}}
  async function save(){if(editor&&!commit())return;setBusy(true);setError('');try{await execute({type:'save_plan_revision',planId:plan.id,expectedSnapshot:base,reason,tasks:draft.tasks,links:draft.links,calendar:draft.calendar});setOriginal(draft);setPast([]);setFuture([]);setReview(false);setReason('');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  function structural(kind:'add'|'remove'|'indent'|'outdent') {
    if(!canEdit)return;
    const next=structuredClone(draft);const at=next.tasks.findIndex(t=>t.id===active?.id);
    if(kind==='add'){const date=`${plan.month}-01`;next.tasks.push({id:crypto.randomUUID(),...stamp(),planId:plan.id,name:'Nova tarefa',plannedStart:date,plannedEnd:date,anchorStart:date,duration:{value:1,unit:'d'},progress:0,order:next.tasks.length+1,level:0});}
    else if(at>=0){let end=at+1;while(end<next.tasks.length&&next.tasks[end].level>next.tasks[at].level)end++;
      if(kind==='remove'){if(!window.confirm(`Excluir “${active.name}” e ${end-at-1} subitens do rascunho?`))return;const ids=new Set(next.tasks.slice(at,end).map(t=>t.id));next.tasks.splice(at,end-at);next.links=next.links.filter(l=>!ids.has(l.predecessorId)&&!ids.has(l.successorId));}
      else {if(kind==='indent'&&(at===0||next.tasks[at].level>next.tasks[at-1].level)||kind==='outdent'&&next.tasks[at].level===0)return;for(let i=at;i<end;i++)next.tasks[i].level+=kind==='indent'?1:-1;}
    }
    try{next.tasks=scheduleTasks(next.tasks,next.links,next.calendar);stage(next);}catch(e){setError((e as Error).message);}
  }
  function keyDown(e:React.KeyboardEvent,t:PlanTask,r:number,c:number){
    if(editor)return;
    const cmd=e.ctrlKey||e.metaKey;
    if(cmd&&e.key.toLowerCase()==='z'){e.preventDefault();if(canEdit){if(e.shiftKey)redo();else undo();}return;}
    if(cmd&&e.key.toLowerCase()==='y'){e.preventDefault();if(canEdit)redo();return;}
    if(cmd&&e.key.toLowerCase()==='d'){e.preventDefault();try{const entries=[];for(let row=bounds.r0+1;row<=bounds.r1;row++)for(let col=bounds.c0;col<=bounds.c1;col++)entries.push({id:rows[row].id,key:visibleCols[col].key,text:raw(rows[bounds.r0],visibleCols[col].key)});applyCells(entries);}catch(err){setError((err as Error).message);}return;}
    if(e.key==='F2'||e.key==='Enter'){e.preventDefault();begin(t,visibleCols[c].key);return;}
    const moves:Record<string,[number,number]>={ArrowDown:[r+1,c],ArrowUp:[r-1,c],ArrowLeft:[r,c-1],ArrowRight:[r,c+1],Home:[cmd?0:r,0],End:[cmd?rows.length-1:r,visibleCols.length-1]};
    if(moves[e.key]){e.preventDefault();focus(...moves[e.key],e.shiftKey);return;}
    if(e.key==='Tab'){const col=c+(e.shiftKey?-1:1);const row=r+(col<0?-1:col>=visibleCols.length?1:0);if(row>=0&&row<rows.length){e.preventDefault();focus(row,(col+visibleCols.length)%visibleCols.length);}return;}
    if(e.key.length===1&&!cmd&&!e.altKey){e.preventDefault();begin(t,visibleCols[c].key,e.key);}
  }
  function editorKey(e:React.KeyboardEvent<HTMLInputElement|HTMLSelectElement>,r:number,c:number){
    e.stopPropagation();
    if(e.key==='Escape'){e.preventDefault();committedEditor.current=editor;setEditor(null);setError('');focus(r,c);return;}
    if(e.key==='Enter'){e.preventDefault();if(commit())focus(r+1,c);return;}
    if(e.key!=='Tab')return;
    e.preventDefault();if(!commit())return;
    const next=c+(e.shiftKey?-1:1),row=r+(next<0?-1:next>=visibleCols.length?1:0);
    if(row>=0&&row<rows.length){focus(row,(next+visibleCols.length)%visibleCols.length);return;}
    const targets=Array.from(document.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary,a[href]')).filter(el=>!gridRef.current?.contains(el)&&el.getClientRects().length);
    const target=e.shiftKey?targets.filter(el=>!!(el.compareDocumentPosition(gridRef.current!)&Node.DOCUMENT_POSITION_FOLLOWING)).at(-1):targets.find(el=>!!(el.compareDocumentPosition(gridRef.current!)&Node.DOCUMENT_POSITION_PRECEDING));
    requestAnimationFrame(()=>target?.focus());
  }
  return <>
    <div className="flex flex-wrap items-center gap-2 border-b p-3">
      <h2 className="mr-auto font-semibold">Plano do mês</h2>
      <label className="text-xs">Plano <select className="field" value={plan.id} disabled={dirty||!!editor||busy} onChange={e=>choose(e.target.value)}>{plans.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <button className="button-ghost" disabled={readOnly||busy} onClick={()=>{if(editor&&!commit())return;setLocked(!locked);}}>{locked?'🔒 Liberar edição':'🔓 Bloquear edição'}</button>
      <button className="button-ghost" disabled={!canEdit||!past.length} onClick={undo}>Desfazer</button><button className="button-ghost" disabled={!canEdit||!future.length} onClick={redo}>Refazer</button>
      <button className="button" disabled={!dirty||readOnly||busy||!!editor} onClick={()=>setReview(true)}>Revisar e salvar</button>
      <span role="status" aria-live="polite" className="text-xs">{busy?'Salvando…':dirty?`${changed.length+removed.length} tarefas · Alterações não salvas`:'Tudo salvo'}</span>
    </div>
    <div className="flex flex-wrap items-end gap-2 border-b p-3 text-xs">
      <label>Buscar<input className="field" placeholder="Tarefa, plano, equipe ou anotação" value={query} disabled={!!editor} onChange={e=>{setQuery(e.target.value);setSelected({row:0,col:0});}}/></label>
      <label>Situação<select className="field" value={status} disabled={!!editor} onChange={e=>{setStatus(e.target.value);setSelected({row:0,col:0});}}>{[['all','Todas'],['zero','Não iniciadas'],['ongoing','Em andamento'],['done','Concluídas'],['late','Atrasadas'],['changed','Alteradas'],['notes','Com anotações']].map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
      <label>Equipe<select className="field" value={team} disabled={!!editor} onChange={e=>{setTeam(e.target.value);setSelected({row:0,col:0});}}><option value="">Todas</option>{teams.map(t=><option key={t.id} value={t.id}>{t.company} · {t.name}</option>)}</select></label>
      <label>Referência<input className="field" type="date" value={reference} onChange={e=>{if(e.target.value)setReference(e.target.value);}}/></label>
      <button className="button-ghost" onClick={()=>setReference(today)}>Hoje</button>
      <label>Comparar base<select className="field" value={baseId} onChange={e=>setBaseId(e.target.value)}><option value="">Sem comparação</option>{baselines.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
      <button className="button-ghost" onClick={()=>setFolded([])}>Expandir tudo</button><button className="button-ghost" onClick={()=>setFolded(draft.tasks.filter(t=>roll.get(t.id)?.summary).map(t=>t.id))}>Recolher tudo</button>
      <button className="button-ghost" aria-pressed={meeting} onClick={()=>setMeeting(!meeting)}>Modo reunião</button><button className="button-ghost" aria-pressed={chart} onClick={()=>setChart(!chart)}>Gráfico de Gantt</button>
      <details><summary className="cursor-pointer">Colunas</summary><div className="absolute z-40 grid gap-2 rounded border bg-white p-3 shadow-xl">{columns.map(c=><label key={c.key}><input type="checkbox" checked={!hidden.includes(c.key)||c.key==='name'} disabled={c.key==='name'} onChange={e=>setHidden(e.target.checked?hidden.filter(k=>k!==c.key):[...hidden,c.key])}/> {c.label}</label>)}<button className="button-ghost" onClick={()=>{setHidden([]);setWidths({});}}>Restaurar padrão</button></div></details>
    </div>
    {error&&<p id="schedule-error" role="alert" className="border-b bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    {!draft.tasks.some(t=>t.progress>0)&&<p className="px-3 py-2 text-xs text-slate-500">Aguardando avanço para iniciar controle. O alvo é linear no tempo; não representa medição física.</p>}
    <div className="flex flex-wrap gap-2 border-b px-3 py-2"><button className="button-ghost" disabled={!canEdit||!!editor} onClick={()=>structural('add')}>+ Tarefa</button><button className="button-ghost" disabled={!canEdit||!active||!!editor} onClick={()=>structural('indent')}>Recuar</button><button className="button-ghost" disabled={!canEdit||!active||!!editor} onClick={()=>structural('outdent')}>Avançar nível</button><button className="button-ghost" disabled={!canEdit||!active||!!editor} onClick={()=>structural('remove')}>Excluir</button><span className="self-center text-xs text-slate-500">F2/Enter edita · Esc cancela · Shift seleciona · Ctrl/Cmd+D preenche abaixo</span></div>
    <div className="max-h-[65vh] overflow-auto" onCopy={e=>{if(editor)return;e.preventDefault();const text=encodeGrid(rows.slice(bounds.r0,bounds.r1+1).map(t=>visibleCols.slice(bounds.c0,bounds.c1+1).map(c=>raw(t,c.key))));e.clipboardData.setData('text/plain',text);}}
      onPaste={e=>{if(editor)return;e.preventDefault();try{const matrix=decodeGrid(e.clipboardData.getData('text/plain'));const entries=matrix.flatMap((line,r)=>line.map((text,c)=>{const t=rows[selected.row+r],col=visibleCols[selected.col+c];if(!t||!col)throw new Error('Colagem ultrapassa a grade.');return{id:t.id,key:col.key,text};}));applyCells(entries);}catch(err){setError((err as Error).message);}}}>
      <table ref={gridRef} className="schedule-grid" role="grid" aria-label="Cronograma de médio prazo" aria-multiselectable="true" style={{width:visibleCols.reduce((n,c)=>n+(widths[c.key]??c.width),0)}}>
        <thead><tr>{visibleCols.map(c=><th key={c.key} scope="col" style={{width:widths[c.key]??c.width}} className={c.key==='name'?'schedule-name':''}>{c.label}<span role="separator" aria-label={`Largura de ${c.label}`} aria-orientation="vertical" aria-valuemin={70} aria-valuemax={600} aria-valuenow={widths[c.key]??c.width} tabIndex={0} className="schedule-resize" onKeyDown={e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();setWidths(w=>({...w,[c.key]:Math.max(70,Math.min(600,(w[c.key]??c.width)+(e.key==='ArrowRight'?10:-10)))}));}}} onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);e.currentTarget.dataset.x=String(e.clientX);e.currentTarget.dataset.width=String(widths[c.key]??c.width);}} onPointerMove={e=>{if(e.currentTarget.hasPointerCapture(e.pointerId))setWidths(w=>({...w,[c.key]:Math.max(70,Math.min(600,Number(e.currentTarget.dataset.width)+e.clientX-Number(e.currentTarget.dataset.x)))}));}}/></th>)}</tr></thead>
        <tbody>{rows.map((t,r)=>{const v=roll.get(t.id)!;return <tr key={t.id} className={v.progress===100?'schedule-done':''}>{visibleCols.map((col,c)=>{const editing=editor?.id===t.id&&editor.key===col.key;const selectedCell=r>=bounds.r0&&r<=bounds.r1&&c>=bounds.c0&&c<=bounds.c1;const old=original.tasks.find(o=>o.id===t.id);const field=({start:'plannedStart',end:'plannedEnd',team:'teamId'} as Record<string,string>)[col.key]??col.key;const modified=col.key==='links'?JSON.stringify(original.links.filter(l=>l.successorId===t.id))!==JSON.stringify(draft.links.filter(l=>l.successorId===t.id)):JSON.stringify(old?.[field as keyof PlanTask])!==JSON.stringify(t[field as keyof PlanTask]);
          return <td key={col.key} role="gridcell" data-pos={`${r}:${c}`} tabIndex={selected.row===r&&selected.col===c?0:-1} aria-selected={selectedCell} aria-readonly={!editable(t,col.key)} title={`${raw(t,col.key)}${v.summary?' · Resumo calculado':''}${modified?' · Alteração não salva':''}`} className={`${col.key==='name'?'schedule-name':''} ${selectedCell?'schedule-selected':''} ${modified?'schedule-modified':''} ${v.summary?'font-semibold':''} ${['duration','progress','elapsed','target','gap','variance'].includes(col.key)?'text-right':''}`}
            onClick={e=>{if(editor&&!editing&&!commit())return;setSelected({row:r,col:c});if(!e.shiftKey)setAnchor({row:r,col:c});}} onDoubleClick={()=>begin(t,col.key)} onKeyDown={e=>keyDown(e,t,r,c)}>
            {editing?<>{col.key==='team'?<select ref={editRef} aria-label={`Equipe de ${t.name}`} value={editor.text} onChange={e=>setEditor({...editor,text:e.target.value})} onBlur={commit} onKeyDown={e=>editorKey(e,r,c)}><option value="">Sem responsável</option>{teams.map(team=><option key={team.id} value={team.id}>{team.company} · {team.name}</option>)}</select>:<input ref={editRef} aria-label={`${col.label} de ${t.name}`} aria-invalid={!!error} aria-describedby={error?'schedule-error':undefined} value={editor.text} onChange={e=>setEditor({...editor,text:e.target.value})} onBlur={commit} onKeyDown={e=>editorKey(e,r,c)}/>}</>:<div className="truncate" style={col.key==='name'?{paddingLeft:t.level*14}:undefined}>{col.key==='name'&&<><span className="mr-2 text-slate-400">{draft.tasks.indexOf(t)+1}</span>{v.summary&&<button aria-label={`${folded.includes(t.id)?'Expandir':'Recolher'} ${t.name}`} className="mr-1" onClick={e=>{e.stopPropagation();setFolded(f=>f.includes(t.id)?f.filter(id=>id!==t.id):[...f,t.id]);}}>{folded.includes(t.id)?'▸':'▾'}</button>}<span className="mr-2 text-slate-500">{v.number}</span></>}{raw(t,col.key)||'—'}{col.key==='progress'?'%':''}{v.summary&&col.key==='progress'?' ∑':''}</div>}</td>;
        })}</tr>;})}</tbody>
      </table>{!rows.length&&<p className="p-5 text-sm">Nenhuma tarefa nesta visualização.</p>}
    </div>
    {chart&&<div className="max-h-80 overflow-auto border-t p-3" aria-label="Gantt do rascunho">{(()=>{
      const start=draft.tasks.reduce((date,t)=>roll.get(t.id)!.plannedStart<date?roll.get(t.id)!.plannedStart:date,`${plan.month}-01`);
      const end=draft.tasks.reduce((date,t)=>roll.get(t.id)!.plannedEnd>date?roll.get(t.id)!.plannedEnd:date,start);
      const total=Math.max(1,(Date.parse(end)-Date.parse(start))/86400000+1);
      return <div className="min-w-[800px]"><p className="mb-2 text-xs">{formatDate(start)} — {formatDate(end)} · barras do rascunho atual</p>{rows.map(t=>{const v=roll.get(t.id)!;const left=(Date.parse(v.plannedStart)-Date.parse(start))/86400000/total*100;const width=((Date.parse(v.plannedEnd)-Date.parse(v.plannedStart))/86400000+1)/total*100;return <div key={t.id} className="flex h-8 items-center gap-3 border-b text-xs"><button className="w-48 shrink-0 truncate text-left" title={t.name} onClick={()=>focus(rows.indexOf(t),0)}>{t.name}</button><div className="relative h-5 flex-1 bg-slate-100"><div className={`absolute h-5 overflow-hidden rounded ${v.summary?'bg-slate-400':'bg-blue-200'}`} style={{left:`${left}%`,width:`${width}%`}} title={`${formatDate(v.plannedStart)} a ${formatDate(v.plannedEnd)} · ${Math.round(v.progress)}%`}><div className="h-full bg-blue-700" style={{width:`${v.progress}%`}}/></div></div><span className="w-12 text-right">{Math.round(v.progress)}%</span></div>;})}</div>;
    })()}</div>}
    {active&&<aside className={fullDetails?"fixed inset-0 z-40 overflow-auto bg-white p-4":"border-t bg-slate-50 p-4"} aria-label="Detalhes da tarefa"><div className="flex flex-wrap items-center gap-3"><h3 className="mr-auto font-semibold">{plan.name} · {active.name}</h3><button className="button-ghost" onClick={()=>setFullDetails(!fullDetails)}>{fullDetails?'Fechar tela cheia':'Detalhes em tela cheia'}</button>{meeting&&<><button className="button-ghost" onClick={()=>focus(selected.row-1,0)}>Anterior</button><button className="button-ghost" onClick={()=>focus(selected.row+1,0)}>Próxima</button><label className="text-xs"><input type="checkbox" checked={reviewed.includes(active.id)} onChange={e=>setReviewed(e.target.checked?[...reviewed,active.id]:reviewed.filter(id=>id!==active.id))}/> Revisado nesta reunião</label></>}</div>
      <p className="my-2 text-xs">{raw(active,'start')} — {raw(active,'end')} · {raw(active,'duration')} · {raw(active,'progress')}% · Alvo {raw(active,'target')} · Variação {raw(active,'variance')||'—'} dias · Predecessoras {raw(active,'links')||'—'}</p>
      <label className="text-xs">Anotações e encaminhamentos<textarea key={active.id} className="field mt-1 min-h-24 whitespace-pre-wrap" readOnly={!canEdit} value={active.notes??''} onChange={e=>{try{applyCells([{id:active.id,key:'notes',text:e.target.value}]);}catch(err){setError((err as Error).message);}}}/></label>
      <button className="button-ghost mt-2" disabled={!canEdit||!active.notes} onClick={()=>applyCells([{id:active.id,key:'notes',text:active.notes!.split('\n').map(l=>l.trim()?`• ${l}`:l).join('\n')}])}>Transformar linhas em tópicos</button>
      <details className="mt-3"><summary>Histórico da tarefa</summary>{data.history.filter(h=>h.entityId===active.id&&h.action==='plan_task_revision').slice().reverse().map(h=><div key={h.id} className="my-2 border-b py-2 text-xs"><p>{formatDate(h.occurredAt.slice(0,10))} {h.occurredAt.slice(11,19)} · {data.users.find(u=>u.id===h.authorId)?.name??h.authorId} · {String(h.changes.reason??'Motivo não registrado')}</p><dl className="whitespace-pre-wrap">{Object.entries((h.changes.fields??{}) as Record<string,{before:unknown;after:unknown}>).map(([field,change])=><div key={field}><dt className="font-semibold">{fieldLabels[field]??field}</dt><dd>{JSON.stringify(change.before)} → {JSON.stringify(change.after)}</dd></div>)}</dl></div>)}</details>
    </aside>}
    <details className="border-t p-3 text-sm"><summary>Calendário de trabalho</summary><div className="mt-3 flex flex-wrap gap-3">
      {[0,1,2,3,4,5,6].map(day=><label key={day}><input type="checkbox" disabled={!canEdit} checked={draft.calendar.weekdays.includes(day)} onChange={e=>{const calendar={...draft.calendar,weekdays:e.target.checked?[...draft.calendar.weekdays,day]:draft.calendar.weekdays.filter(d=>d!==day)};try{stage({...draft,calendar,tasks:scheduleTasks(draft.tasks,draft.links,calendar)});}catch(err){setError((err as Error).message);}}}/> {['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'][day]}</label>)}
      {(['hoursPerDay','daysPerMonth'] as const).map(key=><label key={key}>{key==='hoursPerDay'?'Horas por dia':'Dias por mês'}<input className="field w-24" type="number" disabled={!canEdit} value={draft.calendar[key]} onChange={e=>{const calendar={...draft.calendar,[key]:Number(e.target.value)};try{stage({...draft,calendar,tasks:scheduleTasks(draft.tasks,draft.links,calendar)});}catch(err){setError((err as Error).message);}}}/></label>)}
      <label>Feriados (AAAA-MM-DD, separados por vírgula)<input key={draft.calendar.holidays.join(',')} className="field" defaultValue={draft.calendar.holidays.join(', ')} disabled={!canEdit} onBlur={e=>{const calendar={...draft.calendar,holidays:e.target.value.split(',').map(d=>d.trim()).filter(Boolean)};try{stage({...draft,calendar,tasks:scheduleTasks(draft.tasks,draft.links,calendar)});}catch(err){setError((err as Error).message);}}}/></label>
    </div><p className="mt-2 text-xs">8h = uma jornada configurada; frações de jornada ocupam um dia na grade. 1mês usa os dias úteis configurados; 1md = 30 dias corridos. Vínculos são aplicados às subtarefas.</p></details>
    <div className="flex flex-wrap gap-3 border-t p-3">{!readOnly&&!dirty&&!editor&&<><CommandForm title="Criar linha de base" submit="Criar fotografia" command={d=>({type:'freeze_plan_baseline',planId:plan.id,name:value(d,'name')})}><TextField name="name" label="Nome da linha de base"/></CommandForm><CommandForm title="Novo plano" submit="Criar plano" onDone={choose} command={d=>({type:'create_plan',workId:plan.workId,month:value(d,'month'),name:value(d,'name')})}><TextField name="month" label="Mês" type="month"/><TextField name="name" label="Nome"/></CommandForm></>}{dirty&&<button className="button-ghost" disabled={busy} onClick={()=>{if(window.confirm('Descartar todas as alterações não salvas?')){setDraft(original);setPast([]);setFuture([]);setEditor(null);}}}>Descartar rascunho</button>}</div>
    <dialog ref={reviewDialog} aria-label="Revisão do cronograma" onCancel={e=>{e.preventDefault();if(!busy)setReview(false);}} className="m-auto max-h-[90vh] w-[min(95vw,48rem)] rounded-lg p-0 backdrop:bg-slate-950/50"><div className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-lg bg-white p-5"><h3 className="font-bold">Revisar atualização</h3><p className="my-2 text-sm">{changed.length} tarefas alteradas, {removed.length} excluídas. Datas das sucessoras já recalculadas.</p><ul className="max-h-60 overflow-auto text-xs">{changed.map(t=>{const old=original.tasks.find(o=>o.id===t.id);return <li key={t.id} className="border-b py-2"><strong>{t.name}</strong>{(['name','plannedStart','plannedEnd','duration','teamId','progress','notes','level'] as const).filter(k=>JSON.stringify(old?.[k])!==JSON.stringify(t[k])).map(k=><p key={k}>{fieldLabels[k]}: {JSON.stringify(old?.[k]??null)} → {JSON.stringify(t[k]??null)}</p>)}<p>Predecessoras: {original.links.filter(l=>l.successorId===t.id).map(l=>l.predecessorId).join(', ')||'—'} → {raw(t,'links')||'—'}</p></li>;})}{removed.map(t=><li key={t.id}>Excluir: {t.name}</li>)}</ul>{JSON.stringify(draft.calendar)!==JSON.stringify(original.calendar)&&<p className="my-2 text-sm">Calendário alterado nesta revisão.</p>}<label className="mt-3 block text-sm">Motivo da atualização<textarea className="field mt-1" value={reason} onChange={e=>setReason(e.target.value)} required/></label>{error&&<p role="alert" className="my-2 text-sm text-rose-700">{error}</p>}<div className="mt-3 flex gap-2"><button className="button" disabled={busy||!reason.trim()} onClick={save}>{busy?'Salvando…':'Salvar alterações'}</button><button className="button-ghost" disabled={busy} onClick={()=>setReview(false)}>Voltar ao rascunho</button></div></div></dialog>
  </>;
}
