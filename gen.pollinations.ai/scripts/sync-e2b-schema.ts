// Refreshes the Sandboxes API reference from E2B's spec: keeps the
// operations e2b.ts serves, applies Pollinations' differences, and writes a
// snapshot the docs read. Run it and review the diff when E2B changes:
//   npx tsx scripts/sync-e2b-schema.ts
import { writeFileSync } from "node:fs";
import { parse } from "yaml";

type ObjectValue = Record<string, unknown>;
const object = (value: unknown) => value as ObjectValue;
const E2B_REPO = "e2b-dev/E2B";
const E2B_SPEC = "spec/openapi.yml";
const SNAPSHOT = new URL("../src/docs/e2b-sandboxes.json", import.meta.url);

// Only operations served by e2b.ts. New upstream endpoints stay private.
const OPERATIONS: Record<string, string[]> = {
    "/sandboxes": ["post"],
    "/v2/sandboxes": ["post", "get"],
    "/sandboxes/{sandboxID}": ["get", "delete"],
    "/sandboxes/{sandboxID}/connect": ["post"],
    "/v2/sandboxes/{sandboxID}/connect": ["post"],
    "/sandboxes/{sandboxID}/pause": ["post"],
    "/sandboxes/{sandboxID}/timeout": ["post"],
    "/sandboxes/{sandboxID}/metrics": ["get"],
    "/sandboxes/{sandboxID}/logs": ["get"],
    "/sandboxes/{sandboxID}/network": ["put"],
};
const ACCESS =
    "Requires a Pollinations secret key with `account:machines` permission. Only your own sandboxes are accessible.";
const RUNTIME =
    "Runtime is prepaid in credits, with no refund of unused time. Timeouts above 600 seconds renew in 10-minute windows until the requested deadline, subject to credits and key validity.";

