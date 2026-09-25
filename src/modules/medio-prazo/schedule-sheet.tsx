'use client';
import { encodeGrid, decodeGrid } from './clipboard';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarClock, ChartGantt, Check, ChevronDown, ChevronRight, CircleAlert, IndentDecrease, IndentIncrease, Link2, ListPlus, Lock, LockOpen, PanelLeft, Redo2, StickyNote, Table2, Trash2, Undo2, Unlink2 } from 'lucide-react';
import type { MediumTermPlan, PlanTask, PlanDependency, PlanningData } from '@/domain/entities';
import { DEFAULT_CALENDAR, countedDays, endFor, formatDuration, isWorking, parseDuration, planSnapshot, planWindow, scheduleTasks, shift, temporalTarget, withActualEnd, withActualStart, withProgress, type TaskDuration, type WorkCalendar } from '@/domain/plan-schedule';
import { parseLinks, formatLink, rollUpPlan } from '@/domain/rules';
import { validateDate } from '@/domain/validation';
import { usePlanning } from '@/modules/planejamento/planning-provider';
import { CommandForm, Field, TextField, value } from '@/modules/planejamento/forms';
import { formatDate } from '@/shared/format';
import { GanttChart, type GanttLink, type GanttRow, type GanttZoom } from './gantt-chart';

/* Cronograma do mês no layout do MS Project: tabela à esquerda, Gantt de acompanhamento à direita,
 * as duas com a mesma linha e a mesma rolagem vertical. As datas são agendadas automaticamente pela
 * rede (scheduleTasks) a cada edição do rascunho, e o servidor refaz o cálculo ao gravar. */

