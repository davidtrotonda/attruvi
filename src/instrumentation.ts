import { validateServerEnvironment } from "@/lib/env/validation";

export function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const result = validateServerEnvironment(process.env);
    for (const warning of result.warnings) console.warn(`[environment] ${warning}`);
  }
}
