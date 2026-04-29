#!/usr/bin/env tsx

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createMarkdownFromOpenApi } from "@scalar/openapi-to-markdown";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = join(__dirname, "..", "..", "APIDOCS.md");
const OPENAPI_URL =
    process.env.OPENAPI_URL ||
    "https://gen.pollinations.ai/docs/open-api/generate-schema";

type JsonObject = Record<string, unknown>;

/**
 * Strip all 4xx/5xx error response sections from the markdown and append
 * a single consolidated "Error Responses" reference at the end.
 */
function deduplicateErrorResponses(md: string): string {
    const lines = md.split("\n");
    const output: string[] = [];
    let skipping = false;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Detect error response headers: ##### Status: 4xx or 5xx
        if (/^#{5}\s+Status:\s+[45]\d{2}\b/.test(line)) {
            skipping = true;
            continue;
        }

        // Stop skipping at the next status header or section header
        if (skipping) {
            if (
                /^#{3,5}\s+(?:Status:|[A-Z])/.test(line) &&
                !/^#{5}\s+Status:\s+[45]/.test(line)
            ) {
                skipping = false;
            } else {
                continue;
            }
        }

        output.push(line);
    }

    // Append consolidated error reference
    output.push("");
    output.push("## Error Responses");
    output.push("");
    output.push("All endpoints return errors in this format:");
    output.push("");
    output.push("```json");
    output.push(
        JSON.stringify(
            {
                status: 400,
                success: false,
                error: {
                    code: "BAD_REQUEST",
                    message: "Description of what went wrong",
                    timestamp: "2025-01-01T00:00:00.000Z",
                    details: { name: "ValidationError" },
                    requestId: "req_abc123",
                },
            },
            null,
            2,
        ),
    );
    output.push("```");
    output.push("");
    output.push("| Status | Code | Description |");
    output.push("|--------|------|-------------|");
    output.push(
        "| 400 | BAD_REQUEST | Invalid input data. `details` includes `formErrors` and `fieldErrors` for validation failures. |",
    );
    output.push(
        "| 401 | UNAUTHORIZED | Missing or invalid API key. Provide via `Authorization: Bearer <key>` header or `?key=<key>` query param. |",
    );
    output.push(
        "| 402 | PAYMENT_REQUIRED | Insufficient pollen balance or API key budget exhausted. |",
    );
    output.push(
        "| 403 | FORBIDDEN | Access denied — insufficient permissions or tier for this model. |",
    );
    output.push("| 404 | NOT_FOUND | Resource not found. |");
    output.push("| 429 | RATE_LIMITED | Too many requests. Slow down. |");
    output.push("| 500 | INTERNAL_ERROR | Server error. We're on it. |");
    output.push("");

    return output.join("\n");
}

/**
 * Replace long enum arrays in the spec with a description pointing to /models.
 */
function simplifyModelEnums(spec: JsonObject): void {
    for (const methods of Object.values(asObject(spec.paths))) {
        for (const op of Object.values(asObject(methods))) {
            const operation = asObject(op);
            for (const param of asArray(operation.parameters)) {
                const parameter = asObject(param);
                const schema = asObject(parameter.schema);
                const enumValues = asArray(schema.enum);
                if (enumValues.length > 15) {
                    const examples = enumValues.slice(0, 5).join(", ");
                    schema.description = `${String(parameter.description || parameter.name || "Model")}. Examples: ${examples}. See /image/models, /text/models, or /audio/models for full list.`;
                    delete schema.enum;
                }
            }
        }
    }
}

/**
 * Remove empty-string and null placeholder values from JSON examples in the markdown.
 * Converts verbose examples with empty values into compact, meaningful ones.
 */
function cleanPlaceholderExamples(md: string): string {
    return md.replace(/```json\n([\s\S]*?)```/g, (match, jsonBlock) => {
        try {
            const parsed = JSON.parse(jsonBlock);
            const cleaned = removeEmptyValues(parsed);
            if (
                cleaned === undefined ||
                (typeof cleaned === "object" &&
                    Object.keys(cleaned).length === 0)
            ) {
                return ""; // Remove entirely empty examples
            }
            return `\`\`\`json\n${JSON.stringify(cleaned, null, 2)}\n\`\`\``;
        } catch {
            return match; // Not valid JSON, leave as-is
        }
    });
}

function removeEmptyValues(obj: unknown): unknown {
    if (Array.isArray(obj)) {
        const filtered = obj
            .map(removeEmptyValues)
            .filter((v) => v !== undefined);
        return filtered.length > 0 ? filtered : undefined;
    }
    if (obj && typeof obj === "object") {
        const result: JsonObject = {};
        for (const [k, v] of Object.entries(obj)) {
            if (v === "" || v === null) continue;
            const cleaned = removeEmptyValues(v);
            if (cleaned !== undefined) result[k] = cleaned;
        }
        return Object.keys(result).length > 0 ? result : undefined;
    }
    return obj;
}

function asObject(value: unknown): JsonObject {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return value as JsonObject;
}

function asArray(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
}

async function main() {
    console.log(`Fetching OpenAPI spec from ${OPENAPI_URL}...`);
    const spec = (await fetch(OPENAPI_URL).then((r) => r.json())) as JsonObject;
    const originalSpecSize = JSON.stringify(spec).length;

    // Pre-process: simplify long model enum lists
    simplifyModelEnums(spec);
    console.log(
        `Spec: ${originalSpecSize} → ${JSON.stringify(spec).length} bytes after enum simplification`,
    );

    console.log("Generating markdown...");
    let markdown = await createMarkdownFromOpenApi(spec);
    const rawSize = markdown.length;

    // Post-process: deduplicate error responses
    markdown = deduplicateErrorResponses(markdown);

    // Post-process: clean placeholder JSON examples
    markdown = cleanPlaceholderExamples(markdown);

    // Fix: @scalar/openapi-to-markdown fails to render complex anyOf schemas
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
{ "type": "text", "text": "Hello, world!" }
\`\`\`

**Example (image):**

\`\`\`json
{ "type": "image_url", "image_url": { "url": "https://example.com/image.jpg", "detail": "high" } }
\`\`\`
`;
        markdown = markdown.trim() + messageContentPartDocs;
    }

    // Remove consecutive blank lines (3+ → 2)
    markdown = markdown.replace(/\n{3,}/g, "\n\n");

    writeFileSync(OUTPUT_PATH, markdown);
    console.log(`✅ Saved to ${OUTPUT_PATH}`);
    console.log(
        `   Raw: ${rawSize} bytes → Final: ${markdown.length} bytes (${Math.round((1 - markdown.length / rawSize) * 100)}% reduction)`,
    );
}

main().catch((err) => {
    console.error("❌ Error:", err.message);
    process.exit(1);
});
