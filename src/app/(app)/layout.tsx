import { PlanningProvider } from '@/modules/planejamento/planning-provider';
export default function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <PlanningProvider>{children}</PlanningProvider>;
}
