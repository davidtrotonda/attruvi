"use client";

import Link from "next/link";
import { useState } from "react";
import { formatDecimalMoney, formatMoneyMinor, formatPercent, formatRatio } from "@/lib/dashboard/format";

export type CampaignDisplayRow = {
  buyers: number;
  cac_minor: number | string | null;
  cpi_minor: number | string | null;
  displayName: string;
  installs: number;
  key: string;
  observed_ltv_lifetime_minor: number | string | null;
  retention_d1: number | string | null;
  retention_d30: number | string | null;
  retention_d7: number | string | null;
  revenue_minor: number | string;
  roas: number | string | null;
  sourceKind: string;
  source_name: string | null;
  spend_minor: number | string;
};

const headings = [
  ["spend_minor", "Gasto"], ["installs", "Instalaciones"], ["cpi_minor", "CPI"],
  ["buyers", "Compradores"], ["cac_minor", "CAC"], ["revenue_minor", "Ingresos"],
  ["roas", "ROAS"], ["retention_d7", "Retención D7"], ["observed_ltv_lifetime_minor", "LTV"],
] as const;

export function CampaignTable({ currency, rows, sortLinks, status }: {
  currency: string;
  rows: CampaignDisplayRow[];
  sortLinks: Record<string, string>;
  status: "complete" | "partial" | "syncing" | "without_costs";
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const compared = rows.filter((row) => selected.includes(row.key));
  function toggle(key: string) {
    setSelected((current) => current.includes(key) ? current.filter((item) => item !== key) : current.length < 4 ? [...current, key] : current);
  }
  const statusLabel = { complete: "Completo", partial: "Parcial", syncing: "Sincronizando", without_costs: "Sin costes" };

  return <>
    {compared.length > 0 ? <section aria-label="Comparación seleccionada" className="campaign-comparison">
      <header><div><span>COMPARACIÓN</span><h2>{compared.length} elemento{compared.length === 1 ? "" : "s"} seleccionado{compared.length === 1 ? "" : "s"}</h2></div><button onClick={() => setSelected([])} type="button">Limpiar</button></header>
      <div>{compared.map((row) => <article key={row.key}><strong>{row.displayName}</strong><dl><div><dt>ROAS</dt><dd>{formatRatio(row.roas)}</dd></div><div><dt>CAC</dt><dd>{formatDecimalMoney(row.cac_minor, currency)}</dd></div><div><dt>Ingresos</dt><dd>{formatMoneyMinor(row.revenue_minor, currency)}</dd></div><div><dt>LTV</dt><dd>{formatDecimalMoney(row.observed_ltv_lifetime_minor, currency)}</dd></div></dl></article>)}</div>
    </section> : null}

    <div className="dashboard-table-scroll campaign-table-scroll"><table className="campaign-table"><thead><tr>
      <th><span className="sr-only">Comparar</span></th><th><Link href={sortLinks.name}>Elemento</Link></th>
      {headings.map(([key, label]) => <th key={key}><Link href={sortLinks[key]}>{label}</Link></th>)}<th>Estado</th><th><span className="sr-only">Detalle</span></th>
    </tr></thead><tbody>
      {rows.map((row) => {
        const rowStatus = Number(row.spend_minor) === 0 && row.installs > 0 ? "without_costs" : status;
        return <tr key={row.key}>
          <td><input aria-label={`Comparar ${row.displayName}`} checked={selected.includes(row.key)} onChange={() => toggle(row.key)} type="checkbox" /></td>
          <td><span className={`source-dot source-dot-${row.sourceKind}`} aria-hidden="true" /><span><strong>{row.displayName}</strong><small>{row.source_name ?? "Sin fuente"}</small></span></td>
          <td>{formatMoneyMinor(row.spend_minor, currency)}</td><td>{row.installs.toLocaleString("es-ES")}</td><td>{formatDecimalMoney(row.cpi_minor, currency)}</td><td>{row.buyers.toLocaleString("es-ES")}</td><td>{formatDecimalMoney(row.cac_minor, currency)}</td><td>{formatMoneyMinor(row.revenue_minor, currency)}</td><td><strong>{formatRatio(row.roas)}</strong></td><td>{formatPercent(row.retention_d7)}</td><td>{formatDecimalMoney(row.observed_ltv_lifetime_minor, currency)}</td>
          <td><span className={`data-status data-status-${rowStatus}`}><i />{statusLabel[rowStatus]}</span></td>
          <td><details className="campaign-row-detail"><summary aria-label={`Abrir detalle de ${row.displayName}`}>Ver</summary><div><strong>{row.displayName}</strong><dl><div><dt>Gasto</dt><dd>{formatMoneyMinor(row.spend_minor, currency)}</dd></div><div><dt>Instalaciones</dt><dd>{row.installs}</dd></div><div><dt>Compradores</dt><dd>{row.buyers}</dd></div><div><dt>Ingresos</dt><dd>{formatMoneyMinor(row.revenue_minor, currency)}</dd></div><div><dt>ROAS</dt><dd>{formatRatio(row.roas)}</dd></div><div><dt>Retención</dt><dd>D1 {formatPercent(row.retention_d1)} · D7 {formatPercent(row.retention_d7)} · D30 {formatPercent(row.retention_d30)}</dd></div><div><dt>LTV observado</dt><dd>{formatDecimalMoney(row.observed_ltv_lifetime_minor, currency)}</dd></div></dl></div></details></td>
        </tr>;
      })}
    </tbody></table></div>
  </>;
}
