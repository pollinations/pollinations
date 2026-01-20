#!/usr/bin/env tsx

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createMarkdownFromOpenApi } from "@scalar/openapi-to-markdown";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = join(__dirname, "..", "..", "APIDOCS.md");
const OPENAPI_URL =
    process.env.OPENAPI_URL ||
    "https://enter.pollinations.ai/api/docs/open-api/generate-schema";

async function main() {
    console.log(`Fetching OpenAPI spec from ${OPENAPI_URL}...`);
    const spec = await fetch(OPENAPI_URL).then((r) => r.json());

    console.log("Generating markdown...");
    let markdown = await createMarkdownFromOpenApi(spec);

    // Fix: @scalar/openapi-to-markdown fails to render complex anyOf schemas
    // Manually append MessageContentPart documentation if it's incomplete
    if (
        markdown.includes("### MessageContentPart") &&
        markdown.trim().endsWith("**Example:**")
    ) {
        console.log(
            "⚠️  Detected incomplete MessageContentPart - appending manual documentation...",
        );

        const messageContentPartDocs = `

Union type for message content parts. Can be one of:

- **Text content**: \`{ type: "text", text: string, cache_control?: CacheControl }\`
- **Image content**: \`{ type: "image_url", image_url: { url: string, detail?: "auto" | "low" | "high", mime_type?: string } }\`
- **Video content**: \`{ type: "video_url", video_url: { url: string, mime_type?: string } }\`
- **Audio content**: \`{ type: "input_audio", input_audio: { data: string, format: "wav" | "mp3" | "flac" | "opus" | "pcm16" }, cache_control?: CacheControl }\`
- **File content**: \`{ type: "file", file: { file_data?: string, file_id?: string, file_name?: string, file_url?: string, mime_type?: string }, cache_control?: CacheControl }\`
- **Custom types**: Any object with a \`type\` field for provider-specific extensions

**Example (text):**

\`\`\`json
{
  "type": "text",
  "text": "Hello, world!"
}
\`\`\`

**Example (image):**

\`\`\`json
{
  "type": "image_url",
  "image_url": {
    "url": "https://example.com/image.jpg",
    "detail": "high"
  }
}
\`\`\`

**Example (video):**

\`\`\`json
{
  "type": "video_url",
  "video_url": {
    "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
  }
}
\`\`\`
`;
        markdown = markdown.trim() + messageContentPartDocs;
    }

    writeFileSync(OUTPUT_PATH, markdown);
    console.log(`✅ Saved to ${OUTPUT_PATH} (${markdown.length} bytes)`);
}

main().catch((err) => {
    console.error("❌ Error:", err.message);
    process.exit(1);
});
