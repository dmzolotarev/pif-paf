import { randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";

try {
  await writeFile(new URL("../.dev.vars", import.meta.url), [
    `ORGANIZER_SECRET=${randomBytes(24).toString("base64url")}`,
    `PLAYER_AUTH_SECRET=${randomBytes(32).toString("base64url")}`,
    "",
  ].join("\n"), { flag: "wx", mode: 0o600 });
  console.log("Created .dev.vars with independent random secrets. Open that local file to find your organizer password. Existing files are never overwritten.");
} catch (error) {
  if (error.code !== "EEXIST") throw error;
  console.log(".dev.vars already exists; preserved it unchanged.");
}
