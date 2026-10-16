import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
    buildUrl,
    createMCPResponse,
    createTextContent,
    fetchWithAuth,
    parseApiError,
} from "../../packages/mcp/src/utils/coreUtils.js";

// Single canonical catalog surface (Sol condition: one verified surface).
export const CATALOG_PATH = "/v1/models";
// Bounds: fetch duration, retries, catalog size.
export const FETCH_TIMEOUT_MS = 15_000;
export const MAX_ATTEMPTS = 2;
export const MAX_MODELS = 5_000;

// Authoritative structured fields compared by diff_catalog. Volatile `health`
// (refreshed ~60s) and derived `tags` are excluded to avoid noisy diffs.
export const COMPARABLE_FIELDS = [
    "title",
    "description",
    "owned_by",
    "aliases",
    "category",
    "community",
    "agent",
    "paid_only",
    "base_model",
    "pricing",
    "capabilities",
    "supported_endpoints",
    "input_modalities",
    "output_modalities",
    "supported_parameters",
    "tools",
    "reasoning",
    "supports_streaming",
    "context_length",
    "created",
];

export const HISTORY_NOTE =
    "Snapshot-to-snapshot comparison of caller-supplied baseline vs freshly " +
    "fetched catalog; not instantaneous truth. No history is retained server-side.";

export class CatalogError extends Error {
    constructor(status, message) {
        super(message);
        this.name = "CatalogError";
        this.status = status;
    }
}

function sortedCopy(value) {
    return canonicalize(value);
}

// Canonicalize arrays for deterministic comparison. Scope is deliberately
// narrow: only arrays that ARE a field value are order-normalized (string
// arrays sort alphabetically; arrays of objects sort by stable
// serialization). Plain objects are left as-is (stableStringify sorts keys
// at compare time), so arrays nested INSIDE an object-valued field keep
// their order and compare order-sensitively. Verified against the live
// catalog (350 entries): no object-valued comparable field currently holds
// nested arrays (pricing is a flat scalar map; reasoning/tools are
// booleans), so this limitation changes nothing on real data — but a
// future nested list reorder would report a field change rather than
// silently normalizing away a possibly-meaningful order.
function canonicalize(value) {
    if (!Array.isArray(value)) return value;
    const items = value.map((item) =>
        Array.isArray(item) ? canonicalize(item) : item,
    );
    if (items.every((item) => typeof item === "string")) {
        return [...items].sort();
    }
    return [...items].sort((a, b) => {
        const left = stableStringify(a);
        const right = stableStringify(b);
        return left < right ? -1 : left > right ? 1 : 0;
    });
}

export function stableStringify(value) {
    if (Array.isArray(value)) {
        return `[${value.map(stableStringify).join(",")}]`;
    }
    if (value !== null && typeof value === "object") {
        const entries = Object.entries(value)
            .filter(([, v]) => v !== undefined)
            .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
            .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
        return `{${entries.join(",")}}`;
    }
    return JSON.stringify(value) ?? "null";
}

// Normalize one raw /v1/models entry. Returns null when the entry has no
// usable string id (counted as skipped, never silently dropped into a diff).
export function normalizeModel(entry) {
    if (!entry || typeof entry !== "object") return null;
    if (typeof entry.id !== "string" || entry.id.length === 0) return null;
    const model = { id: entry.id };
    for (const field of COMPARABLE_FIELDS) {
        if (entry[field] !== undefined) {
            model[field] = sortedCopy(entry[field]);
        }
    }
    return model;
}