export function filterE2bSchema(input: unknown) {
    const upstream = structuredClone(object(input));
    if (!/^3\.0\.\d+$/.test(String(upstream.openapi)))
        throw new Error("Unexpected E2B schema version");
    const sourceComponents = object(upstream.components);
    const schemas = object(sourceComponents.schemas);
    const properties = (name: string) =>
        object(object(schemas[name]).properties);
    for (const name of ["NewSandbox", "NewSandboxV2"]) {
        const props = properties(name);
        for (const field of ["autoResume", "iam", "volumeMounts", "secure"])
            delete props[field];
        object(props.autoPause).default = true;
        object(schemas[name]).example = {
            templateID: "pollinations",
            timeout: 600,
        };
    }
    // Connect consumes only timeout; the other E2B options are not forwarded.
    for (const name of ["ConnectSandbox", "ConnectSandboxV2"]) {
        const schema = object(schemas[name]);
        const timeout = object(properties(name).timeout);
        timeout.default = 300;
        schema.properties = { timeout };
        delete schema.required;
        schema.example = { timeout: 600 };
    }
    for (const name of ["ListedSandbox", "SandboxDetail"]) {
        object(properties(name).endAt).description =
            "Requested deadline when ongoing renewal is enabled; otherwise the current lease end.";
    }

    object(schemas.SandboxTimeoutRequest).example = { timeout: 600 };
    object(schemas.SandboxPauseRequest).example = { memory: true };
    object(schemas.SandboxNetworkUpdateConfig).example = {
        denyOut: ["0.0.0.0/0"],
        allowOut: ["gen.pollinations.ai"],
    };
    object(
        object(object(sourceComponents.parameters).sandboxID).schema,
    ).example = "example-sandbox";

    const paths: ObjectValue = {};
    for (const [path, methods] of Object.entries(OPERATIONS)) {
        const item = object(object(upstream.paths)[path]);
        const selected: ObjectValue = {};
        if (item?.parameters) selected.parameters = item.parameters;
        for (const method of methods) {
            if (!item?.[method])
                throw new Error(`Missing E2B operation: ${method} ${path}`);
            const op = object(item[method]);
            delete op.servers;
            delete op.callbacks;
            op.tags = ["Sandboxes API"];
            op.security = [{ bearerAuth: [] }];
            const notes = [
                path.endsWith("/logs")
                    ? "Read sandbox system logs. Pollinations supports this legacy logs endpoint; v2 logs are unavailable."
                    : op.description,
                ACCESS,
            ];
            if (method === "post" && path.endsWith("sandboxes")) {
                notes.push(
                    RUNTIME,
                    "Auto-pause defaults to true and secured access is enforced. Enabled auto-resume, IAM configuration and nonempty volume mounts are unsupported.",
                );
            } else if (path.endsWith("/connect")) {
                object(op.requestBody).required = false;
                notes.push(
                    RUNTIME,
                    "Only timeout is forwarded (default: 300 seconds). Connect never shortens a lease.",
                );
            } else if (path.endsWith("/timeout")) {
                notes.push(
                    RUNTIME,
                    "Timeouts of 600 seconds or less end ongoing renewal. Use connect to resume a paused sandbox.",
                );
            } else if (method === "delete" || path.endsWith("/pause")) {
                notes.push(
                    "Ends ongoing renewal. Unused prepaid credits are not refunded.",
                );
                if (method === "delete")
                    notes.push(
                        "A dedicated API key created for a Pollinations template remains until separately revoked.",
                    );
            }
            op.description = notes.filter(Boolean).join("\n\n");
            op.responses = {
                ...object(op.responses),
                402: {
                    description:
                        "Insufficient credits or key budget for prepaid runtime.",
                },
                403: {
                    description:
                        "Missing account:machines permission or access denied.",
                },
                ...(path.includes("{sandboxID}") && {
                    404: {
                        description:
                            "Sandbox not found or owned by another user.",
                    },
                }),
            };
            selected[method] = op;
        }
        paths[`/alpha/e2b${path}`] = selected;
    }

    // Copy only referenced components, namespace them, and adapt OAS 3.0
    // nullable schemas to our OAS 3.1 document. Preserve cycles as references.
    const components: Record<string, ObjectValue> = {};
    function copy(value: unknown): unknown {
        if (Array.isArray(value)) return value.map(copy);
        if (!value || typeof value !== "object") return value;
        const result: ObjectValue = {};
        for (const [key, child] of Object.entries(value)) {
            if (key === "$ref") {
                const match = /^#\/components\/([^/]+)\/([^/]+)$/.exec(
                    String(child),
                );
                if (!match)
                    throw new Error(`Unsupported E2B reference: ${child}`);
                const [, group, name] = match;
                const target = object(sourceComponents[group])?.[name];
                if (!target) throw new Error(`Missing E2B reference: ${child}`);
                const namespaced = `E2B_${name}`;
                components[group] ??= {};
                if (!(namespaced in components[group])) {
                    components[group][namespaced] = {};
                    components[group][namespaced] = copy(target);
                }
                result.$ref = `#/components/${group}/${namespaced}`;
            } else if (key !== "nullable" || typeof child !== "boolean") {
                result[key] = copy(child);
            }
        }
        if (object(value).nullable === true)
            return { anyOf: [result, { type: "null" }] };
        return result;
    }
    return { paths: object(copy(paths)), components };
}

async function main() {
    // Pin the snapshot to the commit it came from, so a refresh diff shows
    // exactly which upstream version it reflects.
    const commits = await fetch(
        `https://api.github.com/repos/${E2B_REPO}/commits?path=${E2B_SPEC}&per_page=1`,
    );
    if (!commits.ok) throw new Error(`GitHub commits: ${commits.status}`);
    const [{ sha }] = (await commits.json()) as { sha: string }[];
    const source = `https://raw.githubusercontent.com/${E2B_REPO}/${sha}/${E2B_SPEC}`;
    const response = await fetch(source);
    if (!response.ok) throw new Error(`E2B spec: ${response.status}`);
    const schema = filterE2bSchema(parse(await response.text()));
    writeFileSync(
        SNAPSHOT,
        `${JSON.stringify({ source, ...schema }, null, 4)}\n`,
    );
    console.log(
        `Wrote ${Object.keys(schema.paths).length} paths from ${source}`,
    );
}

if (import.meta.main) await main();
