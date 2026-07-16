import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Don't lint the generated Prisma client (regenerated on every `prisma generate`)
    "src/generated/**",
    // Don't lint build artifacts
    "coverage/**",
    "dist/**",
    // Pre-existing demo/skill folders that ship with the sandbox but are NOT
    // part of the zks app — they have their own dependencies and lint rules.
    "audit-project/**",
    "examples/**",
    "skills/**",
    "mini-services/**",
  ]),
  // Custom rules
  {
    rules: {
      // Allow the destructure-omit pattern: `const { a, b, ...rest } = obj`
      // where `a` and `b` are intentionally discarded to strip them from `rest`.
      // This is the idiomatic way to omit fields without triggering unused-vars.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
    },
  },
]);

export default eslintConfig;
