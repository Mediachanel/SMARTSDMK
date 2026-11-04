import fs from "node:fs";

export function loadEnvFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return false;
  const content = fs.readFileSync(filePath, "utf8");

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;

    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = rawValue.trim().replace(/^['"]|['"]$/g, "");
  }

  return true;
}

export function loadDefaultEnv(explicitPath = process.argv[2]) {
  if (explicitPath) return loadEnvFile(explicitPath);

  for (const filePath of [".env.local", ".env"]) {
    if (loadEnvFile(filePath)) return true;
  }

  return false;
}
