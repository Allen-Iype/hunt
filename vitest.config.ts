import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const pkg = (name: string) =>
  fileURLToPath(new URL(`./packages/${name}/src/index.ts`, import.meta.url));

export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.test.ts", "packages/*/test/**/*.test.ts"],
  },
  resolve: {
    // Tests run against sources, not dist, so `pnpm test` needs no prior build.
    alias: {
      "@hunt/core": pkg("core"),
      "@hunt/storage": pkg("storage"),
      "@hunt/capabilities": pkg("capabilities"),
      "@hunt/ai": pkg("ai"),
      "@hunt/ingestion": pkg("ingestion"),
      "@hunt/render": pkg("render"),
    },
  },
});
