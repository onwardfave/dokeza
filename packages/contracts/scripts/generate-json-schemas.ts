import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { authJsonSchemas } from "../src/auth.js";
import { realtimeJsonSchemas } from "../src/realtime.js";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outputDir = join(root, "generated", "json-schema");

await mkdir(outputDir, { recursive: true });

for (const [name, schema] of Object.entries({ ...realtimeJsonSchemas, ...authJsonSchemas })) {
  await writeFile(join(outputDir, `${name}.schema.json`), `${JSON.stringify(schema, null, 2)}\n`);
}
