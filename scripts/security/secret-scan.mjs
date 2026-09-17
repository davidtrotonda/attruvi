import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const args = new Set(process.argv.slice(2));
const scanHistory = !args.has("--working-tree-only");
const jsonOutput = args.has("--json");

const safeMarkers = [
  "example.com",
  "example.invalid",
  "replace_me",
  "replace-with",
  "replace_with",
  "your-project",
  "your_",
  "test-only",
  "fixture",
  "dummy",
  "fake",
  "placeholder",
];

const patterns = [
  {
    type: "private_key",
    severity: "critical",
    expression: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g,
    action: "Revocar la clave, eliminarla del historial y cargar su sustituta desde el gestor de secretos.",
  },
  {
    type: "supabase_secret_key",
    severity: "critical",
    expression: /\bsb_secret_[A-Za-z0-9_-]{20,}\b/g,
    action: "Rotar la clave secreta en Supabase y guardarla solo como secreto del servidor.",
  },
  {
    type: "provider_access_token",
    severity: "critical",
    expression: /\b(?:gh[opusr]_[A-Za-z0-9]{24,}|github_pat_[A-Za-z0-9_]{40,}|sk_live_[A-Za-z0-9]{20,})\b/g,
    action: "Revocar el token en el proveedor y sustituirlo por un secreto de despliegue.",
  },
  {
    type: "jwt_or_legacy_service_key",
    severity: "high",
    expression: /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/g,
    action: "Rotar el JWT y reemplazarlo por una variable de entorno de servidor.",
  },
  {
    type: "oauth_client_secret",
    severity: "high",
    expression: /\bGOCSPX-[A-Za-z0-9_-]{20,}\b/g,
    action: "Rotar el secreto OAuth y almacenarlo fuera del repositorio.",
  },
  {
    type: "cloud_account_identifier",
    severity: "medium",
    expression: /\b[a-f0-9]{32}\b/gi,
    action: "Sustituir el identificador de infraestructura por un placeholder si no es imprescindible que sea público.",
  },
  {
    type: "hosted_project_domain",
    severity: "medium",
    expression: /https?:\/\/[a-z0-9-]{12,}\.(?:supabase\.co|workers\.dev|vercel\.app)\b/gi,
    action: "Usar un dominio ficticio en ejemplos y una variable de entorno en ejecución.",
  },
  {
    type: "personal_email",
    severity: "medium",
    expression: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    action: "Sustituir el correo por uno de example.invalid o por un canal público de seguridad.",
  },
];

const ignoredExtensions = /\.(?:png|jpe?g|gif|webp|ico|woff2?|ttf|eot|zip|gz|map|lock)$/i;
const allowedEmailDomains = new Set(["example.com", "example.org", "example.net", "example.invalid", "users.noreply.github.com"]);

function command(command, commandArgs) {
  return execFileSync(command, commandArgs, {
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    windowsHide: true,
  });
}

function looksFictitious(line) {
  const normalized = line.toLowerCase();
  return safeMarkers.some((marker) => normalized.includes(marker)) || /<[^>]+>/.test(line);
}

function allowedMatch(type, match) {
  if (type !== "personal_email") return false;
  const [local, domain] = match.toLowerCase().split("@");
  return Boolean(
    domain &&
      (allowedEmailDomains.has(domain) ||
        domain.endsWith(".test") ||
        domain.endsWith(".local") ||
        domain.endsWith(".invalid") ||
        /^(?:security|privacy|opensource|support|hello|admin)$/.test(local ?? "")),
  );
}

const findings = [];
const seen = new Set();

function ignoredFile(file) {
  return ignoredExtensions.test(file) || file.endsWith("package-lock.json") || file.endsWith("worker-configuration.d.ts");
}

function scanLine(line, location, scope) {
  if (looksFictitious(line)) return;
  for (const pattern of patterns) {
    pattern.expression.lastIndex = 0;
    for (const match of line.matchAll(pattern.expression)) {
      if (allowedMatch(pattern.type, match[0])) continue;
      const key = `${pattern.type}|${scope}|${location}`;
      if (seen.has(key)) continue;
      seen.add(key);
      findings.push({
        action: pattern.action,
        location,
        scope,
        severity: pattern.severity,
        type: pattern.type,
      });
    }
  }
}

const trackedFiles = command("git", ["ls-files", "-z"]).split("\0").filter(Boolean);
for (const file of trackedFiles) {
  if (
    ignoredFile(file) ||
    file.includes("node_modules/") ||
    file.includes("node_modules\\")
  ) continue;
  let content;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  if (content.includes("\0")) continue;
  content.split(/\r?\n/).forEach((line, index) => scanLine(line, `${file}:${index + 1}`, "working_tree"));
}

if (scanHistory) {
  const patch = command("git", ["log", "--all", "--format=", "--no-ext-diff", "--no-color", "--unified=0", "--patch"]);
  let file = "unknown";
  for (const line of patch.split(/\r?\n/)) {
    if (line.startsWith("+++ b/")) {
      file = line.slice(6);
      continue;
    }
    if (ignoredFile(file)) continue;
    if (!line.startsWith("+") || line.startsWith("+++")) continue;
    scanLine(line.slice(1), file, "git_history");
  }
}

findings.sort((left, right) =>
  `${left.severity}|${left.type}|${left.location}`.localeCompare(`${right.severity}|${right.type}|${right.location}`),
);

if (jsonOutput) {
  process.stdout.write(`${JSON.stringify({ findings }, null, 2)}\n`);
} else if (findings.length === 0) {
  process.stdout.write("Secret scan: no se detectaron valores sensibles no ficticios.\n");
} else {
  process.stdout.write(`Secret scan: ${findings.length} hallazgo(s) redactado(s).\n`);
  for (const finding of findings) {
    process.stdout.write(
      `${finding.severity} | ${finding.type} | ${finding.scope} | ${finding.location} | ${finding.action}\n`,
    );
  }
}

if (findings.some((finding) => finding.severity === "critical" || finding.severity === "high")) {
  process.exitCode = 1;
}
