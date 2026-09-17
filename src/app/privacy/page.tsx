import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Privacidad — Attruvi", description: "Borrador técnico de la política de privacidad de Attruvi." };

export default function PrivacyPage() {
  return <main className="legal-page">
    <nav><Link href="/">← Volver a Attruvi</Link></nav>
    <article>
      <p className="legal-draft">BORRADOR TÉCNICO · REQUIERE REVISIÓN JURÍDICA ANTES DE USO COMERCIAL</p>
      <h1>Política inicial de privacidad</h1>
      <p>Última actualización técnica: 17 de septiembre de 2026.</p>
      <h2>Qué es Attruvi</h2>
      <p>Attruvi es software de atribución y analítica para apps React Native. Una organización que lo instala decide las finalidades y actúa como responsable de los datos de su app. Una instancia alojada para terceros deberá identificar aquí al responsable, encargado, país y contacto legal reales.</p>
      <h2>Datos tratados</h2>
      <ul>
        <li>Cuenta del panel: nombre, correo y sesión gestionada por Supabase Auth.</li>
        <li>Medición: UUID persistentes por app e instalación, eventos permitidos, sesiones, compras, suscripciones, importes y moneda.</li>
        <li>Atribución: UTMs, campaña/grupo/anuncio y, cuando existen, identificadores admitidos por Google, Meta o TikTok.</li>
        <li>Seguridad: hashes salados y de duración limitada de prefijo de red y agente de usuario; no se conservan ambos valores en claro.</li>
        <li>Operación: estado de integraciones, costes, postbacks, errores redactados y auditoría administrativa.</li>
      </ul>
      <p>Un UUID persistente es un <strong>seudónimo</strong> dentro de una app; no es anonimato irreversible. El SDK bloquea correos, teléfonos y claves sensibles en propiedades, pero cada integrador debe configurar su allowlist y no enviar PII.</p>
      <h2>Finalidades y consentimiento</h2>
      <p>Analítica, atribución, publicidad y personalización son flags separados. Enviar una conversión a una red exige que la finalidad publicitaria esté habilitada además de la atribución. Attruvi no autoriza fingerprinting oculto ni convierte una coincidencia probabilística en determinista.</p>
      <h2>Conservación</h2>
      <p>Los valores iniciales son 90 días para identificadores de clic, 400 días para propiedades de eventos, 7 días para debugger, 90 días para detalles de postback y 730 días para auditoría. Un administrador puede reducirlos. Al vencer, se eliminan payloads e identificadores y se conservan hechos agregados o contables cuando proceda.</p>
      <h2>Destinatarios y transferencias</h2>
      <p>Según el despliegue pueden intervenir Supabase, Vercel, Cloudflare y las redes conectadas por la organización. Cada operador debe completar su lista real de subencargados, regiones, contratos y transferencias internacionales.</p>
      <h2>Derechos y borrado</h2>
      <p>El panel permite exportar datos de una app o perfil seudónimo y borrar/seudonimizar un perfil. La organización debe ofrecer el canal legal real para acceso, rectificación, oposición, portabilidad y supresión. Los incidentes técnicos se comunican mediante el proceso privado de <Link href="https://github.com/davidtrotonda/attruvi/security">seguridad del repositorio</Link>.</p>
    </article>
  </main>;
}
