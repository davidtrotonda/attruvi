"use client";

import { useRouter } from "next/navigation";
import { useEffect, useTransition, type ReactNode } from "react";

export function LiveDebugger({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  useEffect(() => {
    const interval = window.setInterval(() => startTransition(() => router.refresh()), 3_500);
    return () => window.clearInterval(interval);
  }, [router]);
  return <section className="setup-debugger" aria-live="polite" aria-busy={pending}>
    <header><div><span className="setup-live-dot" aria-hidden="true" /><div><strong>Debugger en vivo</strong><small>Development · datos anonimizados · actualización cada 3,5 s</small></div></div><button onClick={() => startTransition(() => router.refresh())} type="button">{pending ? "Actualizando…" : "Actualizar"}</button></header>
    {children}
  </section>;
}
