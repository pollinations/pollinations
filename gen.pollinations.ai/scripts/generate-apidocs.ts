#!/usr/bin/env tsx

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = join(__dirname, "..", "..", "APIDOCS.md");
const INTRODUCTION_PATH = join(
    __dirname,
    "..",
    "src",
    "docs",
    "introduction.md",
);
const RECIPES_PATH = join(__dirname, "..", "src", "docs", "apidocs-recipes.md");
const OPENAPI_URL =
    process.env.OPENAPI_URL ||
    "https://gen.pollinations.ai/docs/open-api/generate-schema";

type Json = Record<string, unknown>;
type Schema = Json;
type Operation = Json;
type Spec = {
    info: { title: string; description: string; version: string };
    openapi: string;
    servers: { url: string }[];
    paths: Record<string, Record<string, Operation>>;
    components: { schemas: Record<string, Schema> };
};

const BASE_URL = "https://gen.pollinations.ai";
const SECTIONS = {
    start: { emoji: "🚀", title: "Getting Started" },
    contents: { emoji: "📑", title: "Contents" },
    endpoints: { emoji: "🛠️", title: "Endpoints" },
    schemas: { emoji: "🧩", title: "Schemas" },
    errors: { emoji: "⚠️", title: "Error Responses" },
} as const;

function sectionHeading(s: { emoji: string; title: string }): string {
    return `${s.emoji} ${s.title}`;
}
function sectionAnchor(s: { emoji: string; title: string }): string {
    return slug(sectionHeading(s));
}
const CALLOUT = {
    params: "⚙️ **Parameters**",
    body: "📥 **Request body**",
    response: "📤 **Response**",
    example: "💻 **Example**",
    fields: "🔎 **Fields**",
};

// ────────────────────────────────────────────────────────────────────────────
// Spec helpers
// ────────────────────────────────────────────────────────────────────────────

function asObj(v: unknown): Json {
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {};
}
function asArr(v: unknown): unknown[] {
    return Array.isArray(v) ? v : [];
}
function asStr(v: unknown, fallback = ""): string {
    return typeof v === "string" ? v : fallback;
}

