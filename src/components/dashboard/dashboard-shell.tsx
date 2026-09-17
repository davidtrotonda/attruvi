"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { signOutAction } from "@/app/auth/actions";
import type { DashboardAppOption } from "@/lib/data/dashboard-context";
import { dashboardNavigation } from "@/lib/dashboard/navigation";

const storageKey = "attruvi.dashboard.selection.v1";

function selectedOption(apps: DashboardAppOption[], appSlug: string | null, workspace: string | null) {
  return apps.find((app) => (app.slug === appSlug || app.id === appSlug) && (!workspace || app.organizationSlug === workspace)) ??
    apps.find((app) => app.status === "active") ?? apps[0] ?? null;
}

export function DashboardShell({ apps, children, displayName }: {
  apps: DashboardAppOption[];
  children: ReactNode;
  displayName: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const appSlug = searchParams.get("app");
  const workspace = searchParams.get("workspace");
  const environment = searchParams.get("environment") ?? "production";
  const selected = selectedOption(apps, appSlug, workspace);

  useEffect(() => {
    if (appSlug || typeof window === "undefined") return;
    try {
      const stored = JSON.parse(window.localStorage.getItem(storageKey) ?? "null") as {
        app?: string; environment?: string; workspace?: string;
      } | null;
      const storedApp = apps.find((app) => app.slug === stored?.app && app.organizationSlug === stored?.workspace);
      if (!storedApp) return;
      const params = new URLSearchParams(searchParams.toString());
      params.set("app", storedApp.slug);
      params.set("workspace", storedApp.organizationSlug);
      if (stored?.environment) params.set("environment", stored.environment);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    } catch {
      window.localStorage.removeItem(storageKey);
    }
  }, [appSlug, apps, pathname, router, searchParams]);

  function persist(nextApp: DashboardAppOption | null, nextEnvironment: string) {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(storageKey, JSON.stringify({
      app: nextApp?.slug, environment: nextEnvironment, workspace: nextApp?.organizationSlug,
    }));
  }

  function replaceSelection(nextApp: DashboardAppOption | null, nextEnvironment: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (nextApp) {
      params.set("app", nextApp.slug);
      params.set("workspace", nextApp.organizationSlug);
    }
    params.set("environment", nextEnvironment);
    for (const transient of ["page", "user", "detail", "edit", "new", "saved"]) params.delete(transient);
    persist(nextApp, nextEnvironment);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function navigationHref(href: string) {
    const params = new URLSearchParams();
    if (selected) {
      params.set("app", selected.slug);
      params.set("workspace", selected.organizationSlug);
    }
    params.set("environment", environment);
    return `${href}?${params.toString()}`;
  }

  function isActive(href: string) {
    return href === "/dashboard" ? pathname === href : pathname.startsWith(href);
  }

  const navigationLinks = dashboardNavigation.map((item) => (
    <Link className={isActive(item.href) ? "active" : undefined} href={navigationHref(item.href)} key={item.href}>
      <span aria-hidden="true">{item.icon}</span>{item.label}
    </Link>
  ));

  return (
    <main className="dashboard-page">
      <header className="protected-header dashboard-header">
        <Link className="protected-brand" href="/">
          <Image alt="" height={34} src="/attruvi-logo.png" width={34} /><span>Attruvi</span>
        </Link>
        <div className="dashboard-selectors" aria-label="Contexto del panel">
          <label><span className="sr-only">Aplicación</span><select
            aria-label="Aplicación"
            onChange={(event) => {
              const next = apps.find((app) => `${app.organizationSlug}::${app.slug}` === event.target.value) ?? null;
              replaceSelection(next, environment);
            }}
            value={selected ? `${selected.organizationSlug}::${selected.slug}` : ""}
          >
            {apps.map((app) => <option key={`${app.organizationSlug}/${app.slug}`} value={`${app.organizationSlug}::${app.slug}`}>
              {apps.some((candidate) => candidate.organizationId !== app.organizationId) ? `${app.organizationName} · ${app.name}` : app.name}
            </option>)}
          </select></label>
          <label><span className="sr-only">Entorno</span><select aria-label="Entorno" onChange={(event) => replaceSelection(selected, event.target.value)} value={environment}>
            <option value="production">Producción</option><option value="staging">Staging</option><option value="development">Desarrollo</option>
          </select></label>
        </div>
        <div className="protected-header-actions"><span>{displayName}</span><form action={signOutAction}><button type="submit">Cerrar sesión</button></form></div>
      </header>
      <nav aria-label="Panel de Attruvi en móvil" className="dashboard-mobile-nav">{navigationLinks}</nav>
      <div className="dashboard-layout">
        <aside className="dashboard-sidebar">
          <nav aria-label="Panel de Attruvi">{navigationLinks}</nav>
          <div className="dashboard-sidebar-help">
            <strong>{selected?.organizationName ?? "Tu proyecto"}</strong>
            <p>{selected ? `${selected.name} · ${selected.currency} · ${selected.timezone}` : "Completa el onboarding para añadir tu primera app."}</p>
            <span>{selected?.role === "viewer" ? "Acceso de solo lectura" : "Datos aislados por organización"}</span>
          </div>
        </aside>
        <section className="dashboard-content">{children}</section>
      </div>
    </main>
  );
}
