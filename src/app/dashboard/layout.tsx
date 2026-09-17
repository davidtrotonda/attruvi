import { Suspense, type ReactNode } from "react";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { requireVerifiedIdentity } from "@/lib/auth/session";
import { getDashboardNavigation } from "@/lib/data/dashboard-context";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const identity = await requireVerifiedIdentity();
  const navigation = await getDashboardNavigation(identity);
  return (
    <Suspense fallback={<main className="dashboard-loading" aria-label="Cargando el panel"><div /><div /><div /><div /></main>}>
      <DashboardShell apps={navigation.apps} displayName={identity.displayName}>{children}</DashboardShell>
    </Suspense>
  );
}
