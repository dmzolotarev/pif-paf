import vinext from "vinext";
import { defineConfig } from "vite";

export default defineConfig(async () => {
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/wrangler.log";
  const { cloudflare } = await import("@cloudflare/vite-plugin");
  return {
    plugins: [vinext(), cloudflare({
      configPath: process.env.PIFPAF_CONFIG ?? "wrangler.jsonc",
      ...(process.env.PIFPAF_TEST_STATE ? { persistState: { path: process.env.PIFPAF_TEST_STATE } } : {}),
      viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
    })],
  };
});
