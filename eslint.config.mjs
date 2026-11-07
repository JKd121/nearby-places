import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  // These effects synchronize browser state and cancellable external stores.
  { rules: { "react-hooks/set-state-in-effect": "off", "@typescript-eslint/no-unused-vars": ["warn", { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_" }] } },
  globalIgnores([".next/**", "dist/**", "generated/**", ".local/**"]),
]);
