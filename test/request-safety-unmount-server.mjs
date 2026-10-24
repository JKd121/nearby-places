// Test-only fixture: bundles the real SearchApp with existing Next webpack/TS/React.
// No new dependency, production route, provider or database. Generated files live in OS temp.
import { createRequire } from "node:module";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { createServer } from "node:http";
const require = createRequire(import.meta.url);
const webpack = require("next/dist/compiled/webpack/webpack").webpack;
const root = resolve("."); const output = mkdtempSync(join(tmpdir(), "amap-stage-a-unmount-"));
const loader = join(output, "typescript-loader.cjs");
writeFileSync(loader, `const ts=require(${JSON.stringify(require.resolve("typescript"))});module.exports=function(source){return ts.transpileModule(source,{fileName:this.resourcePath,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}}).outputText}`);
const cssLoader = join(output, "css-loader.cjs"); writeFileSync(cssLoader, 'module.exports=function(){return "export default {}"}');
const entry = join(output, "entry.tsx");
writeFileSync(entry, `import React from "react"; import {createRoot} from "react-dom/client"; import {flushSync} from "react-dom"; import SearchApp from ${JSON.stringify(join(root, "src/web/SearchApp.tsx"))}; let root; window.fixtureMount=()=>{root=createRoot(document.getElementById("root"));flushSync(()=>root.render(<SearchApp/>));};window.fixtureUnmount=()=>flushSync(()=>root.unmount());`);
const compiler = webpack({ mode: "development", devtool: false, entry, output: { path: output, filename: "fixture.js" },
  resolve: { extensions: [".tsx", ".ts", ".js"], extensionAlias: { ".js": [".ts", ".tsx", ".js"] }, modules: [join(root, "node_modules")] },
  module: { rules: [{ test: /\.tsx?$/, use: loader }, { test: /\.css$/, use: cssLoader }] } });
await new Promise((resolve, reject) => compiler.run((error, stats) => error || stats.hasErrors() ? reject(error ?? Error(stats.toString({ all: false, errors: true }))) : resolve()));
await new Promise(resolve => compiler.close(resolve));
const server = createServer((request, response) => {
  if (request.url === "/favicon.ico") { response.writeHead(204); response.end(); }
  else if (request.url === "/fixture.js") { response.setHeader("content-type", "application/javascript"); response.end(readFileSync(join(output, "fixture.js"))); }
  else if (request.url === "/") { response.setHeader("content-type", "text/html; charset=utf-8"); response.end('<!doctype html><html><body><div id="root"></div><script src="/fixture.js"></script></body></html>'); }
  else { response.writeHead(404); response.end(); }
});
server.listen(3123, "127.0.0.1", () => console.log("Stage A unmount fixture http://127.0.0.1:3123 (no provider/database)"));