type Draft = { tasks: PlanTask[]; links: PlanDependency[]; calendar: WorkCalendar };
type Col = 'id'|'ind'|'progress'|'name'|'duration'|'actualStart'|'actualEnd'|'start'|'end'|'baseStart'|'baseEnd'|'links'|'team'|'notes'|'elapsed'|'target'|'gap'|'variance';
type Presentation = 'split'|'table'|'chart';
const columns: {key:Col;label:string;width:number;editable?:boolean;right?:boolean}[] = [
  {key:'id',label:'Id',width:40,right:true},{key:'ind',label:'Indicadores',width:58},
  {key:'progress',label:'% concluída',width:78,editable:true,right:true},{key:'name',label:'Nome da tarefa',width:300,editable:true},
  {key:'duration',label:'Duração',width:112,editable:true},
  {key:'actualStart',label:'Início real',width:104,editable:true},{key:'actualEnd',label:'Término real',width:104,editable:true},
  {key:'start',label:'Início',width:104,editable:true},{key:'end',label:'Término',width:104,editable:true},
  {key:'baseStart',label:'Início da linha de base',width:104},{key:'baseEnd',label:'Término da linha de base',width:104},
  {key:'links',label:'Predecessoras',width:120,editable:true},{key:'team',label:'Nomes dos recursos',width:170,editable:true},
  {key:'notes',label:'Anotações',width:220,editable:true},{key:'elapsed',label:'Decorrido / total',width:110},
  {key:'target',label:'% alvo',width:70,right:true},{key:'gap',label:'Desvio (pp)',width:84,right:true},{key:'variance',label:'Variação (dias)',width:90,right:true},
];
const DEFAULT_HIDDEN:Col[]=['notes','elapsed','target','gap','variance'];
const LEAF_ONLY:Col[]=['duration','start','end','progress','links','actualStart','actualEnd'];
const PLAN_ROW='__plano__';
const fieldLabels: Record<string,string> = {name:'Nome',plannedStart:'Início',plannedEnd:'Término',duration:'Duração',anchorStart:'Não iniciar antes de',actualStart:'Início real',actualEnd:'Término real',teamId:'Recurso',progress:'% concluída',notes:'Anotações',level:'Nível',order:'Ordem',predecessors:'Predecessoras'};
const WEEKDAYS=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
const MONTHS=['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
/** Data no formato que a equipe lê no Project: "Seg 24/08/26". */
const projectDate=(d?:string)=>d?`${WEEKDAYS[new Date(d+'T00:00:00Z').getUTCDay()]} ${d.slice(8,10)}/${d.slice(5,7)}/${d.slice(2,4)}`:'ND';
const monthLabel=(m:string)=>`${MONTHS[Number(m.slice(5,7))-1]}/${m.slice(2,4)}`;
const nextMonth=(m:string)=>{const y=Number(m.slice(0,4)),n=Number(m.slice(5,7));return n===12?`${y+1}-01`:`${y}-${String(n+1).padStart(2,'0')}`;};
const normalize=(s:string)=>s.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
const stamp=()=>({createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});
const blank=(s:string)=>!s.trim()||/^nd$/i.test(s.trim());
/** Aceita o que se copia do Project ("Seg 24/08/26"), dd/mm/aa, dd/mm/aaaa e AAAA-MM-DD. */
function dateInput(raw:string){
  const s=raw.trim().replace(/^[A-Za-zÀ-ú]{3}\.?\s+/,'');const m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  const d=m?`${m[3].length===2?`20${m[3]}`:m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`:s;validateDate(d);return d;
}
const stored=(data:PlanningData,plan:MediumTermPlan):Draft=>({tasks:data.planTasks.filter(t=>t.planId===plan.id).sort((a,b)=>a.order-b.order),links:data.planDependencies.filter(l=>data.planTasks.some(t=>t.planId===plan.id&&t.id===l.successorId)),calendar:structuredClone(plan.calendar??DEFAULT_CALENDAR)});
/** O plano como a regra atual o calcula. Plano gravado antes das datas reais tem % sem início real, e
 * datas que o "Não iniciar antes de" agora segura; os dois são acertados aqui e a tela avisa quantas
 * linhas mudaram, que vão ao banco no próximo "Revisar e salvar". */
function initial(data:PlanningData,plan:MediumTermPlan):Draft{
  const draft=stored(data,plan);
  const summaries=new Set(draft.tasks.filter((t,i)=>draft.tasks[i+1]?.level>t.level).map(t=>t.id));
  try{
    const tasks=draft.tasks.map(t=>!summaries.has(t.id)&&t.progress>0&&!t.actualStart?withProgress(t,t.progress,draft.calendar):t);
    return {...draft,tasks:scheduleTasks(tasks,draft.links,draft.calendar)};
  }catch{return draft;}
}
const linkText=(tasks:PlanTask[],links:PlanDependency[],id:string)=>links.filter(l=>l.successorId===id).map(l=>formatLink(tasks.findIndex(p=>p.id===l.predecessorId)+1,l)).join(';');

export function ScheduleSheet({workId}:{workId:string}) {
  const context=usePlanning();const [id,setId]=useState('');
  if(context.state!=='ready')return null;
  const actor=context.planning.data.users.find(u=>u.id===context.actorId);
  if(!actor?.workIds.includes(workId))return null;
  const plans=context.planning.data.plans.filter(p=>p.workId===workId&&!p.baselineOf).sort((a,b)=>b.month.localeCompare(a.month));
  const today=context.planning.today;
  // Abre no cronograma do mês corrente; sem ele, no mais recente.
  const plan=plans.find(p=>p.id===id)??plans.find(p=>p.month===today.slice(0,7))??plans[0];
  return <section className="panel my-5 overflow-hidden" data-tour="medio-gantt">
    {plan?<Sheet key={`${context.actorId}:${plan.id}`} plan={plan} data={context.planning.data} actorId={context.actorId} readOnly={actor.role==='viewer'} today={today} execute={context.execute} plans={plans} choose={setId}/>
      :<div className="p-4"><h2 className="font-semibold">Cronograma do mês</h2><p className="my-3 text-sm text-slate-600">Cada mês tem o seu cronograma, com horizonte de três meses. Crie o primeiro para começar; os seguintes nascem como cópia do anterior.</p><NewPlanForm workId={workId} plans={plans} today={today} onDone={setId}/></div>}
  </section>;
}

function NewPlanForm({workId,plans,today,onDone}:{workId:string;plans:MediumTermPlan[];today:string;onDone:(id:string)=>void}) {
  const latest=plans[0];
  const month=latest?nextMonth(latest.month):today.slice(0,7);
  return <CommandForm title="Novo cronograma do mês" submit="Criar cronograma" onDone={onDone}
    command={d=>({type:'create_plan',workId,month:value(d,'month'),name:value(d,'name')||undefined,copyFrom:value(d,'copyFrom')||undefined})}>
    <TextField name="month" label="Mês" type="month" defaultValue={month}/>
    {plans.length>0&&<Field label="Partir de"><select className="field" name="copyFrom" defaultValue={latest.id}>{plans.map(p=><option key={p.id} value={p.id}>Cópia de {monthLabel(p.month)} · {p.name}</option>)}<option value="">Em branco</option></select></Field>}
    <p className="text-xs text-slate-500">A cópia leva tarefas, vínculos, recursos, % concluída e datas reais. Tarefas já concluídas antes do novo horizonte ficam de fora; o cronograma do mês anterior não muda.</p>
    <TextField name="name" label="Nome (opcional)" required={false}/>
  </CommandForm>;
}

export function Sheet({plan,data,actorId,readOnly,today,execute,plans,choose}:{plan:MediumTermPlan;data:PlanningData;actorId:string;readOnly:boolean;today:string;execute:Extract<ReturnType<typeof usePlanning>,{state:'ready'}>['execute'];plans:MediumTermPlan[];choose:(id:string)=>void}) {
  const [draft,setDraft]=useState<Draft>(()=>initial(data,plan));
  const [base,setBase]=useState(()=>planSnapshot(plan,data.planTasks,data.planDependencies));
  const [original,setOriginal]=useState<Draft>(()=>initial(data,plan));
  const [past,setPast]=useState<Draft[]>([]),[future,setFuture]=useState<Draft[]>([]);
  const [locked,setLocked]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[review,setReview]=useState(false),[reason,setReason]=useState('');
  const [query,setQuery]=useState(''),[status,setStatus]=useState('all'),[team,setTeam]=useState(''),[reference,setReference]=useState(today);
  const [folded,setFolded]=useState<string[]>([]),[hidden,setHidden]=useState<Col[]>(DEFAULT_HIDDEN),[widths,setWidths]=useState<Record<string,number>>({});
  const [presentation,setPresentation]=useState<Presentation>('split'),[zoom,setZoom]=useState<GanttZoom>('semana'),[tableWidth,setTableWidth]=useState(720);
  const [preferencesLoaded,setPreferencesLoaded]=useState(false);
  const [selected,setSelected]=useState<{row:number;col:number}>({row:0,col:3}),[anchor,setAnchor]=useState<{row:number;col:number}>({row:0,col:3});
  const [editor,setEditor]=useState<{id:string;key:Col;text:string;seeded?:boolean}|null>(null);
  const baselines=data.plans.filter(p=>p.baselineOf===plan.id).sort((a,b)=>(b.frozenAt??'').localeCompare(a.frozenAt??''));
  // Como no Project, a linha de base aparece sempre; a mais recente é a padrão.
  const [baseId,setBaseId]=useState(()=>baselines[0]?.id??''),[meeting,setMeeting]=useState(false),[reviewed,setReviewed]=useState<string[]>([]);
  const [fullDetails,setFullDetails]=useState(false),[metrics,setMetrics]=useState({row:28,head:44});
  const committedEditor=useRef<object|null>(null);
  const reviewDialog=useRef<HTMLDialogElement>(null);
  const gridRef=useRef<HTMLTableElement>(null);const editRef=useRef<HTMLInputElement&HTMLSelectElement>(null);
  const tableScroll=useRef<HTMLDivElement>(null),chartScroll=useRef<HTMLDivElement>(null);
  const prefKey=`cronograma:${actorId}:${plan.id}`;
  const dirty=JSON.stringify(draft)!==JSON.stringify(original);
  const canEdit=!readOnly&&!locked&&!busy&&!plan.frozenAt;
  const teams=data.teams.filter(t=>t.workId===plan.workId);
  const teamLabel=(id?:string)=>{const e=teams.find(t=>t.id===id);return e?`${e.company} · ${e.name}`:'';};
  const win=useMemo(()=>planWindow(plan.month),[plan.month]);
  const roll=useMemo(()=>rollUpPlan(draft.tasks),[draft.tasks]);
  const changed=draft.tasks.filter(t=>JSON.stringify(t)!==JSON.stringify(original.tasks.find(o=>o.id===t.id))||JSON.stringify(draft.links.filter(l=>l.successorId===t.id))!==JSON.stringify(original.links.filter(l=>l.successorId===t.id)));
  const removed=original.tasks.filter(t=>!draft.tasks.some(n=>n.id===t.id));
  const baselineTasks=useMemo(()=>data.planTasks.filter(t=>t.planId===baseId),[data.planTasks,baseId]);const baselineRoll=useMemo(()=>rollUpPlan(baselineTasks),[baselineTasks]);
  const visibleCols=columns.filter(c=>!hidden.includes(c.key)||c.key==='name');
  const filtering=!!query||status!=='all'||!!team;
  const predecessorsOf=(id:string)=>draft.links.filter(l=>l.successorId===id);
  const outOfWindow=(id:string)=>{const v=roll.get(id)!;return !v.summary&&(v.plannedEnd<win.start||v.plannedStart>win.end);};
  // Restrição "Não iniciar antes de" só aparece quando é ela, e não a rede, que segura o início.
  const constrained=(t:PlanTask)=>!t.actualStart&&!!t.anchorStart&&predecessorsOf(t.id).length>0&&(t.plannedStart===t.anchorStart||!isWorking(t.anchorStart,draft.calendar)&&t.plannedStart===shift(t.anchorStart,1,true,draft.calendar));
  const included=new Set<string>();
  const parents:PlanTask[]=[];
  draft.tasks.forEach(t=>{
    while(parents.length&&parents.at(-1)!.level>=t.level)parents.pop();
    const v=roll.get(t.id)!;
    const hay=normalize([t.name,t.notes,teamLabel(t.teamId)].join(' '));
    const match=normalize(query).split(/\s+/).every(token=>hay.includes(token))&&(!team||t.teamId===team)&&
      (status==='all'||status==='zero'&&v.progress===0||status==='ongoing'&&v.progress>0&&v.progress<100||status==='done'&&v.progress===100||status==='late'&&v.progress<100&&v.plannedEnd<reference||status==='changed'&&changed.some(c=>c.id===t.id)||status==='notes'&&!!t.notes||status==='window'&&outOfWindow(t.id));
    if(filtering?match:!parents.some(p=>folded.includes(p.id))){included.add(t.id);if(filtering)parents.forEach(p=>included.add(p.id));}
    parents.push(t);
  });
  const rows=draft.tasks.filter(t=>included.has(t.id));
  const active=rows[selected.row];
  const activeIndex=active?draft.tasks.indexOf(active):-1;
  const bounds={r0:Math.min(anchor.row,selected.row),r1:Math.max(anchor.row,selected.row),c0:Math.min(anchor.col,selected.col),c1:Math.max(anchor.col,selected.col)};
  const baseFor=(id:string)=>{const pair=baselineTasks.find(b=>b.sourceTaskId===id);return pair?baselineRoll.get(pair.id):undefined;};

  // Linha 0 do Project: o resumo do cronograma inteiro.
  const planRow=useMemo(()=>{
    const leaves=draft.tasks.filter(t=>!roll.get(t.id)?.summary);if(!leaves.length)return null;
    const weight=(t:PlanTask)=>Math.max(1,countedDays(t.plannedStart,t.plannedEnd,false,draft.calendar));
    const total=leaves.reduce((n,t)=>n+weight(t),0);
    const baseLeaves=baselineTasks.filter(t=>!baselineRoll.get(t.id)?.summary);
    return {start:leaves.reduce((m,t)=>t.plannedStart<m?t.plannedStart:m,leaves[0].plannedStart),end:leaves.reduce((m,t)=>t.plannedEnd>m?t.plannedEnd:m,leaves[0].plannedEnd),
      progress:leaves.reduce((n,t)=>n+t.progress*weight(t),0)/total,
      actualStart:leaves.map(t=>t.actualStart).filter((d):d is string=>!!d).sort()[0],
      actualEnd:leaves.every(t=>t.actualEnd)?leaves.map(t=>t.actualEnd!).sort().at(-1):undefined,
      baseStart:baseLeaves.map(t=>t.plannedStart).sort()[0],baseEnd:baseLeaves.map(t=>t.plannedEnd).sort().at(-1)};
  },[draft.tasks,draft.calendar,roll,baselineTasks,baselineRoll]);

  useEffect(()=>{try{const p=JSON.parse(localStorage.getItem(prefKey)??'{}');setFolded(Array.isArray(p.folded)?p.folded:[]);if(Array.isArray(p.hidden))setHidden(p.hidden.filter((k:string)=>columns.some(c=>c.key===k)));setWidths(p.widths&&typeof p.widths==='object'?Object.fromEntries(Object.entries(p.widths).filter(([k,v])=>columns.some(c=>c.key===k)&&typeof v==='number'&&v>=36&&v<=600).map(([k,v])=>[k,Number(v)])):{});if(['split','table','chart'].includes(p.presentation))setPresentation(p.presentation);if(['dia','semana','mes'].includes(p.zoom))setZoom(p.zoom);if(typeof p.tableWidth==='number'&&p.tableWidth>=240&&p.tableWidth<=2400)setTableWidth(p.tableWidth);}catch{}setPreferencesLoaded(true);},[prefKey]);
  useEffect(()=>{if(preferencesLoaded)try{localStorage.setItem(prefKey,JSON.stringify({folded,hidden,widths,presentation,zoom,tableWidth}));}catch{}},[prefKey,folded,hidden,widths,presentation,zoom,tableWidth,preferencesLoaded]);
  useEffect(()=>{const handler=(e:BeforeUnloadEvent)=>{if(dirty||editor){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',handler);return()=>window.removeEventListener('beforeunload',handler);},[dirty,editor]);
  useEffect(()=>{const guard=(e:MouseEvent)=>{const link=(e.target as HTMLElement).closest('a[href]');if(link&&(dirty||editor)&&!window.confirm('Sair e perder as alterações não salvas?')){e.preventDefault();e.stopPropagation();}};document.addEventListener('click',guard,true);return()=>document.removeEventListener('click',guard,true);},[dirty,editor]);
  // Atualizações externas não substituem um rascunho aberto.
  useEffect(()=>{if(!dirty&&!editor){const next=initial(data,plan);setDraft(next);setOriginal(next);setBase(planSnapshot(plan,data.planTasks,data.planDependencies));}},[data,plan,dirty]); // eslint-disable-line react-hooks/exhaustive-deps
  // Quem começa a digitar direto na célula continua digitando: a primeira tecla não fica selecionada.
  useEffect(()=>{const input=editRef.current;if(!input)return;input.focus();if(editor?.seeded&&'setSelectionRange' in input)input.setSelectionRange(input.value.length,input.value.length);else input.select?.();},[editor?.id,editor?.key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(()=>{if(review)reviewDialog.current?.showModal();else reviewDialog.current?.close();},[review]);
  // O Gantt se alinha à tabela pela altura medida da linha e do cabeçalho, não por uma constante.
  useEffect(()=>{const table=gridRef.current;if(!table)return;const measure=()=>{const head=table.tHead?.getBoundingClientRect().height;const row=table.tBodies[0]?.rows[0]?.getBoundingClientRect().height;setMetrics(m=>({row:row||m.row,head:head||m.head}));};measure();const observer=new ResizeObserver(measure);observer.observe(table);return()=>observer.disconnect();},[presentation,rows.length>0]);

  function sync(from:HTMLDivElement,to:HTMLDivElement|null){if(to&&Math.abs(to.scrollTop-from.scrollTop)>1)to.scrollTop=from.scrollTop;}
  function stage(next:Draft){setPast(p=>[...p.slice(-49),draft]);setFuture([]);setDraft(next);setError('');}
  function undo(){if(!past.length)return;setFuture(f=>[draft,...f]);setDraft(past.at(-1)!);setPast(p=>p.slice(0,-1));setEditor(null);}
  function redo(){if(!future.length)return;setPast(p=>[...p,draft]);setDraft(future[0]);setFuture(f=>f.slice(1));setEditor(null);}
  function focus(row:number,col:number,extend=false){const next={row:Math.max(0,Math.min(rows.length-1,row)),col:Math.max(0,Math.min(visibleCols.length-1,col))};setSelected(next);if(!extend)setAnchor(next);requestAnimationFrame(()=>gridRef.current?.querySelector<HTMLElement>(`[data-pos="${next.row}:${next.col}"]`)?.focus());}
  function durationText(t:PlanTask){
    const v=roll.get(t.id)!;
    if(v.summary)return formatDuration({value:countedDays(v.plannedStart,v.plannedEnd,true,draft.calendar),unit:'d'});
    return formatDuration(t.duration??{value:countedDays(t.plannedStart,t.plannedEnd,false,draft.calendar),unit:'dd'} as TaskDuration);
  }
  function raw(t:PlanTask,key:Col):string {
    const v=roll.get(t.id)!;const bv=['baseStart','baseEnd','variance'].includes(key)?baseFor(t.id):undefined;
    const target=['target','gap'].includes(key)?temporalTarget({...t,plannedStart:v.plannedStart,plannedEnd:v.plannedEnd},reference,draft.calendar):0;
    switch(key){case'id':return String(draft.tasks.indexOf(t)+1);case'ind':return '';case'name':return t.name;case'duration':return durationText(t);
      case'start':return projectDate(v.plannedStart);case'end':return projectDate(v.plannedEnd);case'progress':return `${Math.round(v.progress)}%`;
      case'actualStart':return projectDate(v.actualStart);case'actualEnd':return projectDate(v.actualEnd);
      case'links':return linkText(draft.tasks,draft.links,t.id);case'team':return teamLabel(t.teamId);
      case'notes':return t.notes??'';case'target':return `${Math.round(target)}%`;case'gap':return `${Math.round(v.progress-target)} pp`;
      case'elapsed':{const business=t.duration?!['dd','md'].includes(t.duration.unit):false;return `${reference<v.plannedStart?0:countedDays(v.plannedStart,reference>v.plannedEnd?v.plannedEnd:reference,business,draft.calendar)} / ${countedDays(v.plannedStart,v.plannedEnd,business,draft.calendar)}`;}
      case'baseStart':return projectDate(bv?.plannedStart);case'baseEnd':return projectDate(bv?.plannedEnd);
      case'variance':return bv?String(Math.round((Date.parse(v.plannedEnd)-Date.parse(bv.plannedEnd))/86400000)):'';
    }
  }
  function planRaw(key:Col):string {
    if(!planRow)return '';
    switch(key){case'id':return '0';case'name':return plan.name;case'progress':return `${Math.round(planRow.progress)}%`;
      case'duration':return formatDuration({value:countedDays(planRow.start,planRow.end,true,draft.calendar),unit:'d'});
      case'start':return projectDate(planRow.start);case'end':return projectDate(planRow.end);
      case'actualStart':return projectDate(planRow.actualStart);case'actualEnd':return projectDate(planRow.actualEnd);
      case'baseStart':return baseId?projectDate(planRow.baseStart):'ND';case'baseEnd':return baseId?projectDate(planRow.baseEnd):'ND';
      default:return '';}
  }
  function editable(t:PlanTask,key:Col){return canEdit&&!!columns.find(c=>c.key===key)?.editable&&!(roll.get(t.id)?.summary&&LEAF_ONLY.includes(key));}
  function applyCells(entries:{id:string;key:Col;text:string}[]) {
    if(entries.length>1000)throw new Error('Limite de 1000 células por operação.');
    const next=structuredClone(draft);
    for(const entry of entries){const at=next.tasks.findIndex(t=>t.id===entry.id);const t=next.tasks[at];
      if(!t||!editable(t,entry.key))throw new Error('O intervalo contém uma célula bloqueada ou calculada.');
      switch(entry.key){
        case'name':if(!entry.text.trim())throw new Error('Nome é obrigatório.');t.name=entry.text.trim();break;
        case'notes':t.notes=entry.text;break;
        case'progress':{const n=Number(entry.text.replace('%','').replace(',','.').trim());if(!entry.text.trim()||!Number.isFinite(n))throw new Error('% concluída deve ficar entre 0 e 100.');next.tasks[at]=withProgress(t,n,next.calendar);break;}
        case'actualStart':next.tasks[at]=withActualStart(t,blank(entry.text)?undefined:dateInput(entry.text),next.calendar);break;
        case'actualEnd':next.tasks[at]=withActualEnd(t,blank(entry.text)?undefined:dateInput(entry.text),next.calendar);break;
        case'team':{const text=entry.text.trim();const match=teams.find(e=>e.id===text||`${e.company} · ${e.name}`===text||normalize(e.name)===normalize(text)||normalize(e.company)===normalize(text));if(text&&!match)throw new Error('Escolha um recurso cadastrado na obra.');t.teamId=match?.id;break;}
        case'duration':if(t.actualEnd)throw new Error('Tarefa concluída: a duração vem do início e do término reais.');t.duration=parseDuration(entry.text);break;
        case'start':{
          if(t.actualStart)throw new Error('A tarefa já começou: corrija o Início real.');
          // Apagar o início de uma tarefa com predecessoras devolve a data à rede, como "o mais breve possível".
          if(blank(entry.text)){if(!next.links.some(l=>l.successorId===t.id))throw new Error('Informe o início.');delete t.anchorStart;break;}
          const start=dateInput(entry.text);t.duration??={value:countedDays(t.plannedStart,t.plannedEnd,false,next.calendar),unit:'dd'};t.anchorStart=start;t.plannedStart=start;t.plannedEnd=endFor(start,t.duration,next.calendar).end;break;}
        case'end':{if(t.actualEnd)throw new Error('Tarefa concluída: corrija o Término real.');const end=dateInput(entry.text);const business=t.duration?!['dd','md'].includes(t.duration.unit):true;t.duration={value:countedDays(t.plannedStart,end,business,next.calendar),unit:business?'d':'dd'};if(!t.duration.value)throw new Error('Período sem dia de trabalho.');t.plannedEnd=end;break;}
        case'links':{const parsed=parseLinks(entry.text);if(parsed.invalid.length)throw new Error(`Predecessora inválida: ${parsed.invalid.join(', ')}`);next.links=next.links.filter(l=>l.successorId!==t.id);for(const l of parsed.links){const p=next.tasks[l.number-1];if(!p)throw new Error(`Linha ${l.number} não existe.`);if(p.id===t.id)throw new Error('A tarefa não pode ser predecessora dela mesma.');next.links.push({id:crypto.randomUUID(),...stamp(),predecessorId:p.id,successorId:t.id,type:l.type,lagDays:l.lagDays,lagBusiness:l.lagBusiness});}break;}
      }
    }
    next.tasks=scheduleTasks(next.tasks,next.links,next.calendar);stage(next);
  }
  function commit(){if(!editor||committedEditor.current===editor)return true;try{applyCells([editor]);committedEditor.current=editor;setEditor(null);return true;}catch(e){setError((e as Error).message);editRef.current?.focus();return false;}}
  function begin(t:PlanTask,key:Col,seed?:string){if(editable(t,key)){setError('');const text=raw(t,key);setEditor({id:t.id,key,seeded:seed!==undefined,text:seed??(key==='team'?t.teamId??'':text==='ND'?'':key==='progress'?text.replace('%',''):text)});}}
  async function save(){if(editor&&!commit())return;setBusy(true);setError('');try{await execute({type:'save_plan_revision',planId:plan.id,expectedSnapshot:base,reason,tasks:draft.tasks,links:draft.links,calendar:draft.calendar});setOriginal(draft);setPast([]);setFuture([]);setReview(false);setReason('');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  function structural(kind:'insert'|'remove'|'indent'|'outdent'|'link'|'unlink') {
    if(!canEdit||filtering)return;
    const next=structuredClone(draft);const at=activeIndex;
    if(kind==='insert'){
      // Como a tecla Insert do Project: a nova linha entra acima da selecionada, no mesmo nível.
      const start=at>=0?roll.get(draft.tasks[at].id)!.plannedStart:win.start;const level=at>=0?next.tasks[at].level:0;
      const task:PlanTask={id:crypto.randomUUID(),...stamp(),planId:plan.id,name:'Nova tarefa',plannedStart:start,plannedEnd:start,anchorStart:start,duration:{value:1,unit:'d'},progress:0,order:0,level};
      next.tasks.splice(at>=0?at:next.tasks.length,0,task);next.tasks.forEach((t,i)=>t.order=i+1);
    }
    else if(kind==='link'||kind==='unlink'){
      const chosen=rows.slice(bounds.r0,bounds.r1+1).filter(t=>!roll.get(t.id)!.summary);const ids=new Set(chosen.map(t=>t.id));
      if(kind==='link'){if(chosen.length<2){setError('Selecione duas ou mais tarefas (Shift+setas) para vincular.');return;}
        for(let i=1;i<chosen.length;i++)if(!next.links.some(l=>l.predecessorId===chosen[i-1].id&&l.successorId===chosen[i].id))next.links.push({id:crypto.randomUUID(),...stamp(),predecessorId:chosen[i-1].id,successorId:chosen[i].id,type:'TI',lagDays:0,lagBusiness:true});}
      else next.links=chosen.length>1?next.links.filter(l=>!(ids.has(l.predecessorId)&&ids.has(l.successorId))):next.links.filter(l=>!ids.has(l.predecessorId)&&!ids.has(l.successorId));
    }
    else if(at>=0){let end=at+1;while(end<next.tasks.length&&next.tasks[end].level>next.tasks[at].level)end++;
      if(kind==='remove'){if(!window.confirm(`Excluir “${active.name}”${end-at>1?` e ${end-at-1} subitens`:''} do rascunho?`))return;const ids=new Set(next.tasks.slice(at,end).map(t=>t.id));next.tasks.splice(at,end-at);next.links=next.links.filter(l=>!ids.has(l.predecessorId)&&!ids.has(l.successorId));next.tasks.forEach((t,i)=>t.order=i+1);}
      else {if(kind==='indent'&&(at===0||next.tasks[at].level>next.tasks[at-1].level)||kind==='outdent'&&next.tasks[at].level===0)return;for(let i=at;i<end;i++)next.tasks[i].level+=kind==='indent'?1:-1;
        // Quem vira resumo não pode carregar vínculo nem data real: esses ficam nas subtarefas.
        if(kind==='indent'&&next.tasks[at].level>next.tasks[at-1].level){const parent=next.tasks[at-1];next.links=next.links.filter(l=>l.predecessorId!==parent.id&&l.successorId!==parent.id);delete parent.actualStart;delete parent.actualEnd;}}
    }
    else return;
    try{next.tasks=scheduleTasks(next.tasks,next.links,next.calendar);stage(next);}catch(e){setError((e as Error).message);}
  }
  function keyDown(e:React.KeyboardEvent,t:PlanTask,r:number,c:number){
    if(editor)return;
    const cmd=e.ctrlKey||e.metaKey;
    if(cmd&&e.key.toLowerCase()==='z'){e.preventDefault();if(canEdit){if(e.shiftKey)redo();else undo();}return;}
    if(cmd&&e.key.toLowerCase()==='y'){e.preventDefault();if(canEdit)redo();return;}
    if(cmd&&e.key==='F2'){e.preventDefault();structural(e.shiftKey?'unlink':'link');return;}
    if(e.key==='Insert'){e.preventDefault();structural('insert');return;}
    if(e.altKey&&e.shiftKey&&(e.key==='ArrowRight'||e.key==='ArrowLeft')){e.preventDefault();structural(e.key==='ArrowRight'?'indent':'outdent');return;}
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
  const show=(key:string,v:unknown)=>v===undefined||v===null||v===''?'—':['plannedStart','plannedEnd','anchorStart','actualStart','actualEnd'].includes(key)?projectDate(String(v)):key==='duration'?formatDuration(v as TaskDuration):key==='teamId'?teamLabel(String(v))||'—':key==='progress'?`${v}%`:String(v);

  const ganttRows:GanttRow[]=useMemo(()=>[
    ...(planRow?[{id:PLAN_ROW,name:plan.name,summary:true,milestone:false,level:-1,start:planRow.start,end:planRow.end,progress:planRow.progress,actualStart:planRow.actualStart,actualEnd:planRow.actualEnd,baseStart:baseId?planRow.baseStart:undefined,baseEnd:baseId?planRow.baseEnd:undefined}]:[]),
    ...rows.map(t=>{const v=roll.get(t.id)!;const bv=baseFor(t.id);return {id:t.id,name:t.name,summary:v.summary,milestone:v.milestone,level:t.level,start:v.plannedStart,end:v.plannedEnd,progress:v.progress,actualStart:v.actualStart,actualEnd:v.actualEnd,baseStart:bv?.plannedStart,baseEnd:bv?.plannedEnd,outOfWindow:outOfWindow(t.id)};}),
  ],[rows,roll,planRow,baseId,baselineTasks,baselineRoll]); // eslint-disable-line react-hooks/exhaustive-deps
  const ganttLinks:GanttLink[]=useMemo(()=>draft.links.map(l=>({id:l.id,from:l.predecessorId,to:l.successorId,type:l.type})),[draft.links]);
  const outside=draft.tasks.filter(t=>outOfWindow(t.id)).length;
  const normalized=useMemo(()=>{const raw=stored(data,plan).tasks;return original.tasks.filter(t=>JSON.stringify(t)!==JSON.stringify(raw.find(r=>r.id===t.id))).length;},[data,plan,original]);
  const tableTotal=visibleCols.reduce((n,c)=>n+(widths[c.key]??c.width),0);

  const tool='inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40';
  const group='flex flex-wrap items-center gap-0.5 border-r border-slate-200 pr-2 last:border-r-0';
  const cellClass=(col:Col,summary:boolean)=>`${col.startsWith('base')?'text-slate-500':''} ${columns.find(c=>c.key===col)?.right?'text-right':''} ${summary?'font-semibold text-slate-900':''}`;

  return <>
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-slate-200 p-3">
      <div className="mr-auto"><h2 className="font-semibold text-slate-900">Cronograma do mês</h2><p className="text-xs text-slate-500">Horizonte de três meses: {projectDate(win.start)} a {projectDate(win.end)}{plan.copiedFromPlanId?` · copiado de ${monthLabel(data.plans.find(p=>p.id===plan.copiedFromPlanId)?.month??plan.month)}`:''}</p></div>
      <label className="text-xs font-semibold text-slate-600">Mês <select className="field w-auto py-1.5" value={plan.id} disabled={dirty||!!editor||busy} onChange={e=>choose(e.target.value)}>{plans.map(p=><option key={p.id} value={p.id}>{monthLabel(p.month)} · {p.name}</option>)}</select></label>
      <span role="status" aria-live="polite" className={`text-xs ${dirty?'font-semibold text-amber-700':'text-slate-500'}`}>{busy?'Salvando…':dirty?`${changed.length+removed.length} tarefas alteradas · não salvo`:'Tudo salvo'}</span>
      <button className="button" disabled={!dirty||readOnly||busy||!!editor} onClick={()=>setReview(true)}>Revisar e salvar</button>
    </div>
    <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-1.5" role="toolbar" aria-label="Ferramentas do cronograma">
      <div className={group}>
        <button className={tool} disabled={readOnly||busy||!!plan.frozenAt} aria-pressed={!locked} onClick={()=>{if(editor&&!commit())return;setLocked(!locked);}} title="A grade abre bloqueada, contra alteração acidental em reunião">{locked?<Lock size={14} aria-hidden/>:<LockOpen size={14} aria-hidden/>}{locked?'Liberar edição':'Bloquear'}</button>
        <button className={tool} disabled={!canEdit||!past.length} onClick={undo} title="Desfazer (Ctrl+Z)"><Undo2 size={14} aria-hidden/><span className="sr-only">Desfazer</span></button>
        <button className={tool} disabled={!canEdit||!future.length} onClick={redo} title="Refazer (Ctrl+Y)"><Redo2 size={14} aria-hidden/><span className="sr-only">Refazer</span></button>
      </div>
      <div className={group} aria-label="Tarefa">
        <button className={tool} disabled={!canEdit||!!editor||filtering} onClick={()=>structural('insert')} title="Inserir tarefa acima da selecionada (Insert)"><ListPlus size={14} aria-hidden/>Inserir tarefa</button>
        <button className={tool} disabled={!canEdit||!active||!!editor||filtering} onClick={()=>structural('outdent')} title="Diminuir recuo (Alt+Shift+←)"><IndentDecrease size={14} aria-hidden/><span className="sr-only">Diminuir recuo</span></button>
        <button className={tool} disabled={!canEdit||!active||!!editor||filtering} onClick={()=>structural('indent')} title="Recuar tarefa, tornando-a subitem da de cima (Alt+Shift+→)"><IndentIncrease size={14} aria-hidden/><span className="sr-only">Recuar tarefa</span></button>
        <button className={tool} disabled={!canEdit||!active||!!editor||filtering} onClick={()=>structural('link')} title="Vincular as tarefas selecionadas em Término-Início (Ctrl+F2)"><Link2 size={14} aria-hidden/>Vincular</button>
        <button className={tool} disabled={!canEdit||!active||!!editor||filtering} onClick={()=>structural('unlink')} title="Desvincular as tarefas selecionadas (Ctrl+Shift+F2)"><Unlink2 size={14} aria-hidden/><span className="sr-only">Desvincular</span></button>
        <button className={`${tool} text-rose-700`} disabled={!canEdit||!active||!!editor||filtering} onClick={()=>structural('remove')} title="Excluir tarefa e subitens"><Trash2 size={14} aria-hidden/><span className="sr-only">Excluir tarefa</span></button>
      </div>
      <div className={group} aria-label="Exibir">
        <label className="flex items-center gap-1 text-xs text-slate-600">Linha de base<select className="field w-auto py-1 text-xs" value={baseId} onChange={e=>setBaseId(e.target.value)}><option value="">Nenhuma</option>{baselines.map(b=><option key={b.id} value={b.id}>{b.name}{b.frozenAt?` · ${formatDate(b.frozenAt.slice(0,10))}`:''}</option>)}</select></label>
        <button className={tool} disabled={filtering} onClick={()=>setFolded([])}>Expandir</button><button className={tool} disabled={filtering} onClick={()=>setFolded(draft.tasks.filter(t=>roll.get(t.id)?.summary).map(t=>t.id))}>Recolher</button>
        <details className="relative"><summary className={`${tool} cursor-pointer list-none`}>Colunas</summary><div className="absolute left-0 z-40 mt-1 grid w-56 gap-1.5 rounded-lg border border-slate-200 bg-white p-3 text-xs shadow-xl">{columns.map(c=><label key={c.key} className="flex items-center gap-2"><input type="checkbox" checked={!hidden.includes(c.key)||c.key==='name'} disabled={c.key==='name'} onChange={e=>setHidden(e.target.checked?hidden.filter(k=>k!==c.key):[...hidden,c.key])}/> {c.label}</label>)}<button className="button-ghost mt-1" onClick={()=>{setHidden(DEFAULT_HIDDEN);setWidths({});}}>Restaurar padrão</button></div></details>
        <button className={tool} aria-pressed={meeting} onClick={()=>setMeeting(!meeting)}>Modo reunião</button>
      </div>
    </div>
    <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-3 py-1.5 text-xs">
      <label className="relative"><span className="sr-only">Buscar tarefas</span><input type="search" className="field w-56 py-1 text-xs" placeholder="Buscar tarefa, recurso ou anotação" value={query} disabled={!!editor} onChange={e=>{setQuery(e.target.value);setSelected({row:0,col:selected.col});}}/></label>
      <label><span className="sr-only">Filtrar por situação</span><select className="field w-auto py-1 text-xs" value={status} disabled={!!editor} onChange={e=>{setStatus(e.target.value);setSelected({row:0,col:selected.col});}}>{[['all','Todas as tarefas'],['zero','Não iniciadas'],['ongoing','Em andamento'],['done','Concluídas'],['late','Atrasadas'],['window','Fora do horizonte'],['changed','Alteradas no rascunho'],['notes','Com anotações']].map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
      <label><span className="sr-only">Filtrar por recurso</span><select className="field w-auto py-1 text-xs" value={team} disabled={!!editor} onChange={e=>{setTeam(e.target.value);setSelected({row:0,col:selected.col});}}><option value="">Todos os recursos</option>{teams.map(t=><option key={t.id} value={t.id}>{t.company} · {t.name}</option>)}</select></label>
      {!hidden.includes('target')&&<label className="flex items-center gap-1 text-slate-600">Referência do % alvo<input className="field w-auto py-1 text-xs" type="date" value={reference} onChange={e=>{if(e.target.value)setReference(e.target.value);}}/></label>}
      <span className="ml-auto text-slate-500">F2 edita · Insert insere · Alt+Shift+→ recua · Ctrl+F2 vincula · Ctrl+D preenche abaixo</span>
    </div>
    {normalized>0&&<p className="border-b border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">{normalized} {normalized===1?'tarefa foi ajustada':'tarefas foram ajustadas'} à regra do Project ao abrir: % concluída sem início real recebe o início previsto, e o “Não iniciar antes de” passa a valer junto das predecessoras. O ajuste é gravado no próximo “Revisar e salvar”.</p>}
    {error&&<p id="schedule-error" role="alert" className="border-b bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    {outside>0&&<p className="border-b border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"><CircleAlert size={13} className="mr-1 inline" aria-hidden/>{outside} {outside===1?'tarefa está':'tarefas estão'} fora do horizonte de três meses ({projectDate(win.start)} a {projectDate(win.end)}). O filtro “Fora do horizonte” mostra quais.</p>}

    <div className="flex h-[68vh] min-h-[320px] border-b border-slate-200" onCopy={e=>{if(editor)return;e.preventDefault();const text=encodeGrid(rows.slice(bounds.r0,bounds.r1+1).map(t=>visibleCols.slice(bounds.c0,bounds.c1+1).map(c=>raw(t,c.key))));e.clipboardData.setData('text/plain',text);}}
      onPaste={e=>{if(editor)return;e.preventDefault();try{const matrix=decodeGrid(e.clipboardData.getData('text/plain'));const entries=matrix.flatMap((line,r)=>line.map((text,c)=>{const t=rows[selected.row+r],col=visibleCols[selected.col+c];if(!t||!col)throw new Error('Colagem ultrapassa a grade.');return{id:t.id,key:col.key,text};}));applyCells(entries);}catch(err){setError((err as Error).message);}}}>
      {presentation!=='chart'&&<div ref={tableScroll} onScroll={e=>sync(e.currentTarget,chartScroll.current)} className="min-w-0 overflow-auto" style={{width:presentation==='split'?Math.min(tableWidth,tableTotal+2):'100%',flex:presentation==='split'?'none':'1',overflowX:'scroll'}} role="region" aria-label="Tabela do cronograma" tabIndex={-1}>
        <table ref={gridRef} className="schedule-grid project-grid" role="grid" aria-label="Cronograma de médio prazo" aria-multiselectable="true" style={{width:tableTotal}}>
          <thead><tr>{visibleCols.map(c=><th key={c.key} scope="col" style={{width:widths[c.key]??c.width}} className={c.right?'text-right':''}>{c.key==='ind'?<span title="Indicadores"><span aria-hidden>ⓘ</span><span className="sr-only">Indicadores</span></span>:c.label}<span role="separator" aria-label={`Largura de ${c.label}`} aria-orientation="vertical" aria-valuemin={36} aria-valuemax={600} aria-valuenow={widths[c.key]??c.width} tabIndex={0} className="schedule-resize" onKeyDown={e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();setWidths(w=>({...w,[c.key]:Math.max(36,Math.min(600,(w[c.key]??c.width)+(e.key==='ArrowRight'?10:-10)))}));}}} onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);e.currentTarget.dataset.x=String(e.clientX);e.currentTarget.dataset.width=String(widths[c.key]??c.width);}} onPointerMove={e=>{if(e.currentTarget.hasPointerCapture(e.pointerId))setWidths(w=>({...w,[c.key]:Math.max(36,Math.min(600,Number(e.currentTarget.dataset.width)+e.clientX-Number(e.currentTarget.dataset.x)))}));}}/></th>)}</tr></thead>
          <tbody>
            {planRow&&<tr className="project-plan-row" aria-label={`Resumo do cronograma: ${plan.name}`}>{visibleCols.map(col=><td key={col.key} aria-readonly className={cellClass(col.key,true)} title={col.key==='name'?'Resumo do cronograma inteiro, calculado das tarefas':undefined}>{col.key==='name'?<span className="flex items-center gap-1"><ChevronDown size={13} className="shrink-0 text-slate-400" aria-hidden/>{planRaw(col.key)}</span>:planRaw(col.key)}</td>)}</tr>}
            {rows.map((t,r)=>{const v=roll.get(t.id)!;const isSelected=r===selected.row;return <tr key={t.id} className={isSelected?'project-row-selected':''}>{visibleCols.map((col,c)=>{const editing=editor?.id===t.id&&editor.key===col.key;const selectedCell=r>=bounds.r0&&r<=bounds.r1&&c>=bounds.c0&&c<=bounds.c1;const old=original.tasks.find(o=>o.id===t.id);const field=({start:'plannedStart',end:'plannedEnd',team:'teamId'} as Record<string,string>)[col.key]??col.key;const modified=col.key==='links'?JSON.stringify(original.links.filter(l=>l.successorId===t.id))!==JSON.stringify(draft.links.filter(l=>l.successorId===t.id)):JSON.stringify(old?.[field as keyof PlanTask])!==JSON.stringify(t[field as keyof PlanTask]);const text=raw(t,col.key);
              return <td key={col.key} role="gridcell" data-pos={`${r}:${c}`} tabIndex={selected.row===r&&selected.col===c?0:-1} aria-selected={selectedCell} aria-readonly={!editable(t,col.key)} title={`${text}${v.summary&&LEAF_ONLY.includes(col.key)?' · Resumo calculado das subtarefas':''}${modified?' · Alteração não salva':''}`} className={`${cellClass(col.key,v.summary)} ${selectedCell?'schedule-selected':''} ${modified?'schedule-modified':''}`}
                onClick={e=>{if(editor&&!editing&&!commit())return;setSelected({row:r,col:c});if(!e.shiftKey)setAnchor({row:r,col:c});}} onDoubleClick={()=>begin(t,col.key)} onKeyDown={e=>keyDown(e,t,r,c)}>
                {editing?(col.key==='team'?<select ref={editRef} aria-label={`Recurso de ${t.name}`} value={editor.text} onChange={e=>setEditor({...editor,text:e.target.value})} onBlur={commit} onKeyDown={e=>editorKey(e,r,c)}><option value="">Sem recurso</option>{teams.map(team=><option key={team.id} value={team.id}>{team.company} · {team.name}</option>)}</select>
                  :<input ref={editRef} aria-label={`${col.label} de ${t.name}`} aria-invalid={!!error} aria-describedby={error?'schedule-error':undefined} value={editor.text} placeholder={col.key.startsWith('actual')?'dd/mm/aa ou vazio':undefined} onChange={e=>setEditor({...editor,text:e.target.value})} onBlur={commit} onKeyDown={e=>editorKey(e,r,c)}/>)
                  :col.key==='name'?<div className="flex items-center gap-1 truncate" style={{paddingLeft:t.level*16}}>{v.summary?<button tabIndex={-1} aria-label={`${folded.includes(t.id)?'Expandir':'Recolher'} ${t.name}`} className="shrink-0 text-slate-500 hover:text-slate-900 disabled:opacity-40" disabled={filtering} onClick={e=>{e.stopPropagation();setFolded(f=>f.includes(t.id)?f.filter(id=>id!==t.id):[...f,t.id]);}}>{folded.includes(t.id)?<ChevronRight size={13} aria-hidden/>:<ChevronDown size={13} aria-hidden/>}</button>:<span className="w-[13px] shrink-0"/>}<span className="shrink-0 text-slate-400">{v.number}</span><span className="truncate">{t.name}</span></div>
                  :col.key==='ind'?<Indicators done={v.progress===100} constraint={constrained(t)?t.anchorStart:undefined} outside={outOfWindow(t.id)} notes={!!t.notes}/>
                  :<span className={col.key==='id'?'text-slate-400':''}>{text}</span>}
              </td>;
            })}</tr>;})}
          </tbody>
        </table>{!rows.length&&<p className="p-5 text-sm text-slate-600">{filtering?'Nenhuma tarefa neste filtro.':'Cronograma vazio. Libere a edição e use “Inserir tarefa”.'}</p>}
      </div>}
      {presentation==='split'&&<div role="separator" aria-orientation="vertical" aria-label="Divisão entre tabela e Gantt" aria-valuenow={tableWidth} aria-valuemin={240} aria-valuemax={2400} tabIndex={0} className="w-1.5 shrink-0 cursor-col-resize bg-slate-200 hover:bg-blue-300 focus:bg-blue-400 focus:outline-none"
        onKeyDown={e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();setTableWidth(w=>Math.max(240,Math.min(2400,w+(e.key==='ArrowRight'?40:-40))));}}}
        onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);e.currentTarget.dataset.x=String(e.clientX);e.currentTarget.dataset.width=String(Math.min(tableWidth,tableTotal+2));}}
        onPointerMove={e=>{if(e.currentTarget.hasPointerCapture(e.pointerId))setTableWidth(Math.max(240,Math.min(2400,Number(e.currentTarget.dataset.width)+e.clientX-Number(e.currentTarget.dataset.x))));}}/>}
      {presentation!=='table'&&<GanttChart rows={ganttRows} links={ganttLinks} window={win} today={today} zoom={zoom} rowHeight={metrics.row} headerHeight={metrics.head} calendar={draft.calendar} showBaseline={!!baseId}
        selectedId={active?.id} onSelect={id=>{if(id===PLAN_ROW)return;const r=rows.findIndex(t=>t.id===id);if(r>=0){if(editor&&!commit())return;setSelected({row:r,col:selected.col});setAnchor({row:r,col:selected.col});}}}
        scrollRef={chartScroll} onScroll={e=>sync(e.currentTarget,tableScroll.current)} className="min-w-0 flex-1"/>}
    </div>
    <div className="flex flex-wrap items-center gap-3 bg-slate-100 px-3 py-1 text-[11px] text-slate-600" aria-label="Barra de status">
      <span>Novas tarefas: <strong>Agendadas automaticamente</strong></span>
      <span>{draft.tasks.length} tarefas · {draft.links.length} vínculos</span>
      {!draft.tasks.some(t=>t.progress>0)&&<span>Sem avanço lançado ainda</span>}
      <div className="ml-auto flex items-center gap-1" aria-label="Modo de exibição">
        {([{id:'split',label:'Tabela e Gantt',Icon:PanelLeft},{id:'table',label:'Somente tabela',Icon:Table2},{id:'chart',label:'Somente Gantt',Icon:ChartGantt}] as const).map(m=><button key={m.id} type="button" className={`flex h-7 w-8 items-center justify-center rounded ${presentation===m.id?'bg-white text-blue-800 shadow-sm':'hover:bg-white/70'}`} aria-label={m.label} title={m.label} aria-pressed={presentation===m.id} onClick={()=>setPresentation(m.id)}><m.Icon size={15} aria-hidden/></button>)}
        {presentation!=='table'&&<span className="ml-2 flex items-center gap-0.5" aria-label="Escala do Gantt">{([['dia','Dias'],['semana','Semanas'],['mes','Meses']] as const).map(([z,l])=><button key={z} type="button" className={`h-7 rounded px-2 ${zoom===z?'bg-white font-semibold text-blue-800 shadow-sm':'hover:bg-white/70'}`} aria-pressed={zoom===z} onClick={()=>setZoom(z)}>{l}</button>)}</span>}
      </div>
    </div>

    {active&&<aside className={fullDetails?"fixed inset-0 z-40 overflow-auto bg-white p-4":"border-t bg-slate-50 p-4"} aria-label="Detalhes da tarefa"><div className="flex flex-wrap items-center gap-3"><h3 className="mr-auto font-semibold">{roll.get(active.id)?.number} · {active.name}</h3><button className="button-ghost" onClick={()=>setFullDetails(!fullDetails)}>{fullDetails?'Fechar tela cheia':'Detalhes em tela cheia'}</button>{meeting&&<><button className="button-ghost" onClick={()=>focus(selected.row-1,selected.col)}>Anterior</button><button className="button-ghost" onClick={()=>focus(selected.row+1,selected.col)}>Próxima</button><label className="text-xs"><input type="checkbox" checked={reviewed.includes(active.id)} onChange={e=>setReviewed(e.target.checked?[...reviewed,active.id]:reviewed.filter(id=>id!==active.id))}/> Revisado nesta reunião</label></>}</div>
      <p className="my-2 text-xs text-slate-600">{raw(active,'start')} a {raw(active,'end')} · {raw(active,'duration')} · {raw(active,'progress')} concluída · Início real {raw(active,'actualStart')} · Término real {raw(active,'actualEnd')} · Predecessoras {raw(active,'links')||'—'}{constrained(active)?` · Não iniciar antes de ${projectDate(active.anchorStart)}`:''}{baseId?` · Variação contra a base ${raw(active,'variance')||'—'} dias`:''}</p>
      <p className="text-xs text-slate-500">% alvo em {formatDate(reference)}: {raw(active,'target')} — leitura de tempo decorrido, não medição física.</p>
      <label className="mt-2 block text-xs">Anotações e encaminhamentos<textarea key={active.id} className="field mt-1 min-h-24 whitespace-pre-wrap" readOnly={!canEdit} value={active.notes??''} onChange={e=>{try{applyCells([{id:active.id,key:'notes',text:e.target.value}]);}catch(err){setError((err as Error).message);}}}/></label>
      <button className="button-ghost mt-2" disabled={!canEdit||!active.notes} onClick={()=>applyCells([{id:active.id,key:'notes',text:active.notes!.split('\n').map(l=>l.trim()?`• ${l}`:l).join('\n')}])}>Transformar linhas em tópicos</button>
      <details className="mt-3"><summary>Histórico da tarefa</summary>{data.history.filter(h=>h.entityId===active.id&&h.action==='plan_task_revision').slice().reverse().map(h=><div key={h.id} className="my-2 border-b py-2 text-xs"><p>{formatDate(h.occurredAt.slice(0,10))} {h.occurredAt.slice(11,19)} · {data.users.find(u=>u.id===h.authorId)?.name??h.authorId} · {String(h.changes.reason??'Motivo não registrado')}</p><dl className="whitespace-pre-wrap">{Object.entries((h.changes.fields??{}) as Record<string,{before:unknown;after:unknown}>).map(([field,change])=><div key={field}><dt className="font-semibold">{fieldLabels[field]??field}</dt><dd>{show(field,change.before)} → {show(field,change.after)}</dd></div>)}</dl></div>)}</details>
    </aside>}
    <details className="border-t p-3 text-sm"><summary>Calendário de trabalho</summary><div className="mt-3 flex flex-wrap gap-3">
      {[0,1,2,3,4,5,6].map(day=><label key={day}><input type="checkbox" disabled={!canEdit} checked={draft.calendar.weekdays.includes(day)} onChange={e=>{const calendar={...draft.calendar,weekdays:e.target.checked?[...draft.calendar.weekdays,day]:draft.calendar.weekdays.filter(d=>d!==day)};try{stage({...draft,calendar,tasks:scheduleTasks(draft.tasks,draft.links,calendar)});}catch(err){setError((err as Error).message);}}}/> {WEEKDAYS[day]}</label>)}
      {(['hoursPerDay','daysPerMonth'] as const).map(key=><label key={key}>{key==='hoursPerDay'?'Horas por dia':'Dias por mês'}<input className="field w-24" type="number" disabled={!canEdit} value={draft.calendar[key]} onChange={e=>{const calendar={...draft.calendar,[key]:Number(e.target.value)};try{stage({...draft,calendar,tasks:scheduleTasks(draft.tasks,draft.links,calendar)});}catch(err){setError((err as Error).message);}}}/></label>)}
      <label>Feriados (AAAA-MM-DD, separados por vírgula)<input key={draft.calendar.holidays.join(',')} className="field" defaultValue={draft.calendar.holidays.join(', ')} disabled={!canEdit} onBlur={e=>{const calendar={...draft.calendar,holidays:e.target.value.split(',').map(d=>d.trim()).filter(Boolean)};try{stage({...draft,calendar,tasks:scheduleTasks(draft.tasks,draft.links,calendar)});}catch(err){setError((err as Error).message);}}}/></label>
    </div><p className="mt-2 text-xs">Duração aceita “10 dias”, “10 dias corridos”, “8h”, “1 mês” e “0 dias” (marco). Predecessoras usam o Id da linha, como no Project: “12”, “12;14”, “27TI+6 dias”, “12II+2 dias corridos”, “5TT-1 dia”. Vínculos ficam nas subtarefas, não nos resumos.</p></details>
    <div className="flex flex-wrap gap-3 border-t p-3">{!readOnly&&!dirty&&!editor&&<><CommandForm title="Definir linha de base" submit="Salvar linha de base" onDone={setBaseId} command={d=>({type:'freeze_plan_baseline',planId:plan.id,name:value(d,'name')})}><TextField name="name" label="Nome da linha de base" defaultValue={`Base ${formatDate(today)}`}/></CommandForm><NewPlanForm workId={plan.workId} plans={plans} today={today} onDone={choose}/></>}{dirty&&<button className="button-ghost" disabled={busy} onClick={()=>{if(window.confirm('Descartar todas as alterações não salvas?')){setDraft(original);setPast([]);setFuture([]);setEditor(null);}}}>Descartar rascunho</button>}</div>
    <dialog ref={reviewDialog} aria-label="Revisão do cronograma" onCancel={e=>{e.preventDefault();if(!busy)setReview(false);}} className="m-auto max-h-[90vh] w-[min(95vw,48rem)] rounded-lg p-0 backdrop:bg-slate-950/50"><div className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-lg bg-white p-5"><h3 className="font-bold">Revisar atualização</h3><p className="my-2 text-sm">{changed.length} tarefas alteradas, {removed.length} excluídas. As datas das sucessoras já foram reagendadas pela rede.</p><ul className="max-h-60 overflow-auto text-xs">{changed.map(t=>{const old=original.tasks.find(o=>o.id===t.id);const before=old?linkText(original.tasks,original.links,t.id):'';const after=linkText(draft.tasks,draft.links,t.id);return <li key={t.id} className="border-b py-2"><strong>{draft.tasks.indexOf(t)+1} · {t.name}</strong>{!old&&<span className="ml-2 text-emerald-700">nova</span>}{(['name','plannedStart','plannedEnd','duration','anchorStart','actualStart','actualEnd','teamId','progress','notes','level'] as const).filter(k=>old&&JSON.stringify(old[k])!==JSON.stringify(t[k])).map(k=><p key={k}>{fieldLabels[k]}: {show(k,old?.[k])} → {show(k,t[k])}</p>)}{before!==after&&<p>Predecessoras: {before||'—'} → {after||'—'}</p>}</li>;})}{removed.map(t=><li key={t.id} className="border-b py-2 text-rose-700">Excluir: {t.name}</li>)}</ul>{JSON.stringify(draft.calendar)!==JSON.stringify(original.calendar)&&<p className="my-2 text-sm">Calendário alterado nesta revisão.</p>}{normalized>0&&<p className="my-2 text-sm">Também vão ao banco {normalized} {normalized===1?'tarefa ajustada':'tarefas ajustadas'} à regra do Project ao abrir o cronograma.</p>}<label className="mt-3 block text-sm">Motivo da atualização<textarea className="field mt-1" value={reason} onChange={e=>setReason(e.target.value)} required/></label>{error&&<p role="alert" className="my-2 text-sm text-rose-700">{error}</p>}<div className="mt-3 flex gap-2"><button className="button" disabled={busy||!reason.trim()} onClick={save}>{busy?'Salvando…':'Salvar alterações'}</button><button className="button-ghost" disabled={busy} onClick={()=>setReview(false)}>Voltar ao rascunho</button></div></div></dialog>
  </>;
}

/** Coluna de indicadores do Project: ícone e texto, nunca só cor. */
function Indicators({done,constraint,outside,notes}:{done:boolean;constraint?:string;outside:boolean;notes:boolean}) {
  const items=[done&&{Icon:Check,label:'Tarefa concluída',tone:'text-emerald-600'},constraint&&{Icon:CalendarClock,label:`Não iniciar antes de ${projectDate(constraint)}`,tone:'text-blue-700'},outside&&{Icon:CircleAlert,label:'Fora do horizonte de três meses',tone:'text-amber-600'},notes&&{Icon:StickyNote,label:'Tem anotações',tone:'text-slate-500'}].filter(Boolean) as {Icon:typeof Check;label:string;tone:string}[];
  return <span className="flex items-center gap-0.5">{items.map(({Icon,label,tone})=><span key={label} title={label} className={tone}><Icon size={13} aria-hidden/><span className="sr-only">{label}</span></span>)}</span>;
}
