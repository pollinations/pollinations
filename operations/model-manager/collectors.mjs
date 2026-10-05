// Read-only source adapters. Source failures preserve the other observations.
export const USER_AGENT =
    "Mozilla/5.0 (compatible; PollinationsModelManager/0.1)";

export async function request(url, headers = {}) {
    const response = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, ...headers },
        signal: AbortSignal.timeout(30_000),
        redirect: "error",
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const reader = response.body.getReader();
    const chunks = [];
    let bytes = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.length;
        if (bytes > 16 * 1024 * 1024) {
            await reader.cancel();
            throw new Error("Response exceeds 16 MiB");
        }
        chunks.push(value);
    }
    const text = Buffer.concat(chunks).toString("utf8");
    return { text, headers: response.headers };
}

async function json(url, headers) {
    return JSON.parse((await request(url, headers)).text);
}

export function rows(data, key) {
    const list = key ? data?.[key] : data;
    if (!Array.isArray(list))
        throw new Error("Source schema changed: expected array");
    return list;
}

export function nextPage(next, current) {
    if (!next) return null;
    const url = new URL(next, current);
    if (url.origin !== new URL(current).origin) {
        throw new Error("Source pagination changed origin");
    }
    return url.href;
}

async function query(source, label, url, load) {
    try {
        const result = await load();
        for (const item of result.items) {
            if (typeof item.id !== "string" || !item.id)
                throw new Error("Source schema changed: missing identity");
        }
        source.queries.push({
            label,
            url,
            status: result.partial ? "partial" : "complete",
            count: result.items.length,
            next: result.next ?? null,
        });
        for (const item of result.items) {
            const existing = source.observations.find(
                (row) => row.id === item.id,
            );
            if (existing) {
                const signals = [...existing.signals, ...item.signals];
                Object.assign(existing, item, { signals });
            } else source.observations.push(item);
        }
    } catch (error) {
        // Do not persist upstream error bodies: they can contain credential material.
        source.queries.push({
            label,
            url,
            status: "unavailable",
            error: error.message.startsWith("HTTP ")
                ? error.message
                : "Request failed or source schema changed",
        });
    }
}

function finish(source) {
    const complete = source.queries.every((q) => q.status === "complete");
    return {
        ...source,
        status: complete
            ? "complete"
            : source.observations.length
              ? "partial"
              : "unavailable",
    };
}

export const HF_TASKS = {
    text: ["text-generation", "image-text-to-text"],
    image: ["text-to-image", "image-to-image"],
    video: ["text-to-video", "image-to-video"],
    audio: ["text-to-speech", "automatic-speech-recognition", "audio-to-audio"],
    embedding: ["feature-extraction", "sentence-similarity"],
    "3d": ["image-to-3d", "text-to-3d"],
};

