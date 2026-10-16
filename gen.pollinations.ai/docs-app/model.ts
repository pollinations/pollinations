import { getExampleFromSchema } from "@scalar/oas-utils/spec-getters";
import { dereference } from "@scalar/openapi-parser";
import { snippetz } from "@scalar/snippetz";
import {
    asArr,
    asObj,
    asStr,
    collectExtras,
    collectRows,
    deref,
    formatType,
    type Json,
    type Row,
    type Schema,
    type Spec,
    slug,
} from "../scripts/openapi-fields.ts";

// The docs read the same merged schema Scalar renders, so the words match it.
export const SCHEMA_URL = "/docs/open-api/generate-schema";

export type Block =
    | { kind: "markdown"; text: string }
    | { kind: "video"; src: string };
export type Section = { id: string; title: string; blocks: Block[] };
export type Field = Row & { location?: string };
export type Sample = { label: string; source: string };
export type Operation = {
    id: string;
    method: string;
    path: string;
    summary: string;
    description: Block[];
    deprecated: boolean;
    auth: boolean;
    parameters: Field[];
    body?: {
        type: string;
        fields: Row[];
        variants: { label: string; fields: Row[] }[];
    };
    responses: { status: string; description: string; types: string[] }[];
    samples: Sample[];
    responseExample?: string;
};
export type Page = {
    id: string;
    title: string;
    intro: Block[];
    sections: Section[];
    operations: Operation[];
};
export type Docs = {
    introduction: Page;
    groups: { name: string; pages: Page[] }[];
};

const METHODS = ["get", "put", "post", "patch", "delete", "head"];

/**
 * The renderer does not parse HTML, so the GitHub-flavoured screenshots and
 * the CLI video become blocks it can show. Wording is untouched.
 */
function blocks(markdown: string): Block[] {
    const images = markdown.replace(
        /<p[^>]*>\s*(<img\s[^>]*>)\s*<\/p>|<img\s[^>]*>/g,
        (match, inner = match) => {
            const attribute = (name: string) =>
                inner.match(new RegExp(`${name}="([^"]*)"`))?.[1] ?? "";
            return `![${attribute("alt")}](${attribute("src")})`;
        },
    );
    const parts: Block[] = [];
    let rest = images;
    for (const match of images.matchAll(
        /<video\s[^>]*src="([^"]+)"[^>]*>[\s\S]*?<\/video>/g,
    )) {
        const [before, after] = splitOnce(rest, match[0]);
        if (before.trim())
            parts.push({ kind: "markdown", text: before.trim() });
        parts.push({ kind: "video", src: match[1] });
        rest = after;
    }
    if (rest.trim()) parts.push({ kind: "markdown", text: rest.trim() });
    return parts;
}

function splitOnce(text: string, separator: string): [string, string] {
    const index = text.indexOf(separator);
    return [text.slice(0, index), text.slice(index + separator.length)];
}

/** Splits a description at its `## ` headings, outside fenced code. */
function sections(markdown: string) {
    const parts = [{ title: "", lines: [] as string[] }];
    let fenced = false;
    for (const line of markdown.split("\n")) {
        if (line.startsWith("```")) fenced = !fenced;
        if (!fenced && line.startsWith("## ")) {
            parts.push({ title: line.slice(3).trim(), lines: [] });
        } else {
            parts[parts.length - 1].lines.push(line);
        }
    }
    const [head, ...rest] = parts;
    const seen = new Set<string>();
    return {
        intro: blocks(head.lines.join("\n")),
        sections: rest.map(({ title, lines }) => {
            let id = slug(title).replace(/^-+/, "") || "section";
            while (seen.has(id)) id += "-2";
            seen.add(id);
            return { id, title, blocks: blocks(lines.join("\n")) };
        }),
    };
}

// Model types render as plain names: the docs have no models section to link to.
const typeOf = (schema: Schema | undefined) =>
    formatType(schema).replace(/\[(`[^`]+`)\]\(#[^)]*\)/g, "$1");
const plainRows = (rows: Row[]) =>
    rows.map((row) => ({
        ...row,
        type: row.type.replace(/\[(`[^`]+`)\]\(#[^)]*\)/g, "$1"),
    }));

