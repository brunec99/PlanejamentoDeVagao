import { SettingsManager } from '@/modules/configuracoes/settings-manager';
import { HelpNote } from '@/modules/layout/help-note';
export const metadata = { title: 'Configurações' };
export default function ConfiguracoesPage() {
  return (
    <>
      <p className="eyebrow">Administração</p>
      <h1 className="page-title">Configurações</h1>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
        <p className="text-sm text-slate-500">Takt de cada obra, papéis e acessos dos usuários e o estado do banco.</p>
        <HelpNote title="Como funciona: configurações" compact>
          <p>
            <strong>Takt por obra</strong> define a duração padrão de cada vagão por sequência e, enquanto o primeiro vagão não é liberado,
            a data em que ele começa.
          </p>
          <p>
            <strong>Usuários e acessos</strong>: o convite cria o perfil com o papel escolhido; o acesso a cada obra é liberado nos chips
            abaixo do nome. Quem é Admin herda o que o Gestor pode.
          </p>
          <p>
            <strong>Banco de dados</strong> lista as migrações conhecidas e pergunta ao banco quais já estão aplicadas. As críticas fazem
            parte da leitura do planejamento: sem elas nenhuma tela carrega. As opcionais desligam só a funcionalidade correspondente.
          </p>
        </HelpNote>
      </div>
      <div className="mt-8">
        <SettingsManager />
      </div>
    </>
  );
}
