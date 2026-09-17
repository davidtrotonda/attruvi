import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { signOutAction } from "@/app/auth/actions";
import { OnboardingForm } from "@/components/onboarding/onboarding-form";
import { requireVerifiedIdentity } from "@/lib/auth/session";
import { getWorkspace } from "@/lib/data/workspace";

export default async function OnboardingPage() {
  const identity = await requireVerifiedIdentity();
  const workspace = await getWorkspace(identity);
  if (workspace.isComplete) redirect("/dashboard");

  return (
    <main className="onboarding-page grid-surface">
      <header className="protected-header">
        <Link className="protected-brand" href="/">
          <Image alt="" height={34} src="/attruvi-logo.png" width={34} />
          <span>Attruvi</span>
        </Link>
        <div className="protected-header-actions">
          <span>{identity.email}</span>
          <form action={signOutAction}>
            <button type="submit">Cerrar sesión</button>
          </form>
        </div>
      </header>
      <section className="onboarding-container">
        <div className="onboarding-intro">
          <p className="auth-kicker">CONFIGURACIÓN INICIAL · 3 MINUTOS</p>
          <h1>Prepara tu primera app.</h1>
          <p>
            No necesitas conectar Google Ads, Meta Ads ni TikTok Ads todavía.
            Primero crearemos el espacio donde llegarán tus datos.
          </p>
          <div className="onboarding-progress" aria-label="Tres apartados">
            <i /><i /><i />
          </div>
        </div>
        <OnboardingForm draft={workspace.draft} />
        <p className="onboarding-privacy">
          Attruvi no guarda secretos en el navegador ni comparte tus datos con otras organizaciones.
        </p>
      </section>
    </main>
  );
}
