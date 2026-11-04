import { readFileSync } from "node:fs";
import { sourceIdentity } from "../scripts/test-evidence.mjs";
export default function checkBuild() {
  const build = JSON.parse(readFileSync(".next/test-source.json", "utf8"));
  if (build.sourceSha256 !== sourceIdentity().sourceSha256) {
    throw new Error("Production build is stale: run npm run build before browser tests");
  }
}
