import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/node_modules/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // Allow omitting fields via rest destructuring: const { a, ...rest } = obj
      "@typescript-eslint/no-unused-vars": [
        "error",
        { ignoreRestSiblings: true, argsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // Architectural guardrail (SDD §6, ADR-002): the domain core depends on
    // nothing — no other Hunt packages, no I/O-capable Node builtins, no SDKs.
    files: ["packages/core/src/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@hunt/*"],
              message:
                "packages/core must not depend on other Hunt packages (dependency rule, SDD §6).",
            },
            {
              group: [
                "node:fs*",
                "node:http*",
                "node:https*",
                "node:net",
                "node:child_process",
                "node:worker_threads",
                "fs",
                "http",
                "https",
                "net",
                "child_process",
              ],
              message:
                "packages/core must not perform I/O (dependency rule, SDD §6/§7).",
            },
          ],
        },
      ],
    },
  },
);
