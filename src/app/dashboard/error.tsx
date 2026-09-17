"use client";

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <section className="dashboard-state dashboard-state-error" role="alert">
      <span aria-hidden="true">!</span>
      <h1>No hemos podido cargar estos datos</h1>
      <p>{error.message || "Ha ocurrido un error temporal. Tus datos siguen a salvo."}</p>
      <button onClick={reset} type="button">Volver a intentarlo</button>
    </section>
  );
}
