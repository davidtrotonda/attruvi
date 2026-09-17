import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { getVerifiedIdentity } from "@/lib/auth/session";

export default async function ResetPasswordPage() {
  const identity = await getVerifiedIdentity();
  if (!identity) redirect("/?auth=recovery-required");

  return (
    <main className="auth-page grid-surface">
      <Link className="auth-page-brand" href="/">
        <Image alt="" height={34} src="/attruvi-logo.png" width={34} />
        <span>Attruvi</span>
      </Link>
      <section className="auth-page-card">
        <ResetPasswordForm />
      </section>
    </main>
  );
}
