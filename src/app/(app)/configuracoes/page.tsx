import { SettingsManager } from '@/modules/configuracoes/settings-manager';
export const metadata = { title: 'Configurações' };
export default function ConfiguracoesPage() {
  return <>
    <p className="eyebrow">Administração</p>
    <h1 className="page-title">Configurações</h1>
    <p className="mt-1 text-sm text-slate-500">Takt de cada obra, papéis dos usuários e quem enxerga o quê.</p>
    <div className="mt-8"><SettingsManager /></div>
  </>;
}
