import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

const SERVER_NAME = "wikidata-mcp";
const API_ROOT = "https://www.wikidata.org";
const ENTITY_DATA_ROOT = `${API_ROOT}/wiki/Special:EntityData`;
const MAX_RESOLVED_LABELS = 40;
const REQUEST_TIMEOUT_MS = 15_000;
// The caller's Pollinations key authenticates the proxy. Wikidata is public,
// so the key is never forwarded upstream.
const UPSTREAM_HEADERS = {
    Accept: "application/json",
    "User-Agent": `pollinations-${SERVER_NAME} (https://pollinations.ai)`,
};

const languageSchema = z
    .string()
    .min(2)
    .max(16)
    .regex(/^[a-z-]+$/)
    .describe("Wikidata language code, for example en, de, or zh-hans.");

function textResult(value) {
    return {
        content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
    };
}

async function fetchJson(url, label) {
    let response;
    try {
        response = await fetch(url, {
            headers: UPSTREAM_HEADERS,
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
    } catch {
        throw new Error(
            `${label} is unreachable right now. Try again shortly.`,
        );
    }

    const body = await response.text();
    if (!response.ok) {
        throw new Error(
            `${label} error (${response.status})${body ? `: ${body.slice(0, 300)}` : ""}`,
        );
    }
    try {
        return JSON.parse(body);
    } catch {
        throw new Error(`${label} returned invalid JSON.`);
    }
}

function pickLanguage(labels, language) {
    return (
        labels?.[language]?.value ??
        labels?.en?.value ??
        Object.values(labels ?? {})[0]?.value ??
        null
    );
}

function simplifyValue(snak) {
    const value = snak?.datavalue?.value;
    switch (snak?.datatype) {
        case "wikibase-item":
        case "wikibase-property":
        case "wikibase-lexeme":
        case "wikibase-form":
        case "wikibase-sense":
            return { id: value.id };
        case "time":
            return {
                time: value.time,
                precision: value.precision,
                calendar: value.calendar,
            };
        case "quantity":
            return {
                amount: value.amount,
                unit: value.unit === "1" ? null : value.unit,
            };
        case "monolingualtext":
            return { text: value.text, language: value.language };
        case "globecoordinate":
            return {
                latitude: value.latitude,
                longitude: value.longitude,
                precision: value.precision,
            };
        default:
            return value;
    }
}

async function fetchLabels(ids, language) {
    if (ids.length === 0) return {};
    try {
        const url = new URL(`${API_ROOT}/w/api.php`);
        url.search = new URLSearchParams({
            action: "wbgetentities",
            ids: ids.join("|"),
            props: "labels",
            languages: `${language}|en`,
            format: "json",
            origin: "*",
        }).toString();
        const data = await fetchJson(url, "Wikidata labels");
        const labels = {};
        for (const id of ids) {
            const label = pickLanguage(data?.entities?.[id]?.labels, language);
            if (label) labels[id] = label;
        }
        return labels;
    } catch {
        // Labels are a convenience; the entity itself is still useful.
        return {};
    }
}

function buildServer() {
    const server = new McpServer(
        { name: SERVER_NAME, title: "Wikidata", version: "0.1.0" },
        {
            instructions:
                "Look up structured facts from Wikidata. Use search_entities to turn a name into a Q id, then get_entity to read labels, descriptions, and claims. Claims are grouped by property id (for example P31 is 'instance of'); referenced_labels maps the item ids in those claims back to names.",
            capabilities: { tools: {} },
        },
    );

    server.registerTool(
        "search_entities",
        {
            title: "Search entities",
            description:
                "Find Wikidata items or properties by name and return their ids, labels, and descriptions. Use the id with get_entity to read claims.",
            inputSchema: z.object({
                query: z
                    .string()
                    .min(1)
                    .max(200)
                    .describe(
                        "Name or words to search for, for example Ada Lovelace.",
                    ),
                language: languageSchema.default("en"),
                type: z
                    .enum(["item", "property", "lexeme"])
                    .default("item")
                    .describe("Kind of entity to search for."),
                limit: z
                    .number()
                    .int()
                    .min(1)
                    .max(50)
                    .default(10)
                    .describe("Maximum number of matches."),
            }),
        },
        async ({ query, language, type, limit }) => {
            const url = new URL(`${API_ROOT}/w/api.php`);
            url.search = new URLSearchParams({
                action: "wbsearchentities",
                search: query,
                language,
                uselang: language,
                type,
                limit: String(limit),
                format: "json",
                origin: "*",
            }).toString();
            const data = await fetchJson(url, "Wikidata search");
            return textResult({
                query,
                language,
                results: (data.search ?? []).map((item) => ({
                    id: item.id,
                    label: item.label ?? null,
                    description: item.description ?? null,
                    aliases: item.aliases ?? [],
                    url: item.concepturi ?? `${API_ROOT}/wiki/${item.id}`,
                })),
            });
        },
    );

    server.registerTool(
        "get_entity",
        {
            title: "Get entity",
            description:
                "Read one Wikidata entity: label, description, aliases, Wikipedia link, and claims. Optionally restrict claims to selected property ids and cap statements per property.",
            inputSchema: z.object({
                id: z
                    .string()
                    .regex(/^[A-Za-z]\d{1,10}$/)
                    .describe(
                        "Entity id such as Q42 for an item or P31 for a property.",
                    ),
                language: languageSchema.default("en"),
                properties: z
                    .array(z.string().regex(/^P\d{1,10}$/))
                    .min(1)
                    .max(50)
                    .optional()
                    .describe(
                        'Only return these claim properties, for example ["P31", "P106"].',
                    ),
                max_claims_per_property: z
                    .number()
                    .int()
                    .min(1)
                    .max(50)
                    .default(10)
                    .describe("Maximum statements to return per property."),
                resolve_labels: z
                    .boolean()
                    .default(true)
                    .describe(
                        "Resolve labels for up to 40 item ids referenced by the returned claims.",
                    ),
            }),
        },
        async ({
            id,
            language,
            properties,
            max_claims_per_property,
            resolve_labels,
        }) => {
            const entityId = id.toUpperCase();
            const data = await fetchJson(
                `${ENTITY_DATA_ROOT}/${entityId}.json`,
                "Wikidata entity",
            );
            const entity = data?.entities?.[entityId];
            if (!entity || entity.missing !== undefined) {
                throw new Error(`No Wikidata entity ${entityId}.`);
            }

            const wanted = properties ? new Set(properties) : null;
            const claims = {};
            const referencedIds = new Set();
            for (const [property, statements] of Object.entries(
                entity.claims ?? {},
            )) {
                if (wanted && !wanted.has(property)) continue;
                const values = [];
                for (const statement of statements.slice(
                    0,
                    max_claims_per_property,
                )) {
                    if (!statement.mainsnak?.datavalue) continue;
                    const value = simplifyValue(statement.mainsnak);
                    if (value?.id) referencedIds.add(value.id);
                    values.push({ value, rank: statement.rank });
                }
                if (values.length > 0) claims[property] = values;
            }

            const sitelink =
                entity.sitelinks?.[`${language}wiki`] ??
                entity.sitelinks?.enwiki;
            const referenced_labels = resolve_labels
                ? await fetchLabels(
                      [...referencedIds].slice(0, MAX_RESOLVED_LABELS),
                      language,
                  )
                : {};

            return textResult({
                id: entityId,
                type: entity.type ?? null,
                label: pickLanguage(entity.labels, language),
                description: pickLanguage(entity.descriptions, language),
                aliases: (
                    entity.aliases?.[language] ??
                    entity.aliases?.en ??
                    []
                ).map((alias) => alias.value),
                url: `${API_ROOT}/wiki/${entityId}`,
                wikipedia: sitelink
                    ? {
                          title: sitelink.title,
                          url: sitelink.url ?? null,
                      }
                    : null,
                claims,
                referenced_labels,
                total_claims: Object.keys(entity.claims ?? {}).length,
            });
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
                "WWW-Authenticate": `Bearer realm="${SERVER_NAME}.pollinations.ai"`,
            },
        },
    );
}

export default {
    async fetch(request) {
        const url = new URL(request.url);

        if (url.pathname === "/health" && request.method === "GET") {
            return Response.json({
                name: SERVER_NAME,
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