function bodyOf(spec: Spec, op: Json) {
    const content = asObj(deref(spec, asObj(op.requestBody)).content);
    const type =
        ["application/json", "multipart/form-data"].find((t) => content[t]) ??
        Object.keys(content)[0];
    if (!type) return undefined;
    const schema = deref(spec, asObj(asObj(content[type]).schema));
    const variants = asArr(schema.oneOf ?? schema.anyOf).map((variant) =>
        deref(spec, asObj(variant)),
    );
    const tables = variants.map((variant) => collectRows(spec, variant));
    // Fields every alternative shares show once; each alternative lists the rest.
    const shared = (tables[0] ?? []).filter((row) =>
        tables.every((table) =>
            table.some(
                (other) => JSON.stringify(other) === JSON.stringify(row),
            ),
        ),
    );
    const sharedNames = new Set(shared.map((row) => row.name));
    const discriminator = Object.keys(asObj(variants[0]?.properties)).find(
        (name) => {
            const values = variants.map((variant) => {
                const prop = asObj(asObj(variant.properties)[name]);
                return prop.const === undefined
                    ? asArr(prop.enum)
                    : [prop.const];
            });
            const all = values.flat().map((value) => JSON.stringify(value));
            return (
                values.every((group) => group.length > 0) &&
                new Set(all).size === all.length
            );
        },
    );
    return {
        type,
        fields: plainRows([...collectRows(spec, schema), ...shared]),
        variants: variants.map((variant, index) => ({
            label: discriminator
                ? `\`${discriminator}\`: ${typeOf(asObj(asObj(variant.properties)[discriminator]))}`
                : `Alternative ${index + 1}`,
            fields: plainRows(
                tables[index].filter((row) => !sharedNames.has(row.name)),
            ),
        })),
    };
}

function example(media: Json, schema: Schema | undefined): unknown {
    if (media.example !== undefined) return media.example;
    const named = Object.values(asObj(media.examples))[0];
    if (named !== undefined) return asObj(named).value;
    return schema ? getExampleFromSchema(schema, { mode: "write" }) : undefined;
}

const generatedClients = [
    { label: "cURL", target: "shell", client: "curl" },
    { label: "JavaScript", target: "js", client: "fetch" },
    { label: "Python", target: "python", client: "requests" },
] as const;

function samplesOf(
    resolved: Json,
    op: Json,
    server: string,
    path: string,
    auth: boolean,
): Sample[] {
    // gen's own samples come first, exactly as the current docs show them.
    const custom = asArr(op["x-codeSamples"]).map((raw) => ({
        label: asStr(asObj(raw).label, "Example"),
        source: asStr(asObj(raw).source),
    }));
    const params = asArr(op.parameters).map((p) => asObj(p));
    const value = (p: Json) =>
        asObj(p.schema).example ??
        p.example ??
        getExampleFromSchema(asObj(p.schema));
    const url = new URL(
        server +
            path.replace(/{(\w+)}/g, (match, name) => {
                const param = params.find(
                    (p) => p.in === "path" && p.name === name,
                );
                const v = param && value(param);
                return v === undefined || v === null || v === ""
                    ? match
                    : encodeURIComponent(String(v));
            }),
    );
    for (const p of params.filter((p) => p.in === "query" && p.required)) {
        const v = value(p);
        if (v !== undefined && v !== null)
            url.searchParams.set(asStr(p.name), String(v));
    }
    const content = asObj(asObj(resolved.requestBody).content);
    const jsonBody = asObj(content["application/json"]);
    const body = content["application/json"]
        ? example(jsonBody, asObj(jsonBody.schema))
        : undefined;
    const headers = [
        ...(auth
            ? [{ name: "Authorization", value: "Bearer YOUR_API_KEY" }]
            : []),
        ...(body !== undefined
            ? [{ name: "Content-Type", value: "application/json" }]
            : []),
    ];
    const request = {
        method: asStr(op.method, "GET").toUpperCase(),
        url: decodeURI(url.toString()),
        headers,
        ...(body !== undefined && {
            postData: {
                mimeType: "application/json",
                text: JSON.stringify(body, null, 2),
            },
        }),
    };
    const labels = new Set(custom.map((sample) => sample.label));
    const generated = generatedClients
        .filter(({ label }) => !labels.has(label))
        .map(({ label, target, client }) => ({
            label,
            source: snippetz().print(target, client, request) ?? "",
        }))
        .filter((sample) => sample.source);
    return [...custom, ...generated];
}

