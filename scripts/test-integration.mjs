import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { once } from "node:events";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
await mkdir(resolve(root, ".wrangler"), { recursive: true });
const temporary = await mkdtemp(resolve(root, ".wrangler/integration-"));
const statePath = resolve(temporary, "state");
const configPath = resolve(temporary, "wrangler.json");
const adminSecret = randomBytes(24).toString("hex");
const config = JSON.parse(await readFile(resolve(root, "wrangler.jsonc"), "utf8"));
config.main = resolve(root, "worker/index.ts");
config.assets.directory = resolve(root, "dist/client");
config.d1_databases[0].migrations_dir = resolve(root, "drizzle");
config.vars = { ORGANIZER_SECRET: adminSecret, PLAYER_AUTH_SECRET: randomBytes(32).toString("hex"), OPENAI_API_KEY: "" };
await writeFile(configPath, JSON.stringify(config), { mode: 0o600 });
const env = { ...process.env, PIFPAF_CONFIG: configPath, PIFPAF_TEST_STATE: statePath, WRANGLER_SEND_METRICS: "false", WRANGLER_LOG_PATH: resolve(temporary, "wrangler.log") };
async function command(args, extraEnv = {}) {
  const child = spawn(process.execPath, args, { cwd: root, env: { ...env, ...extraEnv }, stdio: "inherit" });
  const [code] = await once(child, "exit");
  if (code !== 0) throw new Error(`Command failed: ${args[0]} (${code})`);
}
let server;
let succeeded = false;
try {
  await command(["node_modules/wrangler/bin/wrangler.js", "d1", "migrations", "apply", "DB", "--local", "--persist-to", statePath, "--config", configPath]);
  const port = 4317;
  const host = "127.0.0.1";
  const url = `http://${host}:${port}`;
  server = spawn(process.execPath, ["node_modules/vinext/dist/cli.js", "dev", "--hostname", host, "--port", String(port)], { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
  let serverLog = "";
  server.stdout.on("data", (data) => { serverLog = (serverLog + data).slice(-12_000); });
  server.stderr.on("data", (data) => { serverLog = (serverLog + data).slice(-12_000); });
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw new Error(`Test server exited:\n${serverLog}`);
    try { const response = await fetch(`${url}/api/state`); if (response.ok) { ready = true; break; } } catch { /* Server is starting. */ }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  if (!ready) throw new Error(`Test server did not become ready:\n${serverLog}`);
  await command(["--test", "tests/api.integration.mjs"], { TEST_BASE_URL: url, TEST_ADMIN_SECRET: adminSecret });
  succeeded = true;
} finally {
  if (server && server.exitCode === null) { server.kill("SIGTERM"); await once(server, "exit"); }
  if (succeeded) await rm(temporary, { recursive: true, force: true });
  else console.error("Integration diagnostics retained under .wrangler/ (ignored by Git).");
}
