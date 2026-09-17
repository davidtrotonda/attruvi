import Link from "next/link";
import { requireVerifiedIdentity } from "@/lib/auth/session";
import { getAttributionManagement } from "@/lib/data/attribution";

const methodLabels: Record<string, string> = {
  direct_link: "Click directo",
  install_referrer: "Play Install Referrer",
  manual: "Corrección manual",
  network_signal: "Señal oficial de red",
  organic: "Orgánico / sin evidencia",
  probabilistic: "Coincidencia limitada",
};

function shortId(value: string) {
  return `${value.slice(0, 8)}…${value.slice(-4)}`;
}

function percentage(value: number) {
  return `${Math.round(value * 100)} %`;
}

function dateTime(value: string) {
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default async function AttributionPage({
  searchParams,
}: {
  searchParams: Promise<{ app?: string; environment?: string; workspace?: string }>;
}) {
  const identity = await requireVerifiedIdentity();
  const params = await searchParams;
  const management = await getAttributionManagement(identity, params.app, params.workspace);

  return (
    <>
      <div className="management-heading">
        <div>
          <p className="dashboard-eyebrow">ATRIBUCIÓN EXPLICABLE</p>
          <h1>Por qué atribuimos cada usuario</h1>
          <p>
            Consulta la señal que ganó, las alternativas evaluadas y la confianza real. En iOS nunca
            llamamos determinista a una coincidencia sin una señal permitida.
          </p>
        </div>
      </div>

      {management.apps.length > 0 ? (
        <nav aria-label="Selecciona una aplicación" className="app-tabs">
          {management.apps.map((app) => (
            <Link
              className={app.id === management.selectedApp?.id ? "active" : undefined}
              href={`/dashboard/acquisition?workspace=${encodeURIComponent(management.organization.slug)}&app=${encodeURIComponent(app.slug)}&environment=${encodeURIComponent(params.environment ?? "production")}`}
              key={app.id}
            >
              {app.name}
            </Link>
          ))}
        </nav>
      ) : null}

      {!management.selectedApp ? (
        <div className="management-empty">
          <span aria-hidden="true">▣</span>
          <h2>Primero añade una app</h2>
          <p>Attruvi necesita una aplicación para separar sus instalaciones y reglas.</p>
          <Link className="management-primary-link" href="/dashboard/apps?new=1">
            Añadir app
          </Link>
        </div>
      ) : (
        <>
          <section className="attribution-rule-summary">
            <div>
              <span>Regla activa</span>
              <strong>{management.rule?.version ?? "Sin configurar"}</strong>
              <small>Último clic no orgánico</small>
            </div>
            <div>
              <span>Adquisición</span>
              <strong>{management.rule?.acquisition_window_days ?? 7} días</strong>
              <small>Ventana máxima</small>
            </div>
            <div>
              <span>Reactivación</span>
              <strong>{management.rule?.reengagement_window_hours ?? 24} h</strong>
              <small>Se calcula por sesión</small>
            </div>
            <div>
              <span>Probabilística</span>
              <strong>{management.rule?.probabilistic_enabled ? "Activada" : "Desactivada"}</strong>
              <small>
                {management.rule?.probabilistic_enabled
                  ? `${management.rule.probabilistic_window_minutes} min, con consentimiento`
                  : "Estado recomendado"}
              </small>
            </div>
          </section>

          {management.decisions.length > 0 ? (
            <div className="attribution-decision-list">
              {management.decisions.map((decision) => (
                <article className="attribution-decision-card" key={decision.id}>
                  <header>
                    <div>
                      <span className={`attribution-method method-${decision.match_type}`}>
                        {methodLabels[decision.match_type] ?? decision.match_type}
                      </span>
                      <span className="attribution-scope">
                        {decision.scope === "acquisition" ? "Adquisición" : "Reactivación"}
                      </span>
                    </div>
                    <time>{dateTime(decision.attributed_at)}</time>
                  </header>

                  <div className="attribution-decision-main">
                    <div>
                      <span>Instalación</span>
                      <strong>{shortId(decision.installation_id)}</strong>
                      <small>
                        {decision.installation?.platform === "ios" ? "iOS" : "Android"}
                      </small>
                    </div>
                    <div>
                      <span>Origen ganador</span>
                      <strong>{decision.source_name ?? "Orgánico"}</strong>
                      <small>
                        {[decision.campaign_name, decision.ad_group_name, decision.ad_name]
                          .filter(Boolean)
                          .join(" → ") || "Sin campaña asociada"}
                      </small>
                    </div>
                    <div>
                      <span>Confianza</span>
                      <strong>{percentage(decision.confidence)}</strong>
                      <small>
                        {decision.match_type === "probabilistic" || decision.match_type === "organic"
                          ? "No determinista"
                          : "Evidencia determinista"}
                      </small>
                    </div>
                  </div>

                  <div className="attribution-explanation">
                    <strong>Por qué ganó</strong>
                    <p>{decision.decision_reason}</p>
                    <span>Regla {decision.rule_version}</span>
                  </div>

                  <details className="attribution-candidates">
                    <summary>
                      Ver {decision.candidates.length} candidato
                      {decision.candidates.length === 1 ? "" : "s"} evaluado
                      {decision.candidates.length === 1 ? "" : "s"}
                    </summary>
                    <ol>
                      {decision.candidates.map((candidate) => (
                        <li className={candidate.is_winner ? "winner" : undefined} key={candidate.id}>
                          <span>{candidate.is_winner ? "Ganador" : `Puntuación ${candidate.score}`}</span>
                          <strong>{methodLabels[candidate.match_type] ?? candidate.match_type}</strong>
                          <p>{candidate.decision_reason}</p>
                          <small>Confianza {percentage(candidate.confidence)}</small>
                        </li>
                      ))}
                    </ol>
                  </details>
                </article>
              ))}
            </div>
          ) : (
            <div className="management-empty">
              <span aria-hidden="true">⑂</span>
              <h2>Aún no hay atribuciones</h2>
              <p>
                Cuando llegue la primera instalación, aquí verás la señal ganadora, su confianza y
                todos los candidatos evaluados.
              </p>
              <Link className="management-primary-link" href="/dashboard/links">
                Crear un enlace
              </Link>
            </div>
          )}
        </>
      )}
    </>
  );
}