function responseExample(resolved: Json): string | undefined {
    for (const [status, raw] of Object.entries(asObj(resolved.responses))) {
        if (!/^2\d\d$/.test(status)) continue;
        const media = asObj(asObj(asObj(raw).content)["application/json"]);
        if (!Object.keys(media).length) continue;
        const value = example(media, asObj(media.schema));
        if (value !== undefined) return JSON.stringify(value, null, 2);
    }
    return undefined;
}

function operationOf(
    spec: Spec,
    resolvedSpec: Json,
    path: string,
    method: string,
    tagId: string,
): Operation {
    const item = asObj(spec.paths[path]);
    const op = asObj(item[method]);
    const resolvedItem = asObj(asObj(resolvedSpec.paths)[path]);
    const resolved = asObj(resolvedItem[method]);
    const security = op.security ?? (spec as Json).security;
    const auth = asArr(security).some((req) => Object.keys(asObj(req)).length);
    const server = asStr(
        asObj(asArr(op.servers ?? item.servers ?? spec.servers)[0]).url,
        "https://gen.pollinations.ai",
    );
    const parameters = [...asArr(item.parameters), ...asArr(op.parameters)]
        .map((raw) => deref(spec, asObj(raw)))
        .map((p) => ({
            name: asStr(p.name),
            location: asStr(p.in),
            type: typeOf(deref(spec, asObj(p.schema))),
            required: p.required === true,
            description: asStr(p.description),
            extras: collectExtras(asObj(p.schema)),
        }));
    return {
        // Same anchors as the current docs: #tag/text/POST/v1/chat/completions
        id: `${tagId}/${method.toUpperCase()}${path}`,
        method: method.toUpperCase(),
        path,
        summary: asStr(op.summary, `${method.toUpperCase()} ${path}`),
        description: blocks(asStr(op.description)),
        deprecated: op.deprecated === true,
        auth,
        parameters,
        body: bodyOf(spec, op),
        responses: Object.entries(asObj(op.responses)).map(([status, raw]) => {
            const response = deref(spec, asObj(raw));
            return {
                status,
                description: asStr(response.description),
                types: Object.keys(asObj(response.content)),
            };
        }),
        samples: samplesOf(
            { ...resolved, requestBody: resolved.requestBody },
            { ...resolved, method },
            server,
            path,
            auth,
        ),
        responseExample: responseExample(resolved),
    };
}

export function tagId(name: string): string {
    return `tag/${name.toLowerCase().trim().replace(/\s+/g, "-")}`;
}

export function buildDocs(raw: Json): Docs {
    const spec = raw as unknown as Spec;
    const resolvedSpec = asObj(dereference(raw).schema);
    const tags = new Map(
        (spec.tags ?? []).map((tag) => [tag.name, asStr(tag.description)]),
    );
    const operationsByTag = new Map<string, Operation[]>();
    for (const [path, item] of Object.entries(spec.paths)) {
        for (const method of METHODS) {
            const op = asObj(asObj(item)[method]);
            const tag = asStr(asArr(op.tags)[0]);
            if (!tag) continue;
            const list = operationsByTag.get(tag) ?? [];
            list.push(
                operationOf(spec, resolvedSpec, path, method, tagId(tag)),
            );
            operationsByTag.set(tag, list);
        }
    }
    const pageOf = (name: string): Page => ({
        id: tagId(name),
        title: name,
        ...sections(tags.get(name) ?? ""),
        operations: operationsByTag.get(name) ?? [],
    });
    const groups = asArr((raw as Json)["x-tagGroups"]).map((group) => ({
        name: asStr(asObj(group).name),
        pages: asArr(asObj(group).tags).map((name) => pageOf(asStr(name))),
    }));
    return {
        introduction: {
            id: "introduction",
            title: spec.info.title,
            ...sections(spec.info.description),
            operations: [],
        },
        groups,
    };
}
