import { existsSync } from "node:fs";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Load a `.env` file into process.env for local configuration (AI provider,
 * model, etc.). Real environment variables always win over the file, matching
 * standard dotenv precedence — so `HUNT_AI_MODEL=x hunt ...` overrides `.env`.
 *
 * We parse the file ourselves rather than using Node's `process.loadEnvFile`
 * because that built-in overrides already-set variables, which we don't want.
 *
 * Lookup order: the path in HUNT_ENV_FILE (if set), otherwise `.env` in the
 * current working directory. A missing file is not an error — `.env` is
 * optional.
 */
export function loadEnvFile(
  cwd: string = process.cwd(),
  env: NodeJS.ProcessEnv = process.env,
): void {
  const path = env.HUNT_ENV_FILE ? resolve(env.HUNT_ENV_FILE) : resolve(cwd, ".env");
  if (!existsSync(path)) return;

  let content: string;
  try {
    content = readFileSync(path, "utf8");
  } catch {
    return; // unreadable .env is treated as absent, not fatal
  }

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;

    const eq = line.indexOf("=");
    if (eq === -1) continue;

    const key = line.slice(0, eq).trim();
    if (key === "") continue;

    let value = line.slice(eq + 1).trim();
    // Strip a single layer of matching surrounding quotes.
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }

    // Real environment wins — only set what isn't already defined.
    if (env[key] === undefined) env[key] = value;
  }
}
