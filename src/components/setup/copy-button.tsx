"use client";

import { useState } from "react";

export function CopyButton({ label = "Copiar", text }: { label?: string; text: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_800);
  }
  return <button className="setup-copy-button" onClick={copy} type="button">{copied ? "Copiado ✓" : label}</button>;
}
