import { writeFileSync } from "node:fs";
import { sourceIdentity } from "./test-evidence.mjs";
writeFileSync(".next/test-source.json", JSON.stringify(sourceIdentity(), null, 2));
