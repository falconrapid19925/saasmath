import { defineConfig, globalIgnores } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextCoreWebVitals,
  ...nextTypescript,
  globalIgnores([
    ".next/**",
    "node_modules/**",
    "next-env.d.ts",
    "drizzle/**",
    "out/**",
    ".zcode/**",
    "site-dist/**",
    "coverage/**",
    "games/math-bee-smp/**",
    "playwright-report/**",
  ]),
]);

export default eslintConfig;
