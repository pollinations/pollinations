#!/usr/bin/env tsx
/**
 * Static validator for APIDOCS.md. Catches regressions before they land:
 *   - every internal anchor link resolves to a rendered heading
 *   - every curl example for a write method (POST/PUT/PATCH) carries a body
 *     (`-d`, `-F`, or `--data-binary`) — write endpoints without a body never
 *     work, even if the example "looks" valid
 *   - no `model=<image-model>` appears inside a `/video/` curl example
 *   - public read examples (media retrieval) do not include `Authorization`
 *   - media-storage examples use the media.pollinations.ai origin
 *
 * Exits non-zero on any failure so it can gate CI.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APIDOCS_PATH = join(__dirname, "..", "..", "APIDOCS.md");

// Image models — must NOT appear as `model=<x>` inside a `/video/` example.
const IMAGE_MODELS = new Set([
    "flux",
    "zimage",
    "gptimage",
    "gptimage-large",
    "gpt-image-2",
    "kontext",
    "seedream5",
    "seedream",
    "nanobanana",
    "nanobanana-pro",
    "klein",
]);

// Public read endpoints whose curl examples must not show Authorization.
const MEDIA_ID = "550e8400-e29b-41d4-a716-446655440000";
const PUBLIC_READ_PATHS = new Set([
    `/${MEDIA_ID}`,
    `/${MEDIA_ID}/metadata`,
    "/media",
]);
const MEDIA_PATHS = new Set([
    "/upload",
    `/${MEDIA_ID}`,
    `/${MEDIA_ID}/metadata`,
    "/media",
    `/media/${MEDIA_ID}`,
]);

function slug(s: string): string {
    return s
        .toLowerCase()
        .replace(/[^\p{Letter}\p{Number}\s_-]/gu, "")
        .replace(/\s+/g, "-");
}

type CodeBlock = {
    lang: string;
    body: string;
    startLine: number;
};

function extractCodeBlocks(md: string): CodeBlock[] {
    const blocks: CodeBlock[] = [];
    const lines = md.split("\n");
    let inBlock = false;
    let lang = "";
    let body: string[] = [];
    let startLine = 0;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const fence = line.match(/^```(\w*)/);
        if (fence) {
            if (inBlock) {
                blocks.push({ lang, body: body.join("\n"), startLine });
                inBlock = false;
                body = [];
                lang = "";
            } else {
                inBlock = true;
                lang = fence[1] || "";
                startLine = i + 1;
            }
            continue;
        }
        if (inBlock) body.push(line);
    }
    return blocks;
}

type Failure = { rule: string; line: number; message: string };

function validate(md: string): Failure[] {
    const failures: Failure[] = [];
    const lines = md.split("\n");

    // 1. Anchor link resolution
    const headingAnchors = new Set<string>();
    const headingRegex = /^(#{2,4})\s+(.+)$/gm;
    for (const m of md.matchAll(headingRegex)) {
        headingAnchors.add(slug(m[2]));
    }
    const linkRegex = /\]\(#([^)]+)\)/g;
    for (const m of md.matchAll(linkRegex)) {
        if (!headingAnchors.has(m[1])) {
            const idx = m.index ?? 0;
            const lineNo = md.slice(0, idx).split("\n").length;
            failures.push({
                rule: "anchor",
                line: lineNo,
                message: `link \`#${m[1]}\` does not match any rendered heading`,
            });
        }
    }

    // 2-4. Per-bash-block checks
    const blocks = extractCodeBlocks(md);
    for (const block of blocks) {
        if (block.lang !== "bash") continue;
        if (!block.body.startsWith("curl")) continue;

        const firstLine = block.body.split("\n")[0];
        const urlMatch = firstLine.match(/"([^"]+)"/);
        const url = urlMatch ? urlMatch[1] : "";
        const methodMatch = firstLine.match(/-X\s+(\w+)/);
        const method = methodMatch ? methodMatch[1].toUpperCase() : "GET";
        const parsedUrl = URL.parse(url);

        // Find the nearest preceding heading to give a useful failure path.
        const heading = findEnclosingHeading(lines, block.startLine);

        // 2. Write methods must include a body indicator.
        if (["POST", "PUT", "PATCH"].includes(method)) {
            const hasBody = /(-d\s|--data-binary|-F\s|-F"|--form)/.test(
                block.body,
            );
            if (!hasBody) {
                failures.push({
                    rule: "write-without-body",
                    line: block.startLine,
                    message: `${method} curl in "${heading}" has no -d/-F/--data-binary — example is not runnable`,
                });
            }
        }

        // 3. Image models inside /video/ examples.
        if (url.includes("/video/")) {
            const modelMatch = url.match(/[?&]model=([^&"\s]+)/);
            if (modelMatch && IMAGE_MODELS.has(modelMatch[1])) {
                failures.push({
                    rule: "image-model-in-video",
                    line: block.startLine,
                    message: `/video/ example uses image model "${modelMatch[1]}" — pick a video model (veo, seedance, wan, nova-reel)`,
                });
            }
        }

        // 4. Public reads must not include Authorization.
        const isPublicReadPath =
            parsedUrl !== null && PUBLIC_READ_PATHS.has(parsedUrl.pathname);
        if (
            isPublicReadPath &&
            (method === "GET" || method === "HEAD") &&
            /Authorization:/i.test(block.body)
        ) {
            failures.push({
                rule: "auth-on-public-read",
                line: block.startLine,
                message: `public read endpoint "${heading}" includes Authorization header in curl example`,
            });
        }

        // 5. Media storage is hosted separately from the gen gateway.
        if (
            parsedUrl &&
            MEDIA_PATHS.has(parsedUrl.pathname) &&
            parsedUrl.origin !== "https://media.pollinations.ai"
        ) {
            failures.push({
                rule: "wrong-media-origin",
                line: block.startLine,
                message: `media endpoint "${heading}" uses ${parsedUrl.origin} instead of https://media.pollinations.ai`,
            });
        }
    }

    return failures;
}

function findEnclosingHeading(lines: string[], blockStartLine: number): string {
    for (let i = blockStartLine - 1; i >= 0; i--) {
        const m = lines[i]?.match(/^#{2,4}\s+(.+)$/);
        if (m) return m[1];
    }
    return "<unknown>";
}

function main() {
    const md = readFileSync(APIDOCS_PATH, "utf8");
    const failures = validate(md);
    if (failures.length === 0) {
        console.log("✅ APIDOCS.md passes static validation.");
        return;
    }
    console.error(`❌ ${failures.length} validation failure(s) in APIDOCS.md:`);
    for (const f of failures) {
        console.error(`  [${f.rule}] line ${f.line}: ${f.message}`);
    }
    process.exit(1);
}

main();
