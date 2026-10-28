import ts from "typescript";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const transport = "src/amap/transport.ts";
const factories = new Set(["src/amap/client.ts", "src/location/provider.ts", "src/server/amap.ts"]);
const networkModules = /^(?:node:)?(?:https?|http2|net|tls|dns|dgram)$|^(?:undici|axios|got|node-fetch|cross-fetch|superagent)(?:\/|$)/;
const reviewedExternalModules = /^(?:react(?:\/.*)?|next(?:\/.*)?|server-only|@prisma\/adapter-pg|node:crypto)$/;
const normalize = path => path.replaceAll("\\", "/");

/** Deliberately strict architectural guard, not a JavaScript security sandbox. */
export function inspectSource(path, source) {
  path = normalize(path);
  const browser = path.startsWith("src/web/") || path.startsWith("app/ui-preview/");
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, path.endsWith("tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const errors = [];
  const report = (node, rule) => errors.push(`${path}:${file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1}: ${rule}`);
  function inType(node) {
    for (let p = node.parent; p; p = p.parent) {
      if (ts.isTypeNode(p)) return true;
      if (ts.isStatement(p)) break;
    }
    return false;
  }
  function visit(node) {
    if (ts.isStringLiteralLike(node)) {
      const module = ts.isImportDeclaration(node.parent) || ts.isExportDeclaration(node.parent)
        || (ts.isCallExpression(node.parent) && (node.parent.expression.kind === ts.SyntaxKind.ImportKeyword || node.parent.expression.getText(file) === "require"));
      if (module) {
        if (networkModules.test(node.text)) report(node, "network modules must not bypass AMap transport");
        const databaseImport = path === "src/db/prisma.ts" && ["pg", "@vercel/functions/db-connections"].includes(node.text);
        if (!node.text.startsWith(".") && !reviewedExternalModules.test(node.text) && !databaseImport) report(node, "new production external imports need boundary review");
        if (!browser && /(?:^|\/)scripts\/|(?:^|\/)test\//.test(node.text)) report(node, "production must not import CLI/test helpers");
        if (!browser && /amap\/client(?:\.js)?$|location\/provider(?:\.js)?$/.test(node.text) && !factories.has(path)) report(node, "production AMap clients must come from server/amap");
      }
      if (node.text.includes("restapi.amap.com") && !factories.has(path) && path !== transport) report(node, "AMap endpoint outside transport/client assembly");
      if (!browser && path !== transport && node.text === "fetch") report(node, "computed fetch outside transport");
    }
    if (!browser && path !== transport && ts.isIdentifier(node) && ["fetch", "fetchImpl"].includes(node.text) && !inType(node)) {
      const p = node.parent;
      const parameter = ts.isParameter(p) && p.name === node && !p.initializer;
      const injection = ts.isCallExpression(p) && p.expression.getText(file) === "createAmapTransport" && p.arguments[0] === node && factories.has(path);
      if (!parameter && !injection) report(node, "fetch may execute only in amap/transport");
    }
    if (!browser && ts.isCallExpression(node)) {
      const name = node.expression.getText(file);
      if (path === "src/server/amap.ts" && name === "createAmapTransport") {
        const options = node.arguments[1];
        const guarded = options && ts.isObjectLiteralExpression(options) && options.properties.some(p =>
          ts.isPropertyAssignment(p) && p.name.getText(file) === "beforeAttempt"
          && ts.isCallExpression(p.initializer) && p.initializer.expression.getText(file) === "getServerAdmission");
        if (!guarded) report(node, "server AMap transport requires the shared admission hook");
      }
      if (["createAmapTransport", "createAmapClient", "createAmapClientWithTransport", "createLocationResolverProvider", "createLocationResolverProviderWithTransport"].includes(name) && !factories.has(path)) report(node, "use the server AMap factory");
      if ((node.expression.kind === ts.SyntaxKind.ImportKeyword || name === "require") && (!node.arguments[0] || !ts.isStringLiteral(node.arguments[0]))) report(node, "dynamic production imports require review");
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  return errors;
}

export function checkProject(root = process.cwd()) {
  const errors = [];
  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = resolve(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (/\.(?:tsx?|[cm]?js)$/.test(entry.name)) errors.push(...inspectSource(normalize(relative(root, path)), readFileSync(path, "utf8")));
    }
  }
  walk(resolve(root, "src")); walk(resolve(root, "app"));
  const startup = resolve(root, "instrumentation.ts");
  if (existsSync(startup)) errors.push(...inspectSource("instrumentation.ts", readFileSync(startup, "utf8")));
  return errors;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const errors = checkProject();
  if (errors.length) { console.error(errors.join("\n")); process.exitCode = 1; }
  else console.log("AMap production transport boundary: PASS");
}