export async function huggingFace(categories, previousTime) {
    const source = { source: "huggingface", observations: [], queries: [] };
    const tasks = [
        ...new Set(categories.flatMap((category) => HF_TASKS[category] ?? [])),
    ];
    for (const task of [null, ...tasks]) {
        const url = new URL("https://huggingface.co/api/models");
        url.searchParams.set("sort", "trendingScore");
        url.searchParams.set("direction", "-1");
        url.searchParams.set("limit", task ? "20" : "50");
        if (task) url.searchParams.set("pipeline_tag", task);
        for (const field of [
            "trendingScore",
            "pipeline_tag",
            "createdAt",
            "likes",
            "downloads",
            "sha",
            "cardData",
        ])
            url.searchParams.append("expand[]", field);
        await query(source, task ?? "global", url.href, async () => ({
            items: rows(await json(url)).map((m, i) => ({
                id: m.id,
                url: `https://huggingface.co/${m.id}`,
                task: m.pipeline_tag,
                version: m.sha,
                createdAt: m.createdAt,
                likes: m.likes,
                downloads: m.downloads,
                license: m.cardData?.license,
                trendingScore: m.trendingScore,
                signals: [{ kind: "trending", rank: i + 1, task }],
            })),
        }));
    }
    const url =
        "https://huggingface.co/api/models?sort=createdAt&direction=-1&limit=200&expand[]=createdAt&expand[]=pipeline_tag&expand[]=sha";
    await query(source, "newest", url, async () => {
        const response = await request(url);
        const list = rows(JSON.parse(response.text));
        const cutoff = previousTime
            ? Date.parse(previousTime) - 48 * 3600_000
            : Date.now() - 7 * 86400_000;
        const reached = list.some((m) => Date.parse(m.createdAt) < cutoff);
        return {
            partial: !reached && !!response.headers.get("link"),
            next: !reached ? response.headers.get("link") : null,
            items: list
                .filter((m) => Date.parse(m.createdAt) >= cutoff)
                .map((m) => ({
                    id: m.id,
                    url: `https://huggingface.co/${m.id}`,
                    task: m.pipeline_tag,
                    createdAt: m.createdAt,
                    version: m.sha,
                    signals: [{ kind: "new_release" }],
                })),
        };
    });
    return finish(source);
}

export async function openRouter() {
    const source = { source: "openrouter", observations: [], queries: [] };
    for (const [label, suffix] of [
        ["catalog", ""],
        ["newest", "?sort=newest&limit=50"],
        ["weekly", "?sort=top-weekly&limit=20"],
    ]) {
        const url = `https://openrouter.ai/api/v1/models${suffix}`;
        await query(source, label, url, async () => {
            const data = await json(url);
            const list = rows(data, "data");
            return {
                partial: label === "catalog" && data.total_count > list.length,
                next: label === "catalog" ? data.links?.next : null,
                items: list.map((m, i) => ({
                    id: m.id,
                    url: `https://openrouter.ai/${m.id}`,
                    description: m.description,
                    createdAt: new Date(m.created * 1000).toISOString(),
                    hfId: m.hugging_face_id,
                    pricing: m.pricing,
                    contextLength: m.context_length,
                    inputModalities: m.architecture?.input_modalities,
                    outputModalities: m.architecture?.output_modalities,
                    parameters: m.supported_parameters,
                    retirementDate: m.expiration_date,
                    signals: [{ kind: label, rank: i + 1 }],
                })),
            };
        });
    }
    return finish(source);
}

export async function fal() {
    const source = { source: "fal", observations: [], queries: [] };
    let url = "https://api.fal.ai/v1/models?limit=100";
    for (let page = 0; url && page < 20; page++) {
        let next = null;
        const current = url;
        await query(source, `catalog-${page + 1}`, current, async () => {
            const data = await json(current);
            if (data.has_more && !data.next_cursor)
                throw new Error("Source pagination missing cursor");
            if (data.has_more) {
                const nextUrl = new URL(
                    "https://api.fal.ai/v1/models?limit=100",
                );
                nextUrl.searchParams.set("cursor", data.next_cursor);
                next = nextUrl.href;
            }
            return {
                partial: !!next && page === 19,
                next,
                items: rows(data, "models").map((m) => ({
                    id: m.endpoint_id,
                    url: `https://fal.ai/models/${m.endpoint_id}`,
                    description: m.metadata?.description,
                    task: m.metadata?.category,
                    createdAt: m.metadata?.date,
                    version: m.metadata?.updated_at,
                    lifecycle: m.metadata?.status,
                    license: m.metadata?.license_type,
                    signals: [
                        { kind: "catalog" },
                        ...(m.metadata?.highlighted
                            ? [{ kind: "editorial" }]
                            : []),
                    ],
                })),
            };
        });
        url = next;
    }
    return finish(source);
}

