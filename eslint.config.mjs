import js from "@eslint/js";
import ts from "typescript-eslint";
import hooks from "eslint-plugin-react-hooks";

// Frontend and browser-test lint; core behavior remains covered by its existing
// TypeScript/Node test suites. No generated files or historical spikes included.
export default [{ ignores: ["dist/**", "generated/**", ".next/**", "playwright-report/**", "test-results/**"] }, {
  files: ["app/**/*.ts", "app/**/*.tsx", "src/components/**/*.tsx", "src/lib/**/*.ts", "src/web/**/*.ts", "src/web/**/*.tsx", "test/browser/**/*.ts", "playwright.config.ts"],
  languageOptions: { parser: ts.parser, parserOptions: { ecmaFeatures: { jsx: true } } },
  plugins: { "@typescript-eslint": ts.plugin, "react-hooks": hooks },
  rules: {
    ...js.configs.recommended.rules,
    ...ts.configs.recommended.reduce((rules, config) => ({ ...rules, ...config.rules }), {}),
    "no-undef": "off", // TypeScript checks browser/Node globals in the correct environment.
    "preserve-caught-error": "off", // Existing public-error normalization intentionally hides transport details.
    "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    "react-hooks/rules-of-hooks": "error",
    "react-hooks/exhaustive-deps": "error",
  },
}];
