import { mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const packageRoot = resolve(import.meta.dirname, "..");
const output = resolve(packageRoot, ".artifacts");
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });

const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error("npm_execpath no está disponible");
const result = spawnSync(process.execPath, [npmCli, "pack", "--json", "--ignore-scripts", "--pack-destination", output], {
  cwd: packageRoot,
  encoding: "utf8",
});
if (result.status !== 0) {
  if (result.error) throw result.error;
  process.stderr.write(result.stderr ?? "npm pack falló sin salida");
  process.exit(result.status ?? 1);
}

const metadata = JSON.parse(result.stdout)[0];
const files = new Set(metadata.files.map((file) => file.path));
for (const required of [
  "package.json",
  "dist/index.js",
  "dist/index.d.ts",
  "dist/index.native.js",
  "android/build.gradle",
  "ios/AttruviNative.swift",
  "AttruviReactNative.podspec",
  "react-native.config.cjs",
]) {
  if (!files.has(required)) throw new Error(`El paquete no contiene ${required}`);
}

process.stdout.write(`${resolve(output, metadata.filename)}\n`);
