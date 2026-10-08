'use client';
import { useEffect, useState } from 'react';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';

/** Lateral do desktop, no azul-petróleo da marca (o mesmo do painel de entrada do Takt Hub): é a
 * maior área de cor da tela e separa a navegação do trabalho, que fica no fundo claro. */
export function SidebarWrapper({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    const saved = localStorage.getItem('sidebar-collapsed');
    if (saved === 'true') setCollapsed(true);
  }, []);
  const toggle = () => {
    setCollapsed(c => {
      const next = !c;
      localStorage.setItem('sidebar-collapsed', String(next));
      return next;
    });
  };
  return (
    <aside
      className={`${collapsed ? 'w-14' : 'w-64'} nav-dark relative hidden shrink-0 flex-col overflow-hidden transition-[width] duration-200 md:flex`}
    >
      {collapsed ? (
        <div className="flex flex-col items-center gap-2 pt-4">
          <button
            onClick={toggle}
            title="Expandir menu"
            aria-label="Expandir menu"
            className="rounded-lg p-2 text-brand-200 transition-colors hover:bg-white/10 hover:text-white"
          >
            <PanelLeftOpen size={18} />
          </button>
        </div>
      ) : (
        <div className="nav-scroll flex flex-1 flex-col overflow-y-auto">
          <button
            onClick={toggle}
            title="Recolher menu"
            aria-label="Recolher menu"
            className="absolute top-2.5 right-2 z-10 rounded-lg p-1.5 text-brand-300 transition-colors hover:bg-white/10 hover:text-white"
          >
            <PanelLeftClose size={15} />
          </button>
          {children}
        </div>
      )}
    </aside>
  );
}
