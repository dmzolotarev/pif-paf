import { spawn } from "node:child_process";
import { resolve } from "node:path";

const child = spawn(process.execPath, ["node_modules/vinext/dist/cli.js", ...process.argv.slice(2)], {
  stdio: "inherit",
  env: { ...process.env, WRANGLER_LOG_PATH: resolve(".wrangler/wrangler.log") },
});
child.on("exit", (code) => { process.exitCode = code ?? 1; });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
