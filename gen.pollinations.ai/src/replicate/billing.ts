import type { Logger } from "@logtape/logtape";
import { cached } from "../cache.ts";

const REPLICATE_PAGE_CACHE_TTL_SECONDS = 24 * 60 * 60;
const REPLICATE_MODEL_RE =
    /^[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/;
const PER_SECOND_PRICE_RE = /"price"\s*:\s*"\$([0-9.]+)\s+per\s+second"/;

export type ReplicateTimePricedConfig = {
    slug: string;
    version: string;
    dollarsPerSecond: number;
    priceLabel: string;
    hardware?: string;
};

type ReplicateModelResponse = {
    latest_version?: {
        id?: string;
    };
};

type ParsedReplicatePage = {
    dollarsPerSecond: number;
    priceLabel: string;
    hardware?: string;
} | null;

export function isValidReplicateModelSlug(slug: string): boolean {
    return REPLICATE_MODEL_RE.test(slug);
}

export async function getReplicateTimePricedConfig(opts: {
    slug: string;
    token: string;
    kv: KVNamespace;
    log: Logger;
}): Promise<ReplicateTimePricedConfig | null> {
    const fetchCached = cached(fetchReplicateTimePricedConfig, {
        ttl: REPLICATE_PAGE_CACHE_TTL_SECONDS,
        kv: opts.kv,
        log: opts.log,
        keyGenerator: (slug) => `replicate:time-priced:${slug}`,
    });

    return await fetchCached(opts.slug, opts.token);
}

async function fetchReplicateTimePricedConfig(
    slug: string,
    token: string,
): Promise<ReplicateTimePricedConfig | null> {
    const [pageResponse, modelResponse] = await Promise.all([
        fetch(`https://replicate.com/${slug}`),
        fetch(`https://api.replicate.com/v1/models/${slug}`, {
            headers: { Authorization: `Bearer ${token}` },
        }),
    ]);

    if (pageResponse.status === 404 || modelResponse.status === 404) {
        return null;
    }
    if (!pageResponse.ok || !modelResponse.ok) {
        throw new Error(
            `Failed to fetch Replicate model pricing for ${slug}: page=${pageResponse.status} model=${modelResponse.status}`,
        );
    }

    const [html, model] = await Promise.all([
        pageResponse.text(),
        modelResponse.json() as Promise<ReplicateModelResponse>,
    ]);
    const parsedPage = parseReplicateTimePricedPage(html);
    const versionId = model.latest_version?.id;

    if (!parsedPage || !versionId) return null;

    return {
        slug,
        version: `${slug}:${versionId}`,
        ...parsedPage,
    };
}

export function parseReplicateTimePricedPage(
    html: string,
): ParsedReplicatePage {
    const billingConfig = extractJsonField(html, "billingConfig");
    if (billingConfig !== null) return null;

    const priceMatch = html.match(PER_SECOND_PRICE_RE);
    const dollarsPerSecond = priceMatch?.[1]
        ? Number(priceMatch[1])
        : Number.NaN;
    if (!Number.isFinite(dollarsPerSecond) || dollarsPerSecond <= 0) {
        return null;
    }

    return {
        dollarsPerSecond,
        priceLabel: `$${priceMatch?.[1]} per second`,
        hardware: html.match(/"hardware"\s*:\s*"([^"]+)"/)?.[1],
    };
}

export function calculateReplicateProviderBillingDollars(opts: {
    predictTimeSeconds?: number;
    dollarsPerSecond: number;
}): number {
    const predictTimeSeconds = opts.predictTimeSeconds ?? 0;
    if (!Number.isFinite(predictTimeSeconds) || predictTimeSeconds <= 0) {
        return 0;
    }
    return predictTimeSeconds * opts.dollarsPerSecond;
}

function extractJsonField(html: string, field: string): unknown {
    const marker = `"${field}":`;
    const start = html.indexOf(marker);
    if (start === -1) return undefined;

    let index = start + marker.length;
    while (/\s/.test(html[index])) index++;

    if (html.startsWith("null", index)) return null;

    const open = html[index];
    const close = open === "{" ? "}" : open === "[" ? "]" : null;
    if (!close) return undefined;

    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let cursor = index; cursor < html.length; cursor++) {
        const char = html[cursor];
        if (inString) {
            if (escaped) {
                escaped = false;
            } else if (char === "\\") {
                escaped = true;
            } else if (char === '"') {
                inString = false;
            }
            continue;
        }

        if (char === '"') {
            inString = true;
        } else if (char === open) {
            depth++;
        } else if (char === close) {
            depth--;
            if (depth === 0) {
                return JSON.parse(html.slice(index, cursor + 1));
            }
        }
    }

    return undefined;
}