// Normalize a raw catalog payload. Throws (never returns an empty catalog)
// so a failed or structurally invalid fetch can never manufacture removals.
export function normalizeCatalog(raw) {
    if (!raw || typeof raw !== "object" || !Array.isArray(raw.data)) {
        throw new CatalogError(
            "invalid_catalog",
            "Catalog response is not an OpenAI-compatible list ({object: 'list', data: [...]}).",
        );
    }
    const data = raw.data;
    if (data.length > MAX_MODELS) {
        throw new CatalogError(
            "catalog_too_large",
            `Catalog has ${data.length} entries, above the ${MAX_MODELS} bound.`,
        );
    }
    const models = [];
    const seenIds = new Set();
    let skipped = 0;
    for (const entry of data) {
        const model = normalizeModel(entry);
        if (!model) {
            skipped++;
            continue;
        }
        // Duplicate ids would collapse in the diff Map while model_count
        // counts them: fail loudly instead of emitting a misleading diff.
        if (seenIds.has(model.id)) {
            throw new CatalogError(
                "invalid_catalog",
                `Catalog contains duplicate model id "${model.id}".`,
            );
        }
        seenIds.add(model.id);
        models.push(model);
    }
    if (models.length === 0) {
        throw new CatalogError(
            "catalog_empty",
            "Fresh catalog contains zero usable models; refusing to emit an empty snapshot (it would manufacture mass removals).",
        );
    }
    models.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return { models, skipped };
}

export async function snapshotId(models) {
    const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(stableStringify(models)),
    );
    return [...new Uint8Array(digest)]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
}

export async function buildSnapshot(raw, meta) {
    const { models, skipped } = normalizeCatalog(raw);
    return {
        snapshot_id: await snapshotId(models),
        source: meta.source,
        observed_at: meta.observedAt,
        model_count: models.length,
        models,
        ...(skipped > 0 ? { skipped_invalid_entries: skipped } : {}),
    };
}

function isRetryableStatus(status) {
    return status >= 500;
}

async function fetchCatalogRaw(context) {
    let lastError = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
            const response = await fetchWithAuth(
                buildUrl(CATALOG_PATH),
                {
                    headers: { Accept: "application/json" },
                    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
                },
                context,
            );
            if (!response.ok) {
                const body = await response.text().catch(() => "");
                if (
                    isRetryableStatus(response.status) &&
                    attempt < MAX_ATTEMPTS
                ) {
                    lastError = new Error(parseApiError(response.status, body));
                    continue;
                }
                throw new CatalogError(
                    "fetch_failed",
                    parseApiError(response.status, body),
                );
            }
            return await response.json();
        } catch (error) {
            if (error instanceof CatalogError) throw error;
            lastError = error;
            // Retry once on network/timeout errors; 4xx and parse errors fail fast.
            const retryable =
                error instanceof TypeError ||
                (error instanceof Error && error.name === "TimeoutError");
            if (retryable && attempt < MAX_ATTEMPTS) continue;
            throw new CatalogError(
                "fetch_failed",
                error instanceof Error ? error.message : String(error),
            );
        }
    }
    throw new CatalogError(
        "fetch_failed",
        lastError instanceof Error ? lastError.message : String(lastError),
    );
}

export async function fetchCatalogSnapshot(context) {
    const raw = await fetchCatalogRaw(context);
    // Observation time is stamped after a successful fetch+parse.
    return buildSnapshot(raw, {
        source: buildUrl(CATALOG_PATH),
        observedAt: new Date().toISOString(),
    });
}

