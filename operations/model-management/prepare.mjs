import assert from "node:assert/strict";
import { isIP } from "node:net";
import { buildResearchControl } from "./jev.mjs";
import { exactModelIdentity, extractPrices } from "./price-evidence.mjs";
export const DISCOVERY_MODES = [
    "reddit",
    "quora",
    "huggingface",
    "replit",
    "github",
    "hackernews",
    "news",
    "providers",
];
const HUB_FEEDS = ["trendingScore", "downloads"].map((sort, index) => ({
    id: `hub-feed-${index}`,
    kind: "fetch",
    url: `https://huggingface.co/api/models?sort=${sort}&direction=-1&limit=20`,
    mode: "http",
    required: true,
    maxCharacters: 18000,
    sourceId: "public-hub-metadata",
    feed: true,
    text: `Official Hugging Face ${sort} model metadata: current downloads, likes and trend signals; these are not unique-user counts or API availability.`,
}));

const DISCOVERY_HOSTS = {
    reddit: "reddit.com",
    quora: "quora.com",
    huggingface: "huggingface.co",
    replit: "replit.com",
    github: "github.com",
    hackernews: "news.ycombinator.com",
};
const REQUIRED_FEEDS = [
    ...HUB_FEEDS,
    ...["LocalLLaMA", "StableDiffusion"].map((community, index) => ({
        id: `reddit-seed-${index}`,
        kind: "fetch",
        url: `https://www.reddit.com/r/${community}/top/?t=week`,
        mode: "http",
        required: true,
        maxCharacters: 12000,
        sourceId: "public-reddit-community",
        feed: true,
        text: `Public r/${community} weekly top discussions: community demand and release leads.`,
    })),
];

export function publicAddress(ip) {
    if (isIP(ip) === 6)
        return /^[23][\da-f]{3}:/i.test(ip) && !/^2001:(?:db8|0):/i.test(ip);
    if (isIP(ip) !== 4) return false;
    const [a, b] = ip.split(".").map(Number);
    return (
        ![0, 10, 127].includes(a) &&
        a < 224 &&
        !(a === 169 && b === 254) &&
        !(a === 172 && b >= 16 && b <= 31) &&
        !(a === 192 && [0, 168].includes(b)) &&
        !(a === 100 && b >= 64 && b <= 127) &&
        !(a === 198 && [18, 19, 51].includes(b)) &&
        !(a === 203 && b === 0)
    );
}

function safeUrl(value) {
    if (typeof value !== "string" || value.length > 2048) return null;
    try {
        const url = new URL(value);
        if (url.protocol !== "https:" || url.username || url.password)
            return null;
        const host = url.hostname.toLowerCase();
        const address = host.replace(/^\[|\]$/g, "");
        if (
            isIP(address)
                ? !publicAddress(address)
                : !host.includes(".") ||
                  host.endsWith(".localhost") ||
                  host.endsWith(".local")
        )
            return null;
        if (
            [...url.searchParams.keys()].some((key) => {
                const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
                return (
                    /token|password|credential|signature|secret|authorization|apikey|accesskey/.test(
                        normalized,
                    ) || /^(key|sig|auth|pwd|passwd)$/.test(normalized)
                );
            })
        )
            return null;
        url.hash = "";
        return url.href;
    } catch {
        return null;
    }
}

export function parseLeads(raw) {
    assert.equal(typeof raw, "string", "Exa response must be text");
    let rows;
    try {
        const parsed = JSON.parse(raw);
        rows = Array.isArray(parsed) ? parsed : parsed.results;
    } catch {
        rows = undefined;
    }
    if (!Array.isArray(rows)) {
        rows = [];
        // Exa's plain-text records use explicit Title/URL/Text labels.
        for (const block of raw.split(/(?=^Title\s*:)/im)) {
            const match = block.match(/^URL\s*:\s*(https:\/\/\S+)/im);
            if (!match) continue;
            rows.push({
                title: block.match(/^Title\s*:\s*(.*)$/im)?.[1] ?? "",
                url: match[1],
                text:
                    block
                        .match(
                            /^(?:Text|Content|Highlights)\s*:\s*([\s\S]*)/im,
                        )?.[1]
                        ?.replace(/\n---\s*$/, "\n") ?? "",
                publishedAt: block.match(/^Published\s*:\s*(.*)$/im)?.[1],
            });
        }
    }
    return rows.flatMap((row) => {
        const url = safeUrl(row?.url);
        if (!url) return [];
        const text =
            typeof row.text === "string"
                ? row.text
                : typeof row.snippet === "string"
                  ? row.snippet
                  : Array.isArray(row.highlights)
                    ? row.highlights
                          .filter((item) => typeof item === "string")
                          .join("\n")
                    : "";
        return [
            {
                url,
                title:
                    typeof row.title === "string"
                        ? row.title.slice(0, 300)
                        : "",
                text: text.slice(0, 800),
                ...(typeof row.publishedAt === "string" &&
                Number.isFinite(Date.parse(row.publishedAt))
                    ? { publishedAt: row.publishedAt }
                    : {}),
            },
        ];
    });
}

export function mentions(text, name) {
    const slug = name.split("/").at(-1);
    const escaped = slug
        .split(/[\s-]+/)
        .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .join("[-\\s]+");
    return new RegExp(
        `(?<![a-z0-9])${escaped}(?![a-z0-9]|[._-][a-z0-9])`,
        "i",
    ).test(text);
}

