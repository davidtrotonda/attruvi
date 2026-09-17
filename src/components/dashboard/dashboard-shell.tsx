import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { signOutAction } from "@/app/auth/actions";

type DashboardSection = "apps" | "attribution" | "costs" | "links" | "summary" | "users";

export function DashboardShell({
  active,
  appName,
  children,
  displayName,
  organizationName,
}: {
  active: DashboardSection;
  appName?: string | null;
  children: ReactNode;
  displayName: string;
  organizationName: string;
}) {
  return (
    <main className="dashboard-page">
      <header className="protected-header dashboard-header">
        <Link className="protected-brand" href="/">
          <Image alt="" height={34} src="/attruvi-logo.png" width={34} />
          <span>Attruvi</span>
        </Link>
        <div className="dashboard-project-switcher">
          <span>Proyecto</span>
          <strong>{organizationName}</strong>
          {appName ? (
            <>
              <i aria-hidden="true">/</i>
              <span>App</span>
              <strong>{appName}</strong>
            </>
          ) : null}
        </div>
        <div className="protected-header-actions">
          <span>{displayName}</span>
          <form action={signOutAction}>
            <button type="submit">Cerrar sesión</button>
          </form>
        </div>
      </header>

      <div className="dashboard-layout">
        <aside className="dashboard-sidebar">
          <nav aria-label="Panel de Attruvi">
            <Link className={active === "summary" ? "active" : undefined} href="/dashboard">
              <span aria-hidden="true">◫</span>Resumen
            </Link>
            <Link className={active === "apps" ? "active" : undefined} href="/dashboard/apps">
              <span aria-hidden="true">▣</span>Apps
            </Link>
            <Link className={active === "links" ? "active" : undefined} href="/dashboard/links">
              <span aria-hidden="true">↗</span>Enlaces
            </Link>
            <Link
              className={active === "attribution" ? "active" : undefined}
              href="/dashboard/attribution"
            >
              <span aria-hidden="true">⑂</span>Atribución
            </Link>
            <Link className={active === "users" ? "active" : undefined} href="/dashboard/users">
              <span aria-hidden="true">⌁</span>Usuarios
            </Link>
            <Link className={active === "costs" ? "active" : undefined} href="/dashboard/costs">
              <span aria-hidden="true">€</span>Costes
            </Link>
            <span className="dashboard-nav-disabled">
              <span aria-hidden="true">⇄</span>Postbacks <small>Próximamente</small>
            </span>
          </nav>
          <div className="dashboard-sidebar-help">
            <strong>Enlaces sin pantalla intermedia</strong>
            <p>El clic se registra y la persona llega directamente a la app, la tienda o tu web.</p>
            <span>Datos aislados por aplicación</span>
          </div>
        </aside>

        <section className="dashboard-content">{children}</section>
      </div>
    </main>
  );
}