export function validateBaseline(value) {
    if (!value || typeof value !== "object") {
        return { ok: false, reason: "baseline must be an object" };
    }
    if (
        typeof value.snapshot_id !== "string" ||
        value.snapshot_id.length === 0
    ) {
        return {
            ok: false,
            reason: "baseline.snapshot_id must be a non-empty string",
        };
    }
    if (typeof value.source !== "string" || value.source.length === 0) {
        return {
            ok: false,
            reason: "baseline.source must be a non-empty string",
        };
    }
    if (
        typeof value.observed_at !== "string" ||
        value.observed_at.length === 0
    ) {
        return {
            ok: false,
            reason: "baseline.observed_at must be a non-empty string",
        };
    }
    if (!Array.isArray(value.models) || value.models.length === 0) {
        return {
            ok: false,
            reason: "baseline.models must be a non-empty array (an empty baseline cannot distinguish anything)",
        };
    }
    // Bound caller-supplied input like the fresh side: an unbounded baseline
    // burns CPU for free under downstream billing.
    if (value.models.length > MAX_MODELS) {
        return {
            ok: false,
            reason: `baseline.models has ${value.models.length} entries, above the ${MAX_MODELS} bound`,
        };
    }
    const models = [];
    const seenIds = new Set();
    for (const entry of value.models) {
        const model = normalizeModel(entry);
        if (!model) {
            return {
                ok: false,
                reason: "baseline.models entries must each have a string id",
            };
        }
        if (seenIds.has(model.id)) {
            return {
                ok: false,
                reason: `baseline.models contains duplicate model id "${model.id}"`,
            };
        }
        seenIds.add(model.id);
        models.push(model);
    }
    return {
        ok: true,
        snapshot: {
            snapshot_id: value.snapshot_id,
            source: value.source,
            observed_at: value.observed_at,
            models,
        },
    };
}

// Validate and canonicalize the fields subset BEFORE any upstream fetch so
// a bad `fields` argument never burns a catalog request. Throws
// CatalogError(unknown_diff_field).
export function resolveDiffFields(fields) {
    if (fields === undefined) return COMPARABLE_FIELDS;
    if (!Array.isArray(fields) || fields.length === 0) {
        throw new CatalogError(
            "unknown_diff_field",
            `fields must be a non-empty array. Allowed: ${COMPARABLE_FIELDS.join(", ")}.`,
        );
    }
    if (fields.length > COMPARABLE_FIELDS.length) {
        throw new CatalogError(
            "unknown_diff_field",
            `fields has ${fields.length} entries, at most ${COMPARABLE_FIELDS.length} distinct allowed fields.`,
        );
    }
    const deduped = [...new Set(fields)];
    for (const field of deduped) {
        if (!COMPARABLE_FIELDS.includes(field)) {
            throw new CatalogError(
                "unknown_diff_field",
                `Unknown diff field "${field}". Allowed: ${COMPARABLE_FIELDS.join(", ")}.`,
            );
        }
    }
    return deduped;
}

export function diffSnapshots(baseline, current, options = {}) {
    const fields = resolveDiffFields(options.fields);
    const before = new Map(baseline.models.map((m) => [m.id, m]));
    const after = new Map(current.models.map((m) => [m.id, m]));
    const added = [];
    const removed = [];
    const changed = [];
    for (const [id, model] of after) {
        if (!before.has(id)) added.push(model);
    }
    for (const [id, model] of before) {
        if (!after.has(id)) removed.push(model);
    }
    for (const [id, oldModel] of before) {
        const newModel = after.get(id);
        if (!newModel) continue;
        const changes = [];
        for (const field of fields) {
            const left = field in oldModel ? oldModel[field] : undefined;
            const right = field in newModel ? newModel[field] : undefined;
            if (stableStringify(left) !== stableStringify(right)) {
                changes.push({ field, baseline: left, current: right });
            }
        }
        if (changes.length > 0) changed.push({ id, changes });
    }
    const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    added.sort(byId);
    removed.sort(byId);
    changed.sort(byId);
    return {
        status: "ok",
        baseline: {
            snapshot_id: baseline.snapshot_id,
            observed_at: baseline.observed_at,
            model_count: baseline.models.length,
        },
        current: {
            snapshot_id: current.snapshot_id,
            observed_at: current.observed_at,
            source: current.source,
            model_count: current.model_count,
        },
        added,
        removed,
        changed,
        counts: {
            added: added.length,
            removed: removed.length,
            changed: changed.length,
        },
        history: HISTORY_NOTE,
        history_unavailable: false,
    };
}

function errorResult(status, message, extra = {}) {
    return {
        content: [
            {
                type: "text",
                text: JSON.stringify({ status, message, ...extra }, null, 2),
            },
        ],
        isError: true,
    };
}

