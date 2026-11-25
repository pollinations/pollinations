// Adapted from gggff123's #18065; grouped under the shared private Worker.
import { z } from "zod";
import { fetchJson } from "../fetch.js";

const API_ROOT = "https://www.wikidata.org";
const MAX_RESOLVED_LABELS = 40;
// The caller's Pollinations key authenticates the proxy. Wikidata is public,
// so the key is never forwarded upstream.

const languageSchema = z
    .string()
    .min(2)
    .max(16)
    .regex(/^[a-z-]+$/)
    .describe("Wikidata language code, for example en, de, or zh-hans.");

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
                calendar: value.calendarmodel,
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

export const wikidataTools = [
    [
        "search_entities",
        "Find Wikidata items or properties by name and return their ids, labels, and descriptions. Use the id with get_entity to read claims.",
        {
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
            return {
                query,
                language,
                results: (data.search ?? []).map((item) => ({
                    id: item.id,
                    label: item.label ?? null,
                    description: item.description ?? null,
                    aliases: item.aliases ?? [],
                    url: item.concepturi ?? `${API_ROOT}/wiki/${item.id}`,
                })),
            };
        },
    ],
    [
        "get_entity",
        "Read one Wikidata entity: label, description, aliases, Wikipedia link, and claims. Optionally restrict claims to up to five property ids and cap statements per property. Large unfiltered entities may require a narrower property selection.",
        {
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
                .max(5)
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
        },
        async ({
            id,
            language,
            properties,
            max_claims_per_property,
            resolve_labels,
        }) => {
            const entityId = id.toUpperCase();
            const metadataUrl = new URL(`${API_ROOT}/w/api.php`);
            metadataUrl.search = new URLSearchParams({
                action: "wbgetentities",
                ids: entityId,
                props: "labels|descriptions|aliases|sitelinks/urls",
                languages: `${language}|en`,
                sitefilter: `${language}wiki|enwiki`,
                format: "json",
                origin: "*",
            });
            const data = await fetchJson(metadataUrl);
            if (data.error)
                throw new Error(
                    data.error.info ?? "Wikidata rejected the entity request.",
                );
            const entity = data?.entities?.[entityId];
            if (!entity || entity.missing !== undefined) {
                throw new Error(`No Wikidata entity ${entityId}.`);
            }

            // wbgetclaims can filter one property before returning data. Fetching
            // metadata separately avoids downloading every language and sitelink.
            const claimGroups = [];
            for (const property of properties ?? [undefined]) {
                const url = new URL(`${API_ROOT}/w/api.php`);
                url.search = new URLSearchParams({
                    action: "wbgetclaims",
                    entity: entityId,
                    format: "json",
                    origin: "*",
                    ...(property ? { property } : {}),
                });
                const result = await fetchJson(url);
                if (result.error)
                    throw new Error(
                        result.error.info ??
                            "Wikidata rejected the claims request.",
                    );
                claimGroups.push(result.claims ?? {});
            }
            entity.claims = Object.assign({}, ...claimGroups);
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

            return {
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
                returned_properties: Object.keys(claims).length,
            };
        },
    ],
];
