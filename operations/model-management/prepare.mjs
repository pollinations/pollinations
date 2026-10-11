import assert from "node:assert/strict";

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

function mentions(text, name) {
    const slug = name.split("/").at(-1);
    const escaped = slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(
        `(?<![a-z0-9])${escaped}(?![a-z0-9]|[._-][a-z0-9])`,
        "i",
    ).test(text);
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
    try {
        for (const [scope, mode, query] of searches) {
            const action = {
                tool: "search",
                scope,
                mode,
                engine: "exa",
                purpose: "challenge",
                query,
                models: [...names],
                status: "pending",
            };
            actions.push(action);
            const raw = await services.search(query, "exa");
            action.status = "searched";
            const receipt = `${mode}:exa:challenge:${query}`;
            if (!scopes.has(scope)) scopes.set(scope, new Set());
            scopes.get(scope).add(receipt);
            for (const name of names) {
                coverage.get(name).set(scope, new Set([receipt]));
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
                        models: names.filter((name) =>
                            mentions(`${lead.title}\n${lead.text}`, name),
                        ),
                        scopes: [],
                        queryModels: [],
                    };
                    candidates.set(lead.url, saved);
                } else {
                    // Keep the first exact excerpt, but retain identities observed in later search snippets.
                    for (const name of names.filter((name) =>
                        mentions(`${lead.title}\n${lead.text}`, name),
                    )) {
                        if (!saved.models.includes(name))
                            saved.models.push(name);
                    }
                }
                if (!saved.scopes.includes(scope)) saved.scopes.push(scope);
                for (const name of names)
                    if (!saved.queryModels.includes(name))
                        saved.queryModels.push(name);
            }
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
        for (const lead of ranked) if (selected.size < 16) selected.add(lead);
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
