import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Términos — Attruvi", description: "Borrador técnico de términos de uso de Attruvi." };

export default function TermsPage() {
  return <main className="legal-page">
    <nav><Link href="/">← Volver a Attruvi</Link></nav>
    <article>
      <p className="legal-draft">BORRADOR TÉCNICO · REQUIERE REVISIÓN JURÍDICA ANTES DE USO COMERCIAL</p>
      <h1>Términos iniciales de uso</h1>
      <p>Attruvi se publica bajo licencia MIT y está en fase previa a producción. No ofrece todavía un SLA, garantía de disponibilidad ni garantía de atribución exacta.</p>
      <h2>Uso permitido</h2>
      <p>Debes contar con base legal, avisos y consentimientos aplicables; respetar ATT, Privacy Sandbox y políticas de cada red; y enviar únicamente datos necesarios. Quedan prohibidos el fingerprinting oculto, la suplantación de conversiones, el acceso a otras organizaciones y el uso de PII en campos no diseñados para ello.</p>
      <h2>Exactitud</h2>
      <p>La disponibilidad de señales depende del sistema operativo, tienda y red. iOS sin señal oficial no se presenta como determinista. Las desinstalaciones son inferencias cuando existe evidencia válida. Los ingresos declarados por el SDK no son verificados hasta conectar una fuente oficial.</p>
      <h2>Responsabilidad del operador</h2>
      <p>Quien despliega Attruvi es responsable de asegurar su infraestructura, configurar retención, gestionar solicitudes de derechos, mantener secretos fuera del cliente y validar textos legales con asesoramiento profesional.</p>
      <h2>Software sin garantía</h2>
      <p>Se aplican las exclusiones de la licencia MIT. Antes de ofrecer un servicio comercial deberán añadirse identificación del proveedor, ley aplicable, soporte, límites de responsabilidad y condiciones económicas reales.</p>
    </article>
  </main>;
}
