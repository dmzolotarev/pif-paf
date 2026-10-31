import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";

const root = realpathSync(new URL("..", import.meta.url));
const gitRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: root, encoding: "utf8" }).trim();
if (realpathSync(gitRoot) !== root) throw new Error("Run this check inside the standalone repository.");
const paths = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" }).split("\0").filter(Boolean);
const issues = [];
const signatures = [
  ["API key", /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}\b/],
  ["GitHub token", /\b(?:gh[pousr]_|github_pat_)[A-Za-z0-9_]{20,}\b/],
  ["private key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ["literal bearer token", /Bearer\s+[A-Za-z0-9_-]{24,}/],
  ["private deployment identity", /appgprj_[a-f0-9]{20,}|https:\/\/[^\s"']+\.chatgpt\.site/],
];
for (const path of paths) {
  if (/^(?:\.openai|\.idea|\.wrangler|node_modules|dist)\//.test(path) || /(?:\.sqlite(?:-.*)?|\.db|\.tsbuildinfo)$/.test(path) || /(?:^|\/)(?:\.env(?:\..*)?|\.dev\.vars(?:\..*)?)$/.test(path) && !path.endsWith(".example")) {
    issues.push({ path, issue: "runtime data or local configuration is tracked" });
  }
  if (/\.(png|jpg|jpeg|webp|ico|pdf|zip|tgz)$/.test(path)) continue;
  const text = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  for (const [issue, signature] of signatures) if (signature.test(text)) issues.push({ path, issue });
}
if (issues.length) {
  console.error(JSON.stringify(issues, null, 2)); // Never print matched secret values.
  process.exitCode = 1;
} else console.log(`Checked ${paths.length} tracked files: no known secret signatures or private deployment files. This is a heuristic check, not a complete security audit.`);
