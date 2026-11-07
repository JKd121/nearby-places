import assert from "node:assert/strict";
import test from "node:test";
import { ESLint } from "eslint";
import react from "eslint-plugin-react";
import imports from "eslint-plugin-import";
import accessibility from "eslint-plugin-jsx-a11y";
import { minimatch, Minimatch } from "minimatch";
import { mkdtemp, mkdir, copyFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

const lint = new ESLint({ overrideConfigFile: true, overrideConfig: [{
  files: ["**/*.tsx"],
  languageOptions: { parserOptions: { ecmaVersion: 2022, sourceType: "module", ecmaFeatures: { jsx: true } } },
  settings: { react: { version: "19.2" } },
  plugins: { react, import: imports, "jsx-a11y": accessibility },
  rules: {
    "react/forbid-component-props": ["error", { forbid: [{ propNamePattern: "data-*", allowedForPatterns: ["Allowed*"] }] }],
    "import/no-internal-modules": ["error", { forbid: ["**/private/**"] }],
    "jsx-a11y/label-has-associated-control": ["error", { controlComponents: ["Input*"], assert: "nesting", depth: 3 }],
  },
}] });
const messages = async source => (await lint.lintText(source, { filePath: "app/compat-fixture.tsx" }))[0].messages;

test("patched React glob-based rules reject forbidden props and respect component exceptions", async () => {
  const bad = await messages('export default () => <Widget data-secret="x" />;');
  assert.ok(bad.some(message => message.ruleId === "react/forbid-component-props"));
  assert.equal((await messages('export default () => <AllowedWidget data-secret="x" />;')).length, 0);
});
test("patched import rules detect forbidden internal modules", async () => {
  const bad = await messages('import x from "package/private/secret"; export default x;');
  assert.ok(bad.some(message => message.ruleId === "import/no-internal-modules"));
  assert.equal((await messages('import x from "package/public/api"; export default x;')).length, 0);
});
test("patched accessibility helpers match custom controls and still require a label", async () => {
  const bad = await messages('export default () => <label><InputField /></label>;');
  assert.ok(bad.some(message => message.ruleId === "jsx-a11y/label-has-associated-control"));
  assert.equal((await messages('export default () => <label>姓名<InputField /></label>;')).length, 0);
});
test("modern glob semantics cover braces, globstar, dot files and case-insensitive matching", () => {
  assert.ok(minimatch("src/web/IdentityApp.tsx", "{app,src}/**/*.{ts,tsx}"));
  assert.ok(new Minimatch("**/*.TSX", { nocase: true }).match("src/web/IdentityApp.tsx"));
  assert.equal(minimatch(".local/report.json", "**/*.json"), false);
  assert.ok(minimatch(".local/report.json", "**/*.json", { dot: true }));
  assert.equal(minimatch("test/fixture.ts", "{app,src}/**/*.ts"), false);
});
test("real project config continues to include source and exclude generated outputs", async () => {
  const project = new ESLint();
  for (const path of ["app/page.tsx", "src/web/IdentityApp.tsx"]) assert.equal(await project.isPathIgnored(path), false);
  for (const path of ["generated/prisma/client.ts", "dist/src/index.js", ".next/server/app.js", ".local/report.js"]) assert.equal(await project.isPathIgnored(path), true);
});
test("incompatible upstream files make strict patch application fail", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "nearby-lint-patch-test-"));
  await mkdir(join(fixture, "patches"));
  await mkdir(join(fixture, "node_modules/eslint-plugin-react/lib/rules"), { recursive: true });
  await writeFile(join(fixture, "package.json"), JSON.stringify({ name: "patch-failure-fixture", private: true, dependencies: { "eslint-plugin-react": "7.37.5" } }));
  await copyFile("node_modules/eslint-plugin-react/package.json", join(fixture, "node_modules/eslint-plugin-react/package.json"));
  await writeFile(join(fixture, "node_modules/eslint-plugin-react/lib/rules/no-danger.js"), "// incompatible upstream file\n");
  await copyFile("patches/eslint-plugin-react+7.37.5.patch", join(fixture, "patches/eslint-plugin-react+7.37.5.patch"));
  const result = spawnSync(process.execPath, [resolve("node_modules/patch-package/index.js"), "--error-on-fail"], { cwd: fixture, encoding: "utf8", windowsHide: true });
  assert.equal(result.status, 1);
  assert.match(result.stdout + result.stderr, /Failed to apply patch/);
});
