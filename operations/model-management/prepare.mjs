import assert from "node:assert/strict";
import { exactModelIdentity, extractPrices } from "./price-evidence.mjs";

function safeUrl(value) {
    if (typeof value !== "string" || value.length > 2048) return null;
    try {
        const url = new URL(value);
        if (url.protocol !== "https:" || url.username || url.password)
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
                text: block.match(/^Text\s*:\s*([\s\S]*)/im)?.[1] ?? "",
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
                  : "";
        return [
            {
                url,
                title:
                    typeof row.title === "string"
                        ? row.title.slice(0, 300)
                        : "",
                text: text.slice(0, 800),
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
    const evidence = () => ({
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
    });
    const checkpoints = `(${names.map((name) => JSON.stringify(name.split("/").at(-1))).join(" OR ")})`;
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
                  "site:reddit.com trending underrated inference models niche providers primary source",
              ],
              [
                  "discovery",
                  "huggingface",
                  "site:huggingface.co new trending inference model checkpoints providers official model cards",
              ],
              [
                  "discovery",
                  "replit",
                  "site:replit.com new inference models niche providers developer applications",
              ],
              [
                  "discovery",
                  "github",
                  "site:github.com new inference model checkpoints niche providers official repositories",
              ],
          ];
    assert.ok(
        searches.every(([, , query]) => query.length <= 700),
        "Checkpoint query exceeds 700 characters",
    );
    const candidates = new Map();
    let omittedCandidates = 0;
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
            omittedGaps: Math.max(0, gaps.length - 8),
        });
        const decision = await services.control({
            stage,
            models: names,
            actions: menu,
            evidence: snapshot,
            remainingPollen: services.remainingPollen?.(),
        });
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
        const raw = await services.search(query, "exa");
        action.status = "searched";
        const receipt = `${mode}:exa:challenge:${query}`;
        if (!scopes.has(scope)) scopes.set(scope, new Set());
        scopes.get(scope).add(receipt);
        for (const name of queryModels) {
            if (!coverage.get(name).has(scope))
                coverage.get(name).set(scope, new Set());
            coverage.get(name).get(scope).add(receipt);
        }
        for (const lead of parseLeads(raw)) {
            let saved = candidates.get(lead.url);
            if (!saved) {
                if (candidates.size >= 32) {
                    omittedCandidates++;
                    continue;
                }
                saved = {
                    ...lead,
                    id: `lead-${candidates.size + 1}`,
                    models: queryModels.filter((name) =>
                        mentions(
                            `${lead.title}\n${lead.text}\n${lead.url}`,
                            name,
                        ),
                    ),
                    scopes: [],
                    queryModels: [],
                };
                candidates.set(lead.url, saved);
            } else {
                // Keep the first exact excerpt, but retain identities observed in later search snippets.
                for (const name of queryModels.filter((name) =>
                    mentions(`${lead.title}\n${lead.text}\n${lead.url}`, name),
                )) {
                    if (!saved.models.includes(name)) saved.models.push(name);
                }
            }
            if (!saved.scopes.includes(scope)) saved.scopes.push(scope);
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
                const platform =
                    mode === "reddit"
                        ? "reddit.com"
                        : mode === "huggingface"
                          ? "huggingface.co"
                          : mode === "replit"
                            ? "replit.com"
                            : "github.com";
                const lead = ranked.find(
                    (item) =>
                        new URL(item.url).hostname === platform ||
                        new URL(item.url).hostname.endsWith(`.${platform}`),
                );
                if (lead) selected.add(lead);
                else gaps.push(`${mode}: no usable platform lead returned`);
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
        const scopeLeads = [...scopes.keys()].map((scope) =>
            ranked.filter((lead) => lead.scopes.includes(scope)),
        );
        for (const rows of scopeLeads) {
            if (rows.length && !rows.some((lead) => selected.has(lead)))
                selected.add(rows[0]);
        }
        while (selected.size < Math.min(16, ranked.length)) {
            for (const rows of scopeLeads) {
                const lead = rows.find((item) => !selected.has(item));
                if (lead && selected.size < 16) selected.add(lead);
            }
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
                "Additional search results omitted because of the thirty-two-candidate preparation bound",
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
            action.status = source.status;
        }
        let followed = 0;
        if (services.control) {
            const attempted = new Set();
            const attemptedModels = new Set();
            const followupActions = () =>
                officialCandidates(task.models ?? [], sources)
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
                      task: "Synthesize fetched cross-platform discovery leads into source-bound model/provider discoveries; identify popularity versus documented managed availability.",
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
        if (unselectedLeadIds.length)
            gaps.push(
                `${unselectedLeadIds.length} leads were not read because of the sixteen-lead preparation bound`,
            );
        return evidence();
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