function buildServer() {
    const server = new McpServer(
        {
            name: "catalog-diff-mcp",
            title: "Catalog Diff MCP",
            version: "0.1.0",
        },
        { capabilities: { tools: {} } },
    );
    server.registerTool(
        "get_catalog",
        {
            description:
                "Fetch the live Pollinations model catalog (/v1/models) and return a " +
                "normalized, timestamped snapshot (snapshot_id, source, observed_at, models). " +
                "No history is retained; pass the snapshot back to diff_catalog as a baseline.",
            inputSchema: z.object({}),
        },
        async (_args, context) => {
            try {
                const snapshot = await fetchCatalogSnapshot(context);
                return createMCPResponse([createTextContent(snapshot, true)]);
            } catch (error) {
                if (error instanceof CatalogError) {
                    return errorResult(error.status, error.message);
                }
                throw error;
            }
        },
    );
    server.registerTool(
        "diff_catalog",
        {
            description:
                "Compare a caller-supplied baseline snapshot (from get_catalog) against a " +
                "freshly fetched catalog. Returns added models, removed models, and " +
                "field-level changes. Returns history_unavailable when the baseline is " +
                "unusable; never substitutes another baseline silently.",
            inputSchema: z.object({
                baseline: z.unknown(),
                fields: z.array(z.string()).optional(),
            }),
        },
        async (args, context) => {
            const checked = validateBaseline(args.baseline);
            if (!checked.ok) {
                return errorResult("history_unavailable", checked.reason, {
                    history: HISTORY_NOTE,
                    history_unavailable: true,
                });
            }
            try {
                // Validate fields before the upstream fetch so a bad subset
                // never burns a catalog request.
                const fields = resolveDiffFields(args.fields);
                const current = await fetchCatalogSnapshot(context);
                const diff = diffSnapshots(checked.snapshot, current, {
                    fields,
                });
                return createMCPResponse([createTextContent(diff, true)]);
            } catch (error) {
                if (error instanceof CatalogError) {
                    return errorResult(error.status, error.message, {
                        baseline: {
                            snapshot_id: checked.snapshot.snapshot_id,
                            observed_at: checked.snapshot.observed_at,
                        },
                    });
                }
                throw error;
            }
        },
    );
    return server;
}

const mcpHandler = createMcpHandler(() => buildServer(), {
    legacy: "stateless",
    onerror: (error) => console.error(error),
});

function readBearerToken(request) {
    const authorization = request.headers.get("authorization");
    if (!authorization) return null;

    const [scheme, token] = authorization.trim().split(/\s+/, 2);
    if (scheme?.toLowerCase() !== "bearer" || !token) {
        return null;
    }
    return token;
}

function unauthorizedResponse() {
    return Response.json(
        {
            error: "unauthorized",
            message: "Send a Pollinations API key as a bearer token.",
        },
        {
            status: 401,
            headers: {
                "WWW-Authenticate":
                    'Bearer realm="catalog-diff-mcp.pollinations.ai"',
            },
        },
    );
}

export default {
    async fetch(request) {
        const url = new URL(request.url);

        if (url.pathname === "/health" && request.method === "GET") {
            return Response.json({
                name: "catalog-diff-mcp",
                transport: "streamable-http",
                endpoint: "/",
                stateless: true,
            });
        }

        if (url.pathname !== "/") {
            return new Response("Not found", { status: 404 });
        }

        const token = readBearerToken(request);
        if (!token) return unauthorizedResponse();

        if (
            request.method === "POST" &&
            Array.isArray(
                await request
                    .clone()
                    .json()
                    .catch(() => null),
            )
        ) {
            return Response.json(
                {
                    error: "invalid_request",
                    message: "Batch requests are not supported.",
                },
                { status: 400 },
            );
        }

        return mcpHandler.fetch(request, {
            authInfo: {
                token,
                clientId: "pollinations-api-key",
                scopes: [],
            },
        });
    },
};