function deref(spec: Spec, schema: Schema): Schema {
    const ref = asStr(schema?.$ref);
    if (!ref) return schema;
    const parts = ref.replace(/^#\//, "").split("/");
    let cur: unknown = spec;
    for (const p of parts) cur = asObj(cur)[p];
    return asObj(cur);
}

function refName(schema: Schema): string | null {
    const ref = asStr(schema?.$ref);
    if (!ref) return null;
    const parts = ref.split("/");
    return parts[parts.length - 1] ?? null;
}

/**
 * Matches github-slugger: strips chars that aren't letters/numbers/spaces/dashes/underscores
 * (so emoji and VS-16 are removed), then converts whitespace to dashes. The space left
 * behind by a leading emoji becomes a leading dash — required for `#-section` anchors
 * to match GitHub's rendered heading IDs.
 */
function slug(s: string): string {
    return s
        .toLowerCase()
        .replace(/[^\p{Letter}\p{Number}\s_-]/gu, "")
        .replace(/\s+/g, "-");
}

function escapePipe(s: string): string {
    // Escape backslashes first so they don't compound when we escape pipes —
    // otherwise a literal `\` in a spec description becomes `\\|` which renders
    // as an escaped pipe, not as a backslash followed by a pipe. (CodeQL
    // js/incomplete-sanitization #164.)
    return s
        .replace(/\\/g, "\\\\")
        .replace(/\|/g, "\\|")
        .replace(/\n+/g, " ")
        .trim();
}

// ────────────────────────────────────────────────────────────────────────────
// Type formatting
// ────────────────────────────────────────────────────────────────────────────

function formatType(schema: Schema | undefined): string {
    if (!schema) return "`any`";

    const ref = refName(schema);
    if (ref) return `[\`${ref}\`](#${slug(ref)})`;

    const anyOf = asArr(schema.anyOf);
    const oneOf = asArr(schema.oneOf);
    const union = anyOf.length ? anyOf : oneOf;
    if (union.length) {
        const nonNull = union.filter(
            (s) => asObj(s).type !== "null",
        ) as Schema[];
        const hasNull = nonNull.length !== union.length;
        const seen = new Set<string>();
        const parts: string[] = [];
        let alreadyNullable = false;
        for (const variant of nonNull) {
            const s = formatType(variant);
            if (s === "`null`" || s.endsWith("`null`")) alreadyNullable = true;
            if (!seen.has(s)) {
                seen.add(s);
                parts.push(s);
            }
        }
        if (hasNull && !alreadyNullable && !seen.has("`null`"))
            parts.push("`null`");
        return parts.length ? parts.join(" \\| ") : "`null`";
    }

    if (schema.const !== undefined) {
        return `\`"${schema.const}"\``;
    }

    const enumVals = asArr(schema.enum);
    if (enumVals.length > 0) {
        if (enumVals.length <= 5) {
            return enumVals.map((v) => `\`"${v}"\``).join(" \\| ");
        }
        const preview = enumVals
            .slice(0, 3)
            .map((v) => `\`"${v}"\``)
            .join(", ");
        return `enum (${enumVals.length}) — ${preview}, …`;
    }

    const type = asStr(schema.type);
    if (type === "array") {
        return `${formatType(asObj(schema.items))}[]`;
    }
    if (type === "string") {
        const fmt = asStr(schema.format);
        return fmt ? `\`string · ${fmt}\`` : "`string`";
    }
    if (type === "integer" || type === "number") return `\`${type}\``;
    if (type === "boolean") return "`boolean`";
    if (type === "null") return "`null`";
    if (type === "object" || schema.properties) return "`object`";
    return "`any`";
}

// ────────────────────────────────────────────────────────────────────────────
// Field table — flattens 1 level of nested objects with dotted paths
// ────────────────────────────────────────────────────────────────────────────

type Row = {
    name: string;
    type: string;
    required: boolean;
    description: string;
    extras: string[];
};

const JS_MAX_INT = 9007199254740991;
const JS_MIN_INT = -9007199254740991;

function collectExtras(prop: Schema): string[] {
    const extras: string[] = [];
    if (prop.default !== undefined)
        extras.push(`default: \`${JSON.stringify(prop.default)}\``);
    const min = prop.minimum as number | undefined;
    const max = prop.maximum as number | undefined;
    const minMeaningful = min !== undefined && min !== JS_MIN_INT && min !== 0;
    const maxMeaningful = max !== undefined && max !== JS_MAX_INT;
    if (minMeaningful && maxMeaningful) extras.push(`range: \`${min}…${max}\``);
    else if (minMeaningful) extras.push(`min: \`${min}\``);
    else if (maxMeaningful) extras.push(`max: \`${max}\``);
    const mn = prop.minLength as number | undefined;
    const mx = prop.maxLength as number | undefined;
    if (mn !== undefined && mx !== undefined)
        extras.push(`length: \`${mn}…${mx}\``);
    else if (mx !== undefined) extras.push(`max length: \`${mx}\``);
    return extras;
}

function collectRows(
    spec: Spec,
    schema: Schema | undefined,
    parent = "",
    depth = 0,
): Row[] {
    if (!schema) return [];
    const resolved = refName(schema) ? deref(spec, schema) : schema;
    const props = asObj(resolved.properties);
    const required = new Set(asArr(resolved.required) as string[]);
    const rows: Row[] = [];

    for (const [name, raw] of Object.entries(props)) {
        const prop = asObj(raw);
        const path = parent ? `${parent}.${name}` : name;
        const extras = collectExtras(prop);

        rows.push({
            name: path,
            type: formatType(prop),
            required: required.has(name),
            description: asStr(prop.description),
            extras,
        });

        // One level of inline expansion for nested objects (not refs)
        if (depth < 1 && !refName(prop)) {
            if (prop.type === "object" && prop.properties) {
                rows.push(...collectRows(spec, prop, path, depth + 1));
            } else if (
                prop.type === "array" &&
                asObj(prop.items).type === "object" &&
                asObj(prop.items).properties
            ) {
                rows.push(
                    ...collectRows(
                        spec,
                        asObj(prop.items),
                        `${path}[]`,
                        depth + 1,
                    ),
                );
            }
        }
    }
    return rows;
}

function renderRowsTable(rows: Row[]): string {
    if (rows.length === 0) return "";
    const out: string[] = [];
    out.push("| Field | Type | Description |");
    out.push("|---|---|---|");
    for (const r of rows) {
        const name = `\`${r.name}\`${r.required ? " *" : ""}`;
        const pieces = [r.description, ...r.extras].filter(Boolean);
        const desc = pieces.join(" · ");
        out.push(`| ${name} | ${r.type} | ${escapePipe(desc) || "—"} |`);
    }
    out.push("");
    out.push("<sub>`*` = required field</sub>");
    return out.join("\n");
}

function renderParamsTable(_spec: Spec, params: Schema[]): string {
    if (params.length === 0) return "";
    const out: string[] = [];
    out.push("| Param | In | Type | Description |");
    out.push("|---|---|---|---|");
    for (const raw of params) {
        const p = asObj(raw);
        const name = asStr(p.name);
        const inLoc = asStr(p.in);
        const required = p.required === true;
        const schema = asObj(p.schema);
        const desc = asStr(p.description) || asStr(schema.description);
        const extras = collectExtras(schema);
        const cell = [desc, ...extras].filter(Boolean).join(" · ");
        out.push(
            `| \`${name}\`${required ? " *" : ""} | \`${inLoc}\` | ${formatType(schema)} | ${escapePipe(cell) || "—"} |`,
        );
    }
    out.push("");
    out.push("<sub>`*` = required parameter</sub>");
    return out.join("\n");
}

// ────────────────────────────────────────────────────────────────────────────
// Example synthesis
// ────────────────────────────────────────────────────────────────────────────

function pickExample(
    spec: Spec,
    schema: Schema | undefined,
    opts: { compact?: boolean } = {},
): unknown {
    if (!schema) return undefined;
    const resolved = refName(schema) ? deref(spec, schema) : schema;
    if (resolved.example !== undefined) return resolved.example;

    const union = asArr(resolved.anyOf).length
        ? asArr(resolved.anyOf)
        : asArr(resolved.oneOf);
    if (union.length) {
        for (const u of union) {
            if (asObj(u).type === "null") continue;
            const ex = pickExample(spec, asObj(u), opts);
            if (ex !== undefined) return ex;
        }
    }

    const enumVals = asArr(resolved.enum);
    if (enumVals.length) return enumVals[0];

    if (resolved.default !== undefined) return resolved.default;

    const type = asStr(resolved.type);
    if (type === "object" || resolved.properties) {
        const props = asObj(resolved.properties);
        const required = new Set(asArr(resolved.required) as string[]);
        const out: Json = {};
        for (const [k, v] of Object.entries(props)) {
            const propSchema = asObj(v);
            const isRequired = required.has(k);
            const hasExample = propSchema.example !== undefined;
            if (opts.compact && !isRequired) continue;
            if (!isRequired && !hasExample) continue;
            const ex = pickExample(spec, propSchema, opts);
            if (ex !== undefined) out[k] = ex;
        }
        return Object.keys(out).length ? out : undefined;
    }
    if (type === "array") {
        const itemEx = pickExample(spec, asObj(resolved.items), opts);
        return itemEx !== undefined ? [itemEx] : undefined;
    }
    if (type === "string") {
        if (asStr(resolved.format) === "date-time")
            return "2026-01-01T00:00:00Z";
        return undefined;
    }
    return undefined;
}

function isMeaningfulExample(ex: unknown): boolean {
    if (ex === undefined || ex === null) return false;
    if (typeof ex !== "object") return true;
    if (Array.isArray(ex)) return ex.length > 0 && ex.some(isMeaningfulExample);
    return Object.keys(ex as object).length > 0;
}

/** Stricter than isMeaningfulExample — skip single-key objects that are just defaults. */
function isResponseExampleWorthwhile(ex: unknown): boolean {
    if (!isMeaningfulExample(ex)) return false;
    if (typeof ex === "object" && !Array.isArray(ex)) {
        return Object.keys(ex as object).length >= 2;
    }
    return true;
}

// ────────────────────────────────────────────────────────────────────────────
// Curl example
// ────────────────────────────────────────────────────────────────────────────

function buildCurl(
    spec: Spec,
    method: string,
    path: string,
    op: Operation,
): string {
    const upperMethod = method.toUpperCase();
    const params = visibleParams(path, asArr(op.parameters) as Schema[]);
    const queryParams = params.filter((p) => asObj(p).in === "query");
    const pathParams = params.filter((p) => asObj(p).in === "path");
    let url = `${BASE_URL}${path}`;
    // Substitute path placeholders with real, URL-encoded sample values so
    // curl examples are copy-pasteable. Falls back to `:name` only when the
    // spec provides no example for the parameter.
    url = url.replace(/{(\w+)}/g, (_match, name: string) => {
        const override = PATH_PARAM_OVERRIDES[name];
        if (override !== undefined) return encodeURIComponent(override);
        const param = pathParams.find((p) => asStr(asObj(p).name) === name);
        if (param) {
            const ex = pickExample(spec, asObj(asObj(param).schema));
            if (ex !== undefined) return encodeURIComponent(String(ex));
        }
        return `:${name}`;
    });
    // The /image and /video routes share a query schema whose `model` default
    // is an image model. Override so the video example uses a video model.
    const queryOverrides: Record<string, string> = path.startsWith("/video/")
        ? { model: "veo" }
        : {};
    if (queryParams.length) {
        const queryStr = queryParams
            .slice(0, 2)
            .map((p) => {
                const obj = asObj(p);
                const name = asStr(obj.name);
                const override = queryOverrides[name];
                if (override !== undefined) {
                    return `${name}=${encodeURIComponent(override)}`;
                }
                const ex = pickExample(spec, asObj(obj.schema));
                return `${name}=${ex !== undefined ? encodeURIComponent(String(ex)) : `:${name}`}`;
            })
            .join("&");
        url = `${url}?${queryStr}`;
    }

    // An empty `security: []` on an operation overrides the global auth
    // requirement — public endpoints (e.g. media retrieval) must not show an
    // Authorization header in their curl example. We also pin a fallback list
    // of public read paths so docs stay correct while the upstream media spec
    // is being redeployed with the explicit `security: []` setting.
    const opSecurity = op.security;
    const isPublic =
        (Array.isArray(opSecurity) && opSecurity.length === 0) ||
        isPublicMediaRead(method, path);

    const segments: string[] = [
        `curl${upperMethod !== "GET" ? ` -X ${upperMethod}` : ""} "${url}"`,
    ];
    if (!isPublic) {
        segments.push(`-H "Authorization: Bearer $POLLINATIONS_KEY"`);
    }

    const reqBody = asObj(op.requestBody);
    const reqContent = asObj(reqBody.content);
    const operationId = asStr(op.operationId);
    const jsonBody = asObj(reqContent["application/json"]);
    const multipartBody = asObj(reqContent["multipart/form-data"]);

    const curatedMultipart = CURATED_MULTIPART[operationId];

    if (jsonBody.schema) {
        const ex =
            CURATED_BODIES[operationId] ??
            pickExample(spec, asObj(jsonBody.schema), { compact: true });
        if (isMeaningfulExample(ex)) {
            segments.push(`-H "Content-Type: application/json"`);
            segments.push(`-d '${JSON.stringify(ex)}'`);
        }
    } else if (multipartBody.schema || curatedMultipart) {
        const fields =
            curatedMultipart ??
            buildMultipartFields(spec, asObj(multipartBody.schema));
        for (const [name, value] of fields) {
            segments.push(`-F "${name}=${value}"`);
        }
    } else if (CURATED_BODIES[operationId]) {
        // Fallback: spec has no requestBody but we have a curated JSON example.
        segments.push(`-H "Content-Type: application/json"`);
        segments.push(`-d '${JSON.stringify(CURATED_BODIES[operationId])}'`);
    }

    return segments.join(" \\\n  ");
}

function isPublicMediaRead(method: string, path: string): boolean {
    const lower = method.toLowerCase();
    if (lower !== "get" && lower !== "head") return false;
    return path === "/{hash}" || path === "/{hash}/metadata";
}

/**
 * Synthesize multipart form-data fields from a schema. File-like fields
 * (`string · binary`) become `@./path` placeholders; scalar fields use any
 * example/default from the schema.
 */
function buildMultipartFields(
    spec: Spec,
    schema: Schema,
): Array<[string, string]> {
    const resolved = refName(schema) ? deref(spec, schema) : schema;
    const props = asObj(resolved.properties);
    const required = new Set(asArr(resolved.required) as string[]);
    const fields: Array<[string, string]> = [];
    for (const [name, raw] of Object.entries(props)) {
        const prop = asObj(raw);
        if (!required.has(name)) continue;
        if (asStr(prop.format) === "binary") {
            const ext = guessFileExtension(name, asStr(prop.contentMediaType));
            fields.push([name, `@./input.${ext}`]);
            continue;
        }
        const ex = pickExample(spec, prop);
        if (ex !== undefined)
            fields.push([name, typeof ex === "string" ? ex : String(ex)]);
    }
    return fields;
}

function guessFileExtension(fieldName: string, mediaType: string): string {
    if (mediaType.startsWith("image/")) return mediaType.split("/")[1] || "png";
    if (mediaType.startsWith("audio/")) return mediaType.split("/")[1] || "mp3";
    if (mediaType.startsWith("video/")) return mediaType.split("/")[1] || "mp4";
    if (fieldName.includes("image")) return "png";
    if (fieldName.includes("audio")) return "mp3";
    if (fieldName.includes("video")) return "mp4";
    return "bin";
}

// ────────────────────────────────────────────────────────────────────────────
// Endpoint rendering
// ────────────────────────────────────────────────────────────────────────────

function renderEndpoint(
    spec: Spec,
    method: string,
    path: string,
    op: Operation,
): string {
    const out: string[] = [];
    const summary = asStr(op.summary) || asStr(op.operationId);
    out.push(`#### \`${method.toUpperCase()}\` \`${path}\` — ${summary}`);
    out.push("");

    const desc = asStr(op.description);
    if (desc) {
        out.push(desc);
        out.push("");
    }

    // Parameters
    const params = visibleParams(path, asArr(op.parameters) as Schema[]);
    if (params.length) {
        out.push(CALLOUT.params);
        out.push("");
        out.push(renderParamsTable(spec, params));
        out.push("");
    }

    // Request body
    const reqBody = asObj(op.requestBody);
    const reqContent = asObj(reqBody.content);
    const jsonBody = asObj(reqContent["application/json"]);
    const multipartBody = asObj(reqContent["multipart/form-data"]);
    const bodyContent = jsonBody.schema
        ? jsonBody
        : multipartBody.schema
          ? multipartBody
          : null;
    const bodyMime = jsonBody.schema
        ? "application/json"
        : multipartBody.schema
          ? "multipart/form-data"
          : null;
    if (bodyContent && bodyMime) {
        out.push(`${CALLOUT.body} · \`${bodyMime}\``);
        out.push("");
        const rows = collectRows(spec, asObj(bodyContent.schema));
        if (rows.length) {
            out.push(renderRowsTable(rows));
            out.push("");
        }
    }

    // Responses — render 2xx only (errors are in dedicated section)
    const responses = asObj(op.responses);
    const successCodes = Object.keys(responses).filter((c) =>
        /^2\d{2}$/.test(c),
    );
    for (const code of successCodes) {
        const r = asObj(responses[code]);
        const content = asObj(r.content);
        const mimes = Object.keys(content);
        const respDesc = asStr(r.description);
        if (mimes.length === 0) {
            out.push(`${CALLOUT.response} · \`${code}\` — ${respDesc || "OK"}`);
            out.push("");
            continue;
        }
        // Find a JSON-ish mime to render a schema for; list all mimes inline.
        const primary =
            mimes.find((m) => m.includes("json")) ||
            mimes.find((m) => m.includes("multipart")) ||
            mimes[0];
        const mimeList = mimes.map((m) => `\`${m}\``).join(", ");
        out.push(
            `${CALLOUT.response} · \`${code}\` · ${mimeList}${respDesc ? ` — ${respDesc}` : ""}`,
        );
        out.push("");
        const entry = asObj(content[primary]);
        const schema = asObj(entry.schema);
        const ref = refName(schema);
        if (ref) {
            out.push(`Returns [\`${ref}\`](#${slug(ref)}).`);
            out.push("");
        } else if (Object.keys(schema).length) {
            const rows = collectRows(spec, schema);
            if (rows.length) {
                out.push(renderRowsTable(rows));
                out.push("");
            }
        }
    }

    // Example
    out.push(CALLOUT.example);
    out.push("");
    out.push("```bash");
    out.push(buildCurl(spec, method, path, op));
    out.push("```");
    out.push("");

    // Response example (if we can synthesize one)
    const firstOk = successCodes[0];
    if (firstOk) {
        const r = asObj(responses[firstOk]);
        const jsonResp = asObj(asObj(r.content)["application/json"]);
        if (jsonResp.schema) {
            const ex = pickExample(spec, asObj(jsonResp.schema));
            if (isResponseExampleWorthwhile(ex)) {
                out.push("```json");
                out.push(JSON.stringify(ex, null, 2));
                out.push("```");
                out.push("");
            }
        }
    }

    return out.join("\n");
}

// ────────────────────────────────────────────────────────────────────────────
// Schema component rendering
// ────────────────────────────────────────────────────────────────────────────

function renderSchema(spec: Spec, name: string, schema: Schema): string {
    const out: string[] = [];
    out.push(`### \`${name}\``);
    out.push("");
    const desc = asStr(schema.description);
    if (desc) {
        out.push(desc);
        out.push("");
    }
    const type = asStr(schema.type);
    const enumVals = asArr(schema.enum);
    const union = asArr(schema.oneOf).length
        ? asArr(schema.oneOf)
        : asArr(schema.anyOf);

    if (enumVals.length) {
        out.push(`**Type:** ${formatType(schema)}`);
        out.push("");
    } else if (schema.properties) {
        const rows = collectRows(spec, schema);
        if (rows.length) {
            out.push(renderRowsTable(rows));
            out.push("");
        }
    } else if (union.length) {
        out.push("**Union type.** One of:");
        out.push("");
        for (const variant of union as Schema[]) {
            const v = asObj(variant);
            const vRef = refName(v);
            if (vRef) {
                out.push(`- [\`${vRef}\`](#${slug(vRef)})`);
            } else if (v.properties) {
                const tag = asObj(asObj(v.properties).type);
                const tagConst = tag.const;
                const tagEnum = asArr(tag.enum);
                let label: string;
                if (tagConst !== undefined) label = `\`type: "${tagConst}"\``;
                else if (tagEnum.length) label = `\`type: "${tagEnum[0]}"\``;
                else label = formatType(v);
                const props = Object.keys(asObj(v.properties))
                    .filter((k) => k !== "type")
                    .map((k) => `\`${k}\``)
                    .join(", ");
                out.push(`- ${label}${props ? ` — fields: ${props}` : ""}`);
            } else {
                out.push(`- ${formatType(v)}`);
            }
        }
        out.push("");
    } else if (type) {
        out.push(`**Type:** ${formatType(schema)}`);
        out.push("");
    }
    return out.join("\n");
}

// ────────────────────────────────────────────────────────────────────────────
// Top-level document
// ────────────────────────────────────────────────────────────────────────────

function renderHeader(spec: Spec): string {
    const out: string[] = [];
    // Logo block replaces the text H1. The two SVGs are designed for light/dark
    // backgrounds; GitHub respects prefers-color-scheme on <picture><source>.
    // `alt` carries the semantic title so screen readers and feeds still get it.
    out.push("<picture>");
    out.push(
        '  <source media="(prefers-color-scheme: dark)" srcset="assets/logo-text-white.svg">',
    );
    out.push(
        '  <img alt="Pollinations" src="assets/logo-text-black.svg" width="420">',
    );
    out.push("</picture>");
    out.push("");
    out.push(loadIntroductionTagline());
    out.push("");
    out.push("# API docs");
    out.push("");
    out.push(
        `**Version:** \`${spec.info.version}\` · **OpenAPI:** \`${spec.openapi}\` · **Base URL:** \`${BASE_URL}\``,
    );
    return out.join("\n");
}

function loadIntroductionTagline(): string {
    const introduction = readFileSync(INTRODUCTION_PATH, "utf8");
    const tagline = introduction
        .split("\n")
        .find((line) => line.trim().startsWith(">"))
        ?.trim();
    if (!tagline) {
        throw new Error(`Missing blockquote tagline in ${INTRODUCTION_PATH}`);
    }
    return tagline;
}

function renderGettingStarted(): string {
    return `## ${sectionHeading(SECTIONS.start)}

**1. Get an API key** at [enter.pollinations.ai](https://enter.pollinations.ai). Two key types are available:

- \`sk_*\` — secret key for backend use (full account access)
- \`pk_*\` — publishable key, safe to ship in browsers and mobile apps

**2. Send the key** in the \`Authorization\` header (or as \`?key=\` query param for GET endpoints):

\`\`\`bash
curl ${BASE_URL}/v1/models \\
  -H "Authorization: Bearer $POLLINATIONS_KEY"
\`\`\`

**3. Pick an endpoint** from the [${sectionHeading(SECTIONS.contents)}](#${sectionAnchor(SECTIONS.contents)}) below.

**Integration guides:** [🌸 BYOP](https://gen.pollinations.ai/docs#tag/byop) · [🖥️ CLI](https://gen.pollinations.ai/docs#tag/cli) · [🔌 MCP Server](https://gen.pollinations.ai/docs#tag/mcp-server)`;
}

function renderTableOfContents(
    spec: Spec,
    byTag: Map<string, { method: string; path: string; op: Operation }[]>,
    recipeHeadings: string[],
): string {
    const out: string[] = [];
    out.push(`## ${sectionHeading(SECTIONS.contents)}`);
    out.push("");
    out.push(
        `- [${sectionHeading(SECTIONS.start)}](#${sectionAnchor(SECTIONS.start)})`,
    );
    for (const heading of recipeHeadings) {
        out.push(`- [${heading}](#${slug(heading)})`);
    }
    out.push(
        `- [${sectionHeading(SECTIONS.endpoints)}](#${sectionAnchor(SECTIONS.endpoints)})`,
    );
    for (const tag of byTag.keys()) {
        out.push(`  - [${tag}](#${slug(tag)})`);
    }
    out.push(
        `- [${sectionHeading(SECTIONS.errors)}](#${sectionAnchor(SECTIONS.errors)})`,
    );
    if (Object.keys(asObj(spec.components?.schemas)).length) {
        out.push(
            `- [${sectionHeading(SECTIONS.schemas)}](#${sectionAnchor(SECTIONS.schemas)})`,
        );
    }
    return out.join("\n");
}

/**
 * Load the static recipes markdown (auth, SDK quickstart, streaming, vision,
 * multipart uploads). Returns the raw content plus the H2 headings parsed out
 * of it so the TOC can link to each section.
 */
function loadRecipes(): { content: string; headings: string[] } {
    let content: string;
    try {
        content = readFileSync(RECIPES_PATH, "utf8").trim();
    } catch (err) {
        console.warn(
            `⚠️  Skipping recipes — could not read ${RECIPES_PATH}: ${(err as Error).message}`,
        );
        return { content: "", headings: [] };
    }
    const headings: string[] = [];
    for (const line of content.split("\n")) {
        const m = line.match(/^##\s+(.+)$/);
        if (m) headings.push(m[1].trim());
    }
    return { content, headings };
}

function renderEndpoints(
    spec: Spec,
    byTag: Map<string, { method: string; path: string; op: Operation }[]>,
): string {
    const out: string[] = [];
    out.push(`## ${sectionHeading(SECTIONS.endpoints)}`);
    out.push("");
    for (const [tag, ops] of byTag) {
        out.push(`### ${tag}`);
        out.push("");
        for (const { method, path, op } of ops) {
            out.push(renderEndpoint(spec, method, path, op));
            out.push("---");
            out.push("");
        }
        // Trim trailing rule
        while (out[out.length - 1] === "" || out[out.length - 1] === "---")
            out.pop();
        out.push("");
    }
    return out.join("\n");
}

function renderSchemas(spec: Spec): string {
    const schemas = asObj(spec.components?.schemas);
    const names = Object.keys(schemas);
    if (names.length === 0) return "";
    const out: string[] = [];
    out.push(`## ${sectionHeading(SECTIONS.schemas)}`);
    out.push("");
    out.push(
        "Reusable request/response objects referenced from the endpoints above.",
    );
    out.push("");
    for (const name of names.sort()) {
        out.push(renderSchema(spec, name, asObj(schemas[name])));
    }
    return out.join("\n");
}

function renderErrorResponses(): string {
    return `## ${sectionHeading(SECTIONS.errors)}

All endpoints return errors in this envelope:

\`\`\`json
{
  "status": 400,
  "success": false,
  "error": {
    "code": "BAD_REQUEST",
    "message": "Description of what went wrong",
    "timestamp": "2026-01-01T00:00:00.000Z",
    "details": { "name": "ValidationError" },
    "requestId": "req_abc123"
  }
}
\`\`\`

| Status | Code | Description |
|---|---|---|
| \`400\` | \`BAD_REQUEST\` | Invalid input. \`details\` includes \`formErrors\` and \`fieldErrors\` for validation failures. |
| \`401\` | \`UNAUTHORIZED\` | Missing or invalid API key. Provide via \`Authorization: Bearer <key>\` header or \`?key=<key>\` query param. |
| \`402\` | \`PAYMENT_REQUIRED\` | Insufficient pollen balance or API key budget exhausted. |
| \`403\` | \`FORBIDDEN\` | Access denied — insufficient permissions or tier for this model. |
| \`404\` | \`NOT_FOUND\` | Resource not found. |
| \`405\` | \`METHOD_NOT_ALLOWED\` | HTTP method not supported on this route. |
| \`409\` | \`CONFLICT\` | Request conflicts with current resource state (e.g. duplicate key name). |
| \`422\` | \`UNPROCESSABLE_ENTITY\` | Request was well-formed but semantically invalid — typically a model rejection or unsupported parameter combination. |
| \`429\` | \`RATE_LIMITED\` | Too many requests. Slow down. |
| \`500\` | \`INTERNAL_ERROR\` | Server error. We're on it. |
| \`502\` | \`BAD_GATEWAY\` | Upstream provider returned an unexpected error (auth, billing, content policy). |
| \`503\` | \`SERVICE_UNAVAILABLE\` | Temporarily unavailable — usually the safety/balance check service is degraded. Retry with backoff. |`;
}

// ────────────────────────────────────────────────────────────────────────────
// Spec preprocessing
// ────────────────────────────────────────────────────────────────────────────

/** Replace long enum arrays with a description pointing to /models. */
function simplifyModelEnums(spec: Spec): void {
    for (const methods of Object.values(asObj(spec.paths))) {
        for (const op of Object.values(asObj(methods))) {
            const operation = asObj(op);
            for (const param of asArr(operation.parameters)) {
                const parameter = asObj(param);
                const schema = asObj(parameter.schema);
                const enumValues = asArr(schema.enum);
                if (enumValues.length > 15) {
                    const examples = enumValues.slice(0, 5).join(", ");
                    schema.description = `${asStr(parameter.description) || asStr(parameter.name) || "Model"}. Examples: ${examples}. See /image/models, /text/models, or /audio/models for full list.`;
                    delete schema.enum;
                }
            }
        }
    }
}

/**
 * Curated request-body examples for operations whose schemas are too complex
 * to synthesize a meaningful sample from (deeply nested unions, oneOf variants).
 * Keyed by operationId.
 */
const CURATED_BODIES: Record<string, Json> = {
    postV1ChatCompletions: {
        model: "openai",
        messages: [{ role: "user", content: "Hello!" }],
    },
    postV1ImagesGenerations: {
        prompt: "a serene mountain landscape at sunset",
        model: "flux",
        size: "1024x1024",
    },
    postText: {
        messages: [{ role: "user", content: "Hello!" }],
        model: "openai",
    },
    postAccountKeys: {
        name: "my-app-backend",
        type: "secret",
        allowedModels: ["openai", "flux"],
        pollenBudget: 100,
    },
};

/**
 * Curated path-parameter values for parameters whose schemas don't carry a
 * useful `example`. Used to make every curl example copy-pasteable rather
 * than falling back to `:name`-style placeholders. Keyed by parameter name.
 */
const PATH_PARAM_OVERRIDES: Record<string, string> = {
    hash: "a1b2c3d4e5f60718",
    id: "key_abc123",
};

/**
 * Per-path query parameter visibility filter. The /image and /video routes
 * share a query schema, but each endpoint only actually honours a subset of
 * fields — the others would mislead readers if shown in the parameter table
 * or in the curl example. Listed by exact path; values are the parameter
 * names to suppress.
 */
const PATH_PARAM_BLOCKLIST: Record<string, Set<string>> = {
    "/image/{prompt}": new Set(["duration", "aspectRatio", "audio"]),
    "/video/{prompt}": new Set(["quality", "transparent"]),
};

function visibleParams(path: string, params: Schema[]): Schema[] {
    const blocked = PATH_PARAM_BLOCKLIST[path];
    if (!blocked) return params;
    return params.filter((p) => !blocked.has(asStr(asObj(p).name)));
}

/**
 * Curated multipart fields for operations whose request shapes don't lend
 * themselves to schema-driven synthesis (file uploads, mixed binary+scalar
 * fields). Keyed by operationId.
 */
const CURATED_MULTIPART: Record<string, Array<[string, string]>> = {
    postV1AudioTranscriptions: [
        ["file", "@./audio.mp3"],
        ["model", "whisper-large-v3"],
    ],
    postV1ImagesEdits: [
        ["image", "@./input.png"],
        ["prompt", "make the sky a vivid sunset"],
        ["model", "kontext"],
    ],
    postUpload: [["file", "@./image.png"]],
};

const HTTP_METHODS = new Set([
    "get",
    "post",
    "put",
    "delete",
    "patch",
    "options",
    "head",
    "trace",
]);

/**
 * Canonical tag order. Generation surfaces first (most-used) then supporting
 * resources. Mirrors the Scalar API reference grouping so the two docs read
 * the same. Unknown tags get appended in spec order so a new endpoint never
 * silently disappears — they show up at the end until added here.
 */
const TAG_ORDER = [
    "✍️ Text",
    "🖼️ Image",
    "🎬 Video",
    "🔊 Audio",
    "🎙️ Realtime",
    "🔢 Embeddings",
    "🤖 Models",
    "📦 Media Storage",
    "👤 Account",
];

/** Group operations by tag, then re-key the map to follow TAG_ORDER. */
function groupByTag(
    spec: Spec,
): Map<string, { method: string; path: string; op: Operation }[]> {
    const groups = new Map<
        string,
        { method: string; path: string; op: Operation }[]
    >();
    for (const [path, methods] of Object.entries(asObj(spec.paths))) {
        for (const [method, rawOp] of Object.entries(asObj(methods))) {
            if (!HTTP_METHODS.has(method.toLowerCase())) continue;
            const op = asObj(rawOp);
            const tags = asArr(op.tags) as string[];
            const tag = tags[0] || "Other";
            let bucket = groups.get(tag);
            if (!bucket) {
                bucket = [];
                groups.set(tag, bucket);
            }
            bucket.push({ method, path, op });
        }
    }

    const ordered = new Map<
        string,
        { method: string; path: string; op: Operation }[]
    >();
    for (const tag of TAG_ORDER) {
        const bucket = groups.get(tag);
        if (bucket) {
            ordered.set(tag, bucket);
            groups.delete(tag);
        }
    }
    for (const [tag, bucket] of groups) {
        console.warn(
            `⚠️  Tag "${tag}" not in TAG_ORDER — appended at end. Add it to TAG_ORDER in generate-apidocs.ts.`,
        );
        ordered.set(tag, bucket);
    }
    return ordered;
}

// ────────────────────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────────────────────

async function main() {
    console.log(`Fetching OpenAPI spec from ${OPENAPI_URL}...`);
    const spec = (await fetch(OPENAPI_URL).then((r) => r.json())) as Spec;
    simplifyModelEnums(spec);

    const byTag = groupByTag(spec);
    const recipes = loadRecipes();

    console.log("Rendering markdown...");
    const sections = [
        renderHeader(spec),
        renderGettingStarted(),
        renderTableOfContents(spec, byTag, recipes.headings),
        recipes.content,
        renderEndpoints(spec, byTag),
        renderErrorResponses(),
        renderSchemas(spec),
    ];
    let markdown = sections.filter(Boolean).join("\n\n");
    // Collapse 3+ blank lines to 2
    markdown = markdown.replace(/\n{3,}/g, "\n\n");
    markdown = `${markdown.trimEnd()}\n`;

    writeFileSync(OUTPUT_PATH, markdown);
    console.log(`✅ Saved to ${OUTPUT_PATH}`);
    console.log(
        `   ${markdown.length} bytes, ${markdown.split("\n").length} lines`,
    );
}

main().catch((err) => {
    console.error("❌ Error:", err.message);
    process.exit(1);
});
