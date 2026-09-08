import { DebtsOverview } from '@/modules/planejamento/debts-overview';
export const metadata={title:'Dívidas de terminalidade'};
export default async function Page({params}:{params:Promise<{obraId:string}>}){const{obraId}=await params;return <DebtsOverview workId={obraId}/>;}
