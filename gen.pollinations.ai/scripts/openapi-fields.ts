/**
 * OpenAPI field helpers shared by the APIDOCS.md generator and the docs app.
 * Pure functions: no Node APIs, so the browser bundle can import them.
 */

export type Json = Record<string, unknown>;
export type Schema = Json;
export type Operation = Json;
export type Spec = {
    info: { title: string; description: string; version: string };
    openapi: string;
    servers: { url: string }[];
    tags?: { name: string; description?: string }[];
    paths: Record<string, Record<string, Operation>>;
    components: { schemas: Record<string, Schema> };
    "x-schema-sources"?: Record<string, boolean>;
};

// ────────────────────────────────────────────────────────────────────────────
// Spec helpers
// ────────────────────────────────────────────────────────────────────────────

export function asObj(v: unknown): Json {
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {};
}
export function asArr(v: unknown): unknown[] {
    return Array.isArray(v) ? v : [];
}
export function asStr(v: unknown, fallback = ""): string {
    return typeof v === "string" ? v : fallback;
}

export function deref(spec: Spec, schema: Schema): Schema {
    const ref = asStr(schema?.$ref);
    if (!ref) return schema;
    const parts = ref.replace(/^#\//, "").split("/");
    let cur: unknown = spec;
    for (const p of parts) cur = asObj(cur)[p];
    return asObj(cur);
}

export function refName(schema: Schema): string | null {
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
export function slug(s: string): string {
    return s
        .toLowerCase()
        .replace(/[^\p{Letter}\p{Number}\s_-]/gu, "")
        .replace(/\s+/g, "-");
}

// ────────────────────────────────────────────────────────────────────────────
// Type formatting
// ────────────────────────────────────────────────────────────────────────────

export function formatType(schema: Schema | undefined): string {
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

export type Row = {
    name: string;
    type: string;
    required: boolean;
    description: string;
    extras: string[];
};

const JS_MAX_INT = 9007199254740991;
const JS_MIN_INT = -9007199254740991;

export function collectExtras(prop: Schema): string[] {
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

export function collectRows(
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