function replicateModel(m, signal) {
    if (typeof m.owner !== "string" || typeof m.name !== "string")
        throw new Error("Source schema changed: missing Replicate owner/name");
    const schema = m.latest_version?.openapi_schema?.components?.schemas;
    return {
        id: `${m.owner}/${m.name}`,
        url: `https://replicate.com/${m.owner}/${m.name}`,
        description: m.description,
        runs: m.run_count,
        version: m.latest_version?.id,
        createdAt: m.latest_version?.created_at,
        licenseUrl: m.license_url,
        inputSchema: schema?.Input,
        outputSchema: schema?.Output,
        signals: [signal],
    };
}

export async function replicate(token, history) {
    const source = { source: "replicate", observations: [], queries: [] };
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    if (!token) {
        source.queries.push({
            label: "api",
            status: "unavailable",
            error: "Existing REPLICATE_API_TOKEN required",
        });
        return finish(source);
    }
    for (const [task, slug] of [
        ["text-to-image", "text-to-image"],
        ["image-to-image", "image-editing"],
        ["text-to-video", "text-to-video"],
        ["text-to-speech", "text-to-speech"],
    ]) {
        const url = `https://api.replicate.com/v1/collections/${slug}`;
        await query(source, `collection-${task}`, url, async () => ({
            items: rows(await json(url, headers), "models").map((m) => ({
                ...replicateModel(m, { kind: "collection", task }),
                task,
            })),
        }));
    }
    for (const sort of ["model_created_at", "latest_version_created_at"]) {
        let url = `https://api.replicate.com/v1/models?sort_by=${sort}&sort_direction=desc`;
        let count = 0;
        const cutoff = history.length
            ? Date.parse(history.at(-1).at) - 48 * 3600_000
            : Date.now() - 7 * 86400_000;
        while (url && count < 200) {
            const current = url;
            let next = null;
            await query(source, sort, current, async () => {
                const data = await json(current, headers);
                const list = rows(data, "results");
                count += list.length;
                // The model record lacks a documented creation timestamp; don't use its version date as model creation.
                const reached =
                    sort === "latest_version_created_at" &&
                    list.some(
                        (m) =>
                            Date.parse(m.latest_version?.created_at) < cutoff,
                    );
                next = reached ? null : nextPage(data.next, current);
                return {
                    partial: !!next && count >= 200,
                    next,
                    items: list.map((m) =>
                        replicateModel(m, {
                            kind:
                                sort === "model_created_at"
                                    ? "new_model_listing"
                                    : "version_listing",
                        }),
                    ),
                };
            });
            url = next;
        }
    }
    const watched = history.flatMap(
        (day) =>
            day.sources.find((s) => s.source === "replicate")?.observations ??
            [],
    );
    const watchlist = [
        ...new Set([
            ...watched.map((m) => m.id),
            ...source.observations.map((m) => m.id),
        ]),
    ].slice(0, 200);
    for (const id of watchlist) {
        if (
            source.observations.some(
                (m) => m.id === id && Number.isFinite(m.runs),
            )
        )
            continue;
        const url = `https://api.replicate.com/v1/models/${id}`;
        await query(source, "watchlist", url, async () => ({
            items: [
                replicateModel(await json(url, headers), { kind: "tracked" }),
            ],
        }));
    }
    return finish(source);
}

export async function falPrices(ids, token) {
    if (!token)
        return {
            status: "unavailable",
            prices: [],
            reason: "Existing FAL_KEY required",
        };
    const url = new URL("https://api.fal.ai/v1/models/pricing");
    for (const id of ids.slice(0, 50))
        url.searchParams.append("endpoint_id", id);
    if (!ids.length) return { status: "complete", prices: [] };
    try {
        const data = await json(url, { Authorization: `Key ${token}` });
        return {
            status: data.has_more || ids.length > 50 ? "partial" : "complete",
            prices: rows(data, "prices"),
            url: url.href,
        };
    } catch {
        return {
            status: "unavailable",
            prices: [],
            reason: "Authenticated pricing request failed",
        };
    }
}
