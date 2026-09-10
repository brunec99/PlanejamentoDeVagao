'use client';
import { useEffect, useState } from 'react';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';

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
    <aside className={`${collapsed ? 'w-14' : 'w-64'} hidden shrink-0 flex-col overflow-hidden border-r border-slate-200 bg-white transition-[width] duration-200 md:flex`}>
      {collapsed ? (
        <div className="flex flex-col items-center gap-2 pt-4">
          <button onClick={toggle} title="Expandir menu" className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700">
            <PanelLeftOpen size={18} />
          </button>
        </div>
      ) : (
        <div className="custom-scrollbar flex flex-1 flex-col overflow-y-auto">
          <div className="flex justify-end px-2 pt-2.5">
            <button onClick={toggle} title="Recolher menu" className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700">
              <PanelLeftClose size={15} />
            </button>
          </div>
          {children}
        </div>
      )}
    </aside>
  );
}
