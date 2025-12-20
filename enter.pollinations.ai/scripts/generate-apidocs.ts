#!/usr/bin/env tsx

import { createMarkdownFromOpenApi } from "@scalar/openapi-to-markdown";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = join(__dirname, "..", "APIDOCS.md");
const OPENAPI_URL =
    process.env.OPENAPI_URL ||
    "https://enter.pollinations.ai/api/docs/open-api/generate-schema";

async function main() {
    console.log(`Fetching OpenAPI spec from ${OPENAPI_URL}...`);
    const spec = await fetch(OPENAPI_URL).then((r) => r.json());

    console.log("Generating markdown...");
    const markdown = await createMarkdownFromOpenApi(spec);

    writeFileSync(OUTPUT_PATH, markdown);
    console.log(`✅ Saved to ${OUTPUT_PATH} (${markdown.length} bytes)`);
}

main().catch((err) => {
    console.error("❌ Error:", err.message);
    process.exit(1);
});