// Copy only bounded, contiguous source text; semantic support is audited later.
export function officialCandidates(models, sources, gaps = []) {
    const pricingProviders =
        /(?:^|\.)(?:microsoft\.com|azure\.com|fireworks\.ai|amazon\.com|openai\.com|anthropic\.com|claude\.com|google\.com|x\.ai|deepseek\.com|mistral\.ai|cohere\.com|together\.ai|groq\.com|cerebras\.ai|nvidia\.com|cloudflare\.com|replicate\.com|fal\.ai|runware\.ai|bfl\.ai|recraft\.ai|ideogram\.ai|minimax\.io|kimi\.ai|aliyun\.com|alibabacloud\.com|byteplus\.com|digitalocean\.com|openrouter\.ai)$/;
    const quoteFor = (text, name, predicate = () => true) => {
        for (const segment of text.split(/\n|(?<=[.!?])\s+/)) {
            if (!mentions(segment, name) || !predicate(segment)) continue;
            if (
                segment.trim().length >= 8 &&
                segment.trim().split(/\s+/).length <= 25
            )
                return segment.trim();
        }
        return null;
    };
    return {
        routes: [],
        discoveries: [],
        gaps: gaps.filter(
            (gap) => !models.some((model) => gap.includes(model.name)),
        ),
        models: models.map((model) => {
            const routes = [];
            const unresolved = [];
            const checkpoint = model.name.split("/").at(-1);
            for (const source of sources) {
                if (
                    source.status !== "fetched" ||
                    typeof source.text !== "string"
                )
                    continue;
                let url;
                try {
                    url = new URL(source.url);
                } catch {
                    unresolved.push(
                        `${source.id}: malformed provider source URL`,
                    );
                    continue;
                }
                if (
                    url.protocol !== "https:" ||
                    url.username ||
                    url.password ||
                    /(?:^|\.)(?:reddit\.com|huggingface\.co|replit\.com|medium\.com|twitter\.com|x\.com|ycombinator\.com|github\.com)$/.test(
                        url.hostname,
                    )
                )
                    continue;
                const price = extractPrices(source.text, {
                    model,
                    upstreamModel: checkpoint,
                    category: model.category,
                });
                const displayed = (
                    price?.evidence.find(
                        (item) =>
                            item.kind === "model" &&
                            exactModelIdentity(item.quote, model.name),
                    )?.quote ??
                    source.text
                        .split("\n")
                        .map((line) => line.trim())
                        .find((line) => exactModelIdentity(line, model.name))
                        ?.replace(/^#{1,6}\s+/, "") ??
                    checkpoint
                ).replace(/^#{1,6}\s+/, "");
                const identity = quoteFor(source.text, displayed);
                if (!identity) continue;
                const providerRoot =
                    url.hostname
                        .match(pricingProviders)?.[0]
                        .replace(/^\./, "") ?? url.hostname;
                const provider = /(?:^|\.)(?:microsoft\.com|azure\.com)$/.test(
                    url.hostname,
                )
                    ? "azure"
                    : /(?:^|\.)fireworks\.ai$/.test(url.hostname)
                      ? "fireworks"
                      : /(?:^|\.)amazon\.com$/.test(url.hostname)
                        ? "bedrock"
                        : providerRoot;
                const availability = quoteFor(
                    source.text,
                    displayed,
                    (text) =>
                        /\b(?:API|serverless|inference endpoint|managed endpoint)\b/i.test(
                            text,
                        ) &&
                        !/\b(?:weights|download|dedicated|not available|unavailable|retired)\b/i.test(
                            text,
                        ),
                );
                if (!pricingProviders.test(url.hostname) && !availability) {
                    unresolved.push(
                        `${source.id}: exact checkpoint lead does not establish this origin as a managed inference provider`,
                    );
                    continue;
                }
                const claims = [
                    { kind: "identity", sourceId: source.id, quote: identity },
                ];
                if (availability)
                    claims.push({
                        kind: "availability",
                        sourceId: source.id,
                        quote: availability,
                    });
                for (const fragment of price?.evidence ?? [])
                    if (
                        ["price", "row"].includes(fragment.kind) &&
                        fragment.quote.trim().length >= 8 &&
                        fragment.quote.trim().split(/\s+/).length <= 25
                    )
                        claims.push({
                            kind: "price",
                            sourceId: source.id,
                            quote: fragment.quote,
                        });
                const route = {
                    providerWebsite: `https://${providerRoot}/`,
                    provider,
                    upstreamModel: displayed,
                    exactMatch: true,
                    available: availability ? true : null,
                    capabilitiesMatch: null,
                    creditEligibility: "unknown",
                    pricing: {
                        currency: "USD",
                        unit: price?.unit ?? "unknown",
                        input: price?.input ?? null,
                        output: price?.output ?? null,
                    },
                    claims,
                    notes: "Copied primary-source evidence; capability parity, account credits and runtime remain unknown.",
                };
                const previous = routes.findIndex(
                    (item) => item.provider === provider,
                );
                if (previous < 0) routes.push(route);
                else {
                    const saved = routes[previous];
                    if (exactModelIdentity(saved.upstreamModel, displayed)) {
                        if (price && saved.pricing.input === null)
                            saved.pricing = route.pricing;
                        saved.claims.push(
                            ...claims.filter(
                                (claim) =>
                                    !saved.claims.some(
                                        (item) =>
                                            item.kind === claim.kind &&
                                            (claim.kind === "identity" ||
                                                item.quote === claim.quote),
                                    ),
                            ),
                        );
                        if (availability) saved.available = true;
                    }
                }
            }
            return {
                name: model.name,
                routes,
                discoveries: [],
                gaps: [
                    ...gaps.filter((gap) => gap.includes(model.name)),
                    ...unresolved,
                    "Full capability parity, account credits and live route verification remain unknown",
                    ...(!routes.length
                        ? [
                              "No fetched primary provider source establishes the exact checkpoint",
                          ]
                        : []),
                ],
            };
        }),
    };
}

function providerRank(lead) {
    const host = new URL(lead.url).hostname;
    if (/(^|\.)(microsoft\.com|azure\.com)$/.test(host)) return 0;
    if (/(^|\.)fireworks\.ai$/.test(host)) return 1;
    if (/(^|\.)amazon\.com$/.test(host)) return 2;
    return 3;
}

export async function prepareResearch(task, services) {
    const names = (task.models ?? []).map((model) => model.name);
    assert.ok(
        names.length <= 8 &&
            new Set(names).size === names.length &&
            names.every(
                (name) =>
                    typeof name === "string" &&
                    name.trim() === name &&
                    name.length > 0,
            ),
        "Expected at most eight unique canonical model names",
    );
    const scopes = new Map();
    const coverage = new Map(names.map((name) => [name, new Map()]));
    const sources = [],
        actions = [],
        leads = [],
        gaps = [],
        unselectedLeadIds = [],
        unselectedLeads = [];
    const plans = [
        {
            questions: [
                "Which exact checkpoints have primary evidence on Azure, Fireworks and AWS Bedrock?",
                "Which supported alternatives or discovery leads warrant primary-source reading?",
                "Which identities, prices and route eligibility remain unresolved after this bounded pass?",
            ],
        },
    ];
    let triage = { prioritizedIds: [], ambiguousIds: [], irrelevantIds: [] };
    let reasoningAction = null;
    let extraction = null;
    let requiredEvidencePending = !names.length;
    const evidence = () => {
        // Persist observed URLs only; fetched page text is never restored as evidence.
        if (!names.length)
            for (const source of sources) {
                if (source.status !== "fetched") continue;
                for (const link of source.links ?? [])
                    retain({
                        ...link,
                        text: link.text,
                        sourceId: source.id,
                        modes: ["http"],
                        scopes: ["crawl"],
                    });
            }
        unselectedLeads.splice(0, unselectedLeads.length);
        for (const lead of candidates.values()) {
            const reads = sources.filter(
                (source) =>
                    source.url === lead.url ||
                    actions.some(
                        (action) =>
                            action.tool === "fetch" &&
                            action.url === lead.url &&
                            action.sourceId === source.id &&
                            source.id !== undefined,
                    ),
            );
            if (reads.some((source) => source.status === "fetched")) continue;
            const attempted =
                lead.attempted === true ||
                reads.length > 0 ||
                actions.some(
                    (action) =>
                        action.tool === "fetch" && action.url === lead.url,
                );
            unselectedLeads.push({
                ...lead,
                status:
                    attempted || lead.status === "unavailable"
                        ? "unavailable"
                        : "pending",
                attempted,
            });
        }
        unselectedLeadIds.splice(
            0,
            unselectedLeadIds.length,
            ...unselectedLeads.map(({ id }) => id),
        );
        return {
            plans,
            scopes,
            coverage,
            sources,
            actions,
            leads,
            triage,
            gaps,
            unselectedLeadIds,
            unselectedLeads,
            reasoningAction,
            extraction,
            requiredEvidencePending,
            omittedCandidates,
            remainingDeferredCount: unselectedLeads.length,
        };
    };
    const checkpoints = `(${names.map((name) => JSON.stringify(name.split("/").at(-1))).join(" OR ")})`;
    const month = new Date().toISOString().slice(0, 7);
    const searches = names.length
        ? [
              [
                  "azure",
                  "web",
                  `(site:microsoft.com OR site:azure.com) Azure AI Foundry ${checkpoints} availability pricing catalog`,
              ],
              [
                  "fireworks",
                  "web",
                  `site:fireworks.ai Fireworks AI ${checkpoints} availability pricing catalog`,
              ],
              [
                  "bedrock",
                  "web",
                  `site:amazon.com AWS Bedrock ${checkpoints} availability pricing catalog`,
              ],
              [
                  "alternatives",
                  "web",
                  `Alternative inference providers ${checkpoints} official restrictions retirement deprecation hidden fees pricing limitations`,
              ],
          ]
        : [
              [
                  "discovery",
                  "reddit",
                  `site:reddit.com ${month} AI model community demand trending new releases adoption niche inference provider deals`,
              ],
              [
                  "discovery",
                  "quora",
                  `site:quora.com ${month} AI model community demand underrated models inference provider pricing deals`,
              ],
              [
                  "discovery",
                  "huggingface",
                  `site:huggingface.co ${month} trending new model releases checkpoint adoption official model cards inference providers`,
              ],
              [
                  "discovery",
                  "replit",
                  `site:replit.com ${month} AI model developer adoption applications trending inference models provider deals`,
              ],
              [
                  "discovery",
                  "github",
                  `site:github.com ${month} AI model releases adoption stars new checkpoints niche inference providers`,
              ],
              [
                  "discovery",
                  "hackernews",
                  `site:news.ycombinator.com ${month} AI model releases developer demand adoption inference provider pricing deals`,
              ],
              [
                  "discovery",
                  "news",
                  `${month} AI model publisher official new releases trending adoption announcement`,
              ],
              [
                  "discovery",
                  "providers",
                  `${month} niche inference providers new model API pricing deals discounts serverless official release`,
              ],
          ];
    assert.ok(
        searches.every(([, , query]) => query.length <= 700),
        "Checkpoint query exceeds 700 characters",
    );
    const candidates = new Map();
    let omittedCandidates =
        Number.isSafeInteger(task.deferredOmittedCount) &&
        task.deferredOmittedCount > 0
            ? task.deferredOmittedCount
            : 0;
    let nextLeadId = 1;
    const restoredUrls = new Set();
    const omittedUrls = new Set();
    const requiredUrls = new Set();
    const currentModeLeads = new Map();
    const retain = (lead, required = false) => {
        const url = safeUrl(lead?.url);
        if (!url) return null;
        const existing = candidates.get(url);
        if (existing) {
            if (required) requiredUrls.add(url);
            return existing;
        }
        if (candidates.size >= 256) {
            if (required) {
                const dropped = [...candidates.keys()].findLast(
                    (candidate) => !requiredUrls.has(candidate),
                );
                candidates.delete(dropped);
                omittedUrls.add(dropped);
                omittedCandidates++;
            } else {
                if (!omittedUrls.has(url)) {
                    omittedUrls.add(url);
                    omittedCandidates++;
                }
                return null;
            }
        }
        const strings = (items) =>
            Array.isArray(items)
                ? [
                      ...new Set(
                          items.filter(
                              (item) =>
                                  typeof item === "string" &&
                                  item.length <= 700,
                          ),
                      ),
                  ].slice(0, 16)
                : [];
        const saved = {
            url,
            id: `lead-${nextLeadId++}`,
            title:
                typeof lead.title === "string" ? lead.title.slice(0, 300) : "",
            text: typeof lead.text === "string" ? lead.text.slice(0, 800) : "",
            models: strings(lead.models),
            scopes: strings(lead.scopes),
            modes: strings(lead.modes),
            queryModels: strings(lead.queryModels),
            ...(typeof lead.sourceId === "string"
                ? { sourceId: lead.sourceId.slice(0, 300) }
                : {}),
            ...(typeof lead.publishedAt === "string" &&
            Number.isFinite(Date.parse(lead.publishedAt))
                ? { publishedAt: lead.publishedAt }
                : {}),
            status: lead.status === "unavailable" ? "unavailable" : "pending",
            attempted: lead.attempted === true,
        };
        candidates.set(url, saved);
        if (required) requiredUrls.add(url);
        return saved;
    };
    for (const lead of (Array.isArray(task.deferredSources)
        ? task.deferredSources
        : []
    ).slice(0, 256)) {
        const saved = retain(lead);
        if (saved) restoredUrls.add(saved.url);
    }
    omittedCandidates += Math.max(0, (task.deferredSources?.length ?? 0) - 256);
    const control = async (stage, menu) => {
        if (!services.control) return menu[0];
        const facts = officialCandidates(task.models ?? [], sources, gaps);
        const snapshot = JSON.stringify({
            completed: actions
                .filter((action) => action.status === "searched")
                .map(({ scope, models }) => ({ scope, models })),
            facts: facts.models.map(({ name, routes }) => ({
                name,
                routeCount: routes.length,
                unknownPrice: !routes.some(
                    ({ pricing }) => pricing.input !== null,
                ),
                managedApiUnknown: !routes.some(
                    ({ available }) => available === true,
                ),
                omittedRoutes: Math.max(0, routes.length - 3),
                routes: routes
                    .slice(0, 3)
                    .map(({ provider, pricing, available }) => ({
                        provider,
                        pricing,
                        available,
                    })),
            })),
            sourceCount: sources.length,
            omittedSources: Math.max(0, sources.length - 8),
            sources: sources.slice(0, 8).map(({ id, text, status }) => ({
                id,
                status,
                excerpt: text?.slice(0, 160),
            })),
            gaps: gaps.slice(0, 8).map((gap) => gap.slice(0, 160)),
            extraction: extraction
                ? {
                      selected: extraction.discoveries
                          .map(({ name, kind }) => ({ name, kind }))
                          .slice(0, 12),
                      unresolved: extraction.gaps,
                      grades: extraction.grades.slice(0, 12),
                  }
                : null,
            omittedGaps: Math.max(0, gaps.length - 8),
        });
        const state = {
            stage,
            models: names,
            actions: [...menu],
            evidence: snapshot,
            remainingPollen: services.remainingPollen?.() ?? 0,
        };
        while (true) {
            try {
                buildResearchControl(state);
                break;
            } catch (error) {
                if (
                    !/context bound/.test(error.message) ||
                    state.actions.length === 1
                )
                    throw error;
                const last = state.actions.findLastIndex(
                    (action) => action.kind !== "finish",
                );
                state.actions.splice(last, 1);
            }
        }
        const decision = await services.control(state);
        actions.push({
            tool: "control",
            stage,
            status: decision.action ? "selected" : "insufficient",
            selectedProbability: decision.selectedProbability,
            requestDigest: decision.requestDigest,
            actionId: decision.action?.id,
        });
        if (!decision.action) {
            gaps.push(
                `${stage}: Jev could not select a supported bounded next action; remaining coverage or evidence is unresolved`,
            );
            return null;
        }
        const selected = menu.find(
            (action) => action.id === decision.action.id,
        );
        assert.deepEqual(
            decision.action,
            selected,
            "Controller must copy an offered concrete action",
        );
        return selected;
    };
    const runSearch = async ({ scope, mode, query, models: queryModels }) => {
        const returnedLeadIds = [];
        const action = {
            tool: "search",
            scope,
            mode,
            engine: "exa",
            purpose: "challenge",
            query,
            models: [...queryModels],
            status: "pending",
        };
        actions.push(action);
        let raw;
        try {
            raw = await services.search(query, "exa");
        } catch (error) {
            action.status = "failed";
            if (!names.length)
                gaps.push(
                    `${mode}: search failed; discovery evidence remains unresolved`,
                );
            throw error;
        }
        action.status = "searched";
        const receipt = `${mode}:exa:challenge:${query}`;
        if (!scopes.has(scope)) scopes.set(scope, new Set());
        scopes.get(scope).add(receipt);
        for (const name of queryModels) {
            if (!coverage.get(name).has(scope))
                coverage.get(name).set(scope, new Set());
            coverage.get(name).get(scope).add(receipt);
        }
        const parsed = parseLeads(raw);
        const root = !names.length && DISCOVERY_HOSTS[mode];
        const parsedLeads = root
            ? parsed.filter(({ url }) => {
                  const host = new URL(url).hostname;
                  return host === root || host.endsWith(`.${root}`);
              })
            : parsed;
        if (parsedLeads.length < parsed.length)
            gaps.push(
                `${mode}: discarded ${parsed.length - parsedLeads.length} off-platform search results; platform evidence remains unresolved until fetched`,
            );
        if (!parsedLeads.length && !names.length)
            gaps.push(`${mode}: no usable safe search lead returned`);
        for (const lead of parsed) {
            const observedMode = parsedLeads.includes(lead) ? mode : "web";
            const requiredCurrent =
                !names.length &&
                parsedLeads.includes(lead) &&
                !currentModeLeads.has(mode);
            let saved = candidates.get(lead.url);
            if (!saved) {
                saved = retain(
                    {
                        ...lead,
                        models: queryModels.filter((name) =>
                            mentions(
                                `${lead.title}\n${lead.text}\n${lead.url}`,
                                name,
                            ),
                        ),
                        scopes: [],
                        modes: [],
                        queryModels: [],
                    },
                    requiredCurrent,
                );
                if (!saved) continue;
            } else {
                // Keep the first exact excerpt, but retain identities observed in later search snippets.
                for (const name of queryModels.filter((name) =>
                    mentions(`${lead.title}\n${lead.text}\n${lead.url}`, name),
                )) {
                    if (!saved.models.includes(name)) saved.models.push(name);
                }
            }
            if (requiredCurrent) {
                requiredUrls.add(saved.url);
                currentModeLeads.set(mode, saved);
            }
            if (!saved.scopes.includes(scope)) saved.scopes.push(scope);
            if (!saved.modes.includes(observedMode))
                saved.modes.push(observedMode);
            returnedLeadIds.push(saved.id);
            for (const name of queryModels)
                if (!saved.queryModels.includes(name))
                    saved.queryModels.push(name);
        }
        return returnedLeadIds;
    };
    try {
        const pending = searches.map(([scope, mode, query], index) => ({
            id: `required-${index}`,
            kind: "search",
            query,
            engine: "exa",
            scope,
            mode,
            models: names,
        }));
        while (pending.length) {
            const selected = await control("search", pending);
            if (!selected) return evidence();
            await runSearch(selected);
            pending.splice(
                pending.findIndex(({ id }) => id === selected.id),
                1,
            );
        }
        const ranked = [...candidates.values()].sort(
            (a, b) => providerRank(a) - providerRank(b),
        );
        const selected = new Set();
        if (!names.length) {
            for (const [, mode] of searches) {
                const lead =
                    currentModeLeads.get(mode) ??
                    ranked.find((item) => item.modes.includes(mode));
                if (lead) selected.add(lead);
                else gaps.push(`${mode}: no usable discovery lead returned`);
            }
        }
        for (const name of names) {
            const match =
                ranked.find((lead) => lead.models.includes(name)) ??
                ranked.find(
                    (lead) =>
                        lead.queryModels.includes(name) &&
                        providerRank(lead) < 3,
                );
            if (match) selected.add(match);
            else
                gaps.push(
                    `${name}: no usable exact-checkpoint or preferred-provider catalog lead returned`,
                );
        }
        // Preserve each search scope before preferred providers fill the bounded pass.
        const scopeLeads = names.length
            ? [...scopes.keys()].map((scope) =>
                  ranked.filter((lead) => lead.scopes.includes(scope)),
              )
            : searches.map(([, mode]) =>
                  ranked.filter((lead) => lead.modes.includes(mode)),
              );
        for (const rows of scopeLeads) {
            if (rows.length && !rows.some((lead) => selected.has(lead)))
                selected.add(rows[0]);
        }
        if (!names.length) {
            const deferred = ranked
                .filter(
                    (lead) => restoredUrls.has(lead.url) && !selected.has(lead),
                )
                .sort(
                    (a, b) =>
                        Number(a.status === "unavailable") -
                        Number(b.status === "unavailable"),
                );
            for (const lead of deferred.slice(0, 2)) selected.add(lead);
        }
        while (selected.size < Math.min(16, ranked.length)) {
            const before = selected.size;
            for (const rows of scopeLeads) {
                const lead = rows.find((item) => !selected.has(item));
                if (lead && selected.size < 16) selected.add(lead);
            }
            if (selected.size === before)
                selected.add(ranked.find((item) => !selected.has(item)));
        }
        leads.push(...selected);
        unselectedLeadIds.push(
            ...ranked
                .filter((lead) => !selected.has(lead))
                .map((lead) => lead.id),
        );
        unselectedLeads.push(...ranked.filter((lead) => !selected.has(lead)));
        if (omittedCandidates)
            gaps.push(
                `${omittedCandidates} observed URLs omitted because of the 256-source deferred frontier bound`,
            );
        const excerpts = leads
            .filter((lead) => lead.text.trim() || lead.title.trim())
            .map((lead) => ({
                id: lead.id,
                text: lead.text || lead.title,
                url: lead.url,
                title: lead.title,
            }));
        if (names.length && excerpts.length)
            triage = await services.triage(names, excerpts);
        const prioritized = new Set(triage.prioritizedIds ?? []);
        const ordered = [...leads].sort(
            (a, b) =>
                Number(prioritized.has(b.id)) - Number(prioritized.has(a.id)),
        );
        // Triage only orders reads: insufficient and irrelevant votes cannot certify or discard evidence.
        const attempts = [];
        const seenReads = new Set();
        const enqueue = (lead, name) => {
            const slug = name?.split("/").at(-1);
            const focus = slug && slug.length <= 200 ? slug : undefined;
            const key = JSON.stringify([lead.url, focus]);
            if (seenReads.has(key)) return;
            if (attempts.length >= 24) {
                gaps.push(
                    `${lead.id}${name ? ` (${name})` : ""}: unread because of the twenty-four-read preparation bound`,
                );
                return;
            }
            seenReads.add(key);
            attempts.push({ lead, focus });
        };
        // Give every checkpoint a focused primary attempt before spending remaining reads.
        for (const name of names) {
            const lead =
                leads.find((item) => item.models.includes(name)) ??
                leads.find(
                    (item) =>
                        providerRank(item) < 3 &&
                        item.queryModels.includes(name),
                );
            if (lead) enqueue(lead, name);
        }
        for (const lead of ordered) {
            const matched = names.filter((name) => lead.models.includes(name));
            if (matched.length) for (const name of matched) enqueue(lead, name);
            else if (!attempts.some((attempt) => attempt.lead === lead))
                enqueue(lead);
        }
        for (const { lead, focus } of attempts) {
            const args = {
                url: lead.url,
                mode: "http",
                maxCharacters: 3000,
                ...(focus ? { focus } : {}),
            };
            const action = {
                tool: "fetch",
                ...args,
                leadId: lead.id,
                models: [...lead.models],
                status: "pending",
            };
            actions.push(action);
            const source = await services.read(args);
            sources.push(source);
            action.sourceId = source.id;
            action.status = source.status;
        }
        if (!names.length) {
            const readUrls = new Set(sources.map(({ url }) => url));
            const pageReads = new Map();
            const linkIds = new Map();
            let crawled = 0;
            while (crawled < 8 && sources.length < 24) {
                const links = new Map();
                for (const feed of REQUIRED_FEEDS) {
                    retain(
                        { ...feed, modes: ["http"], scopes: ["crawl"] },
                        true,
                    );
                    if (!readUrls.has(feed.url)) links.set(feed.url, feed);
                }
                for (const source of sources) {
                    if (
                        source.status !== "fetched" ||
                        (pageReads.get(source.id) ?? 0) >= 2
                    )
                        continue;
                    for (const link of source.links ?? []) {
                        const url = safeUrl(link.url);
                        if (!url) continue;
                        const observed = retain({
                            url,
                            title: link.title,
                            text: link.text,
                            sourceId: source.id,
                            modes: ["http"],
                            scopes: ["crawl"],
                        });
                        if (!observed || readUrls.has(url) || links.has(url))
                            continue;
                        if (!linkIds.has(url))
                            linkIds.set(url, `crawl-${linkIds.size + 1}`);
                        links.set(url, {
                            id: linkIds.get(url),
                            kind: "fetch",
                            url,
                            mode: "http",
                            maxCharacters: 3000,
                            sourceId: source.id,
                            text:
                                typeof link.text === "string"
                                    ? link.text.slice(0, 160)
                                    : "",
                        });
                    }
                }
                const menu = [...links.values()]
                    .sort(
                        (a, b) =>
                            Number(
                                /model|provider|pricing|release|inference|checkpoint/i.test(
                                    b.text,
                                ),
                            ) -
                            Number(
                                /model|provider|pricing|release|inference|checkpoint/i.test(
                                    a.text,
                                ),
                            ),
                    )
                    .slice(0, 12);
                if (!menu.length) break;
                const required = menu.filter((action) => action.required);
                const selected = await control(
                    "crawl",
                    required.length
                        ? required
                        : [...menu, { id: "finish", kind: "finish" }],
                );
                if (!selected) return evidence();
                if (selected.kind === "finish") break;
                readUrls.add(selected.url);
                pageReads.set(
                    selected.sourceId,
                    (pageReads.get(selected.sourceId) ?? 0) + 1,
                );
                const args = {
                    url: selected.url,
                    mode: "http",
                    maxCharacters: selected.maxCharacters ?? 3000,
                };
                const action = {
                    tool: "fetch",
                    ...args,
                    ...(selected.feed
                        ? { feed: true }
                        : { parentSourceId: selected.sourceId }),
                    models: [],
                    status: "pending",
                };
                actions.push(action);
                const source = await services.read(args);
                sources.push(source);
                action.sourceId = source.id;
                action.status = source.status;
                crawled++;
            }
            requiredEvidencePending = REQUIRED_FEEDS.some(
                (feed) => !readUrls.has(feed.url),
            );
            if (requiredEvidencePending)
                gaps.push(
                    "Required public feeds were not attempted; discovery remains incomplete",
                );
            const blockedSources = () => [
                ...new Map(
                    sources
                        .filter(({ status }) => status === "unavailable")
                        .filter(
                            ({ url }) =>
                                !sources.some(
                                    (source) =>
                                        source.url === url &&
                                        source.status === "fetched",
                                ),
                        )
                        .sort(
                            (a, b) =>
                                Number(
                                    REQUIRED_FEEDS.some(
                                        ({ url }) => url === b.url,
                                    ),
                                ) -
                                Number(
                                    REQUIRED_FEEDS.some(
                                        ({ url }) => url === a.url,
                                    ),
                                ),
                        )
                        .map((source) => [source.url, source]),
                ).values(),
            ];
            for (const mode of ["dynamic", "exa"]) {
                const blocked = blockedSources().filter(
                    ({ url }) =>
                        mode === "dynamic" ||
                        actions.some(
                            (action) =>
                                action.mode === "dynamic" && action.url === url,
                        ),
                );
                let fallbacks = 0;
                while (blocked.length && fallbacks < 4) {
                    const selected = await control("crawl", [
                        ...blocked.slice(0, 12).map((source, index) => ({
                            id: `${mode}-fallback-${index}`,
                            kind: "fetch",
                            url: source.url,
                            mode,
                            required: true,
                            maxCharacters:
                                REQUIRED_FEEDS.find(
                                    (feed) => feed.url === source.url,
                                )?.maxCharacters ?? 4000,
                            sourceId: source.id,
                            text:
                                mode === "dynamic"
                                    ? "Blocked public page: attempt free guarded Scrapling browser rendering before paid retrieval."
                                    : "Public source still unavailable locally: retrieve its text through Pollinations Exa (paid, bounded).",
                        })),
                    ]);
                    if (!selected) break;
                    if (selected.kind === "finish") break;
                    const failed = blocked.splice(
                        Number(selected.id.split("-").at(-1)),
                        1,
                    )[0];
                    const action = {
                        tool: "fetch",
                        url: selected.url,
                        mode,
                        maxCharacters: selected.maxCharacters,
                        parentSourceId: failed.id,
                        models: [],
                        status: "pending",
                    };
                    actions.push(action);
                    const source = await services.read(action);
                    sources.push(source);
                    action.sourceId = source.id;
                    action.status = source.status;
                    fallbacks++;
                    if (source.status !== "fetched" && mode === "exa")
                        gaps.push(
                            `${source.url}: local HTTP, guarded browser and Exa retrieval unavailable or unselected`,
                        );
                }
            }
        }
        if (!names.length)
            for (const [, mode] of searches)
                if (
                    !sources.some((source) => {
                        if (source.status !== "fetched") return false;
                        const root = DISCOVERY_HOSTS[mode];
                        if (root) {
                            const host = new URL(source.url).hostname;
                            return host === root || host.endsWith(`.${root}`);
                        }
                        return leads.some(
                            (lead) =>
                                lead.url === source.url &&
                                lead.modes.includes(mode),
                        );
                    })
                )
                    gaps.push(
                        `${mode}: fetched discovery evidence remains unresolved`,
                    );
        if (!names.length && services.extract) {
            extraction = await services.extract(sources);
            gaps.push(...extraction.gaps);
        }
        let followed = 0;
        if (services.control) {
            const attempted = new Set();
            const attemptedModels = new Set();
            const followupActions = () => {
                const offered = officialCandidates(task.models ?? [], sources)
                    .models.flatMap((row, index) => {
                        const missingIdentity = !row.routes.length;
                        const missingPrice = !row.routes.some(
                            (route) =>
                                route.pricing.input !== null &&
                                (task.models.find(
                                    (model) => model.name === row.name,
                                ).category !== "text" ||
                                    route.pricing.output !== null),
                        );
                        const missingApi = !row.routes.some(
                            (route) => route.available === true,
                        );
                        return [
                            ...(missingIdentity || missingApi
                                ? [
                                      {
                                          id: `identity-${index}`,
                                          kind: "search",
                                          query: `${JSON.stringify(row.name.split("/").at(-1))} official provider managed API serverless inference availability`,
                                          engine: "exa",
                                          scope: "alternatives",
                                          mode: "web",
                                          models: [row.name],
                                      },
                                  ]
                                : []),
                            ...(missingPrice
                                ? [
                                      {
                                          id: `price-${index}`,
                                          kind: "search",
                                          query: `${JSON.stringify(row.name.split("/").at(-1))} official provider standard pricing USD workload units restrictions`,
                                          engine: "exa",
                                          scope: "alternatives",
                                          mode: "web",
                                          models: [row.name],
                                      },
                                  ]
                                : []),
                        ];
                    })
                    .filter(({ id }) => !attempted.has(id));
                for (const [index, provider] of (
                    task.discoveryLeads ?? []
                ).entries()) {
                    const id = `niche-${index}`;
                    if (
                        !names.length ||
                        provider.kind !== "provider" ||
                        typeof provider.name !== "string" ||
                        provider.name.length > 200 ||
                        attempted.has(id) ||
                        offered.length >= 17
                    )
                        continue;
                    const covered = [...names];
                    let query;
                    do {
                        query = `${JSON.stringify(provider.name)} ${covered.map((name) => JSON.stringify(name.split("/").at(-1))).join(" OR ")} official managed inference API standard pricing TPS restrictions`;
                        if (query.length <= 700) break;
                        covered.pop();
                    } while (covered.length);
                    if (covered.length)
                        offered.push({
                            id,
                            kind: "search",
                            query,
                            engine: "exa",
                            scope: "alternatives",
                            mode: "web",
                            models: covered,
                        });
                }
                return offered;
            };
            const finish = { id: "finish", kind: "finish" };
            while (followed < 2) {
                const followups = followupActions();
                if (!followups.length) break;
                const selected = await control("followup", [
                    ...followups,
                    finish,
                ]);
                if (!selected) return evidence();
                if (selected.kind === "finish") break;
                attempted.add(selected.id);
                attemptedModels.add(selected.models[0]);
                const returnedLeadIds = await runSearch(selected);
                followed++;
                const focus = selected.models[0].split("/").at(-1);
                const lead = [...candidates.values()].find(
                    (item) =>
                        returnedLeadIds.includes(item.id) &&
                        !sources.some(
                            (source) =>
                                source.url === item.url &&
                                source.focus === focus,
                        ),
                );
                if (!lead) {
                    gaps.push(
                        `${selected.models[0]}: targeted followup returned no new safe source lead`,
                    );
                    continue;
                }
                if (attempts.length + followed > 24) {
                    gaps.push(
                        `${selected.models[0]}: followup lead unread because of the twenty-four-read preparation bound`,
                    );
                    continue;
                }
                if (!leads.some(({ id }) => id === lead.id)) {
                    leads.push(lead);
                    const omitted = unselectedLeadIds.indexOf(lead.id);
                    if (omitted >= 0) unselectedLeadIds.splice(omitted, 1);
                    const unread = unselectedLeads.findIndex(
                        ({ id }) => id === lead.id,
                    );
                    if (unread >= 0) unselectedLeads.splice(unread, 1);
                }
                const args = {
                    url: lead.url,
                    mode: "http",
                    maxCharacters: 3000,
                    ...(focus.length <= 200 ? { focus } : {}),
                };
                const action = {
                    tool: "fetch",
                    ...args,
                    leadId: lead.id,
                    models: [...selected.models],
                    status: "pending",
                };
                actions.push(action);
                const source = await services.read(args);
                sources.push(source);
                action.sourceId = source.id;
                action.status = source.status;
            }
            const semantic = officialCandidates(
                task.models ?? [],
                sources,
            ).models.find(
                (row) =>
                    attemptedModels.has(row.name) &&
                    row.routes.length &&
                    row.routes.every((route) => route.available !== true),
            );
            const semanticSources = semantic
                ? sources
                      .filter(
                          (source) =>
                              source.status === "fetched" &&
                              (mentions(source.text, semantic.name) ||
                                  source.text
                                      .split("\n")
                                      .some((line) =>
                                          exactModelIdentity(
                                              line.trim(),
                                              semantic.name,
                                          ),
                                      ) ||
                                  extractPrices(source.text, {
                                      upstreamModel: semantic.name,
                                      model: task.models.find(
                                          ({ name }) => name === semantic.name,
                                      ),
                                  })),
                      )
                      .map(({ id }) => id)
                : [];
            const reason = !names.length
                ? {
                      id: "reason-discovery",
                      kind: "reason",
                      task: "Resolve only ambiguous cross-platform entity identity, adoption or release evidence left after Jev literal extraction. Keep supported extracted leads; do not use Sol for routine consolidation or invent names, facts or prices.",
                  }
                : followed > 0 && semanticSources.length
                  ? {
                        id: "reason-official",
                        kind: "reason",
                        models: [semantic.name],
                        task: `Resolve only the remaining managed API availability ambiguity for ${semantic.name} using fetched source IDs ${semanticSources.join(", ")}. Preserve source-bound prices and unknown account/runtime facts.`,
                    }
                  : null;
            const selected = await control("reasoning", [
                ...(reason ? [reason] : []),
                finish,
            ]);
            if (selected?.kind === "reason") reasoningAction = selected;
        }
        for (const name of names) {
            if (!leads.some((lead) => lead.models.includes(name)))
                gaps.push(
                    `${name}: search snippets do not establish exact checkpoint identity; provider absence is unknown`,
                );
            if (
                !leads.some(
                    (lead) =>
                        lead.models.includes(name) &&
                        sources.some(
                            (source) =>
                                source.url === lead.url &&
                                source.status === "fetched",
                        ),
                )
            )
                gaps.push(
                    `${name}: exact-checkpoint primary evidence remains unresolved`,
                );
        }
        const result = evidence();
        if (result.remainingDeferredCount)
            gaps.push(
                `${result.remainingDeferredCount} observed sources remain pending or unavailable in the deferred frontier`,
            );
        if (
            omittedCandidates &&
            !gaps.some((gap) => gap.includes("deferred frontier bound"))
        )
            gaps.push(
                `${omittedCandidates} observed URLs omitted because of the 256-source deferred frontier bound`,
            );
        return result;
    } catch (error) {
        if (!leads.length && candidates.size) {
            const partial = [...candidates.values()];
            leads.push(...partial.slice(0, 16));
            unselectedLeadIds.push(...partial.slice(16).map(({ id }) => id));
            unselectedLeads.push(...partial.slice(16));
            gaps.push(
                "Preparation stopped before lead reading; completed search receipts and returned leads retained",
            );
        }
        error.evidence = {
            ...error.evidence,
            preparation: evidence(),
            ...evidence(),
        };
        throw error;
    }
}
