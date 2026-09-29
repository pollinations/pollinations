/**
 * Text-model catalog helpers: what to score, what a request costs, and which
 * community models are wearing an official model's name.
 */

export const MODELS_PATH = "/text/models";
export const DEFAULT_BASE_URL = "https://gen.pollinations.ai";

export type ModelPricing = {
    promptTextTokens: number;
    completionTextTokens: number;
    promptCachedTokens: number;
};

export type TextModel = {
    name: string;
    aliases: string[];
    title: string;
    publisher: string;
    community: boolean;
    specialized: boolean;
    health: string;
    pricing: ModelPricing;
    supportedParameters: string[];
};

export type TokenUsage = {
    prompt: number;
    completion: number;
};

type RawRecord = Record<string, unknown>;

function asString(value: unknown): string {
    return typeof value === "string" ? value : "";
}

function asNumberOrNull(value: unknown): number | null {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asStringList(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return [];
    }
    return value.filter((item): item is string => typeof item === "string");
}

const PRICE_KEYS = [
    "promptTextTokens",
    "completionTextTokens",
    "promptCachedTokens",
] as const;

/**
 * Prices arrive as numbers in the fixtures but as decimal strings from
 * `GET /text/models` (`"0.0000001"`), so both spellings have to be understood or
 * every model looks free.
 */
function asPrice(value: unknown): number | null {
    if (typeof value === "string") {
        const parsed = Number(value);
        return value.trim() !== "" && Number.isFinite(parsed) ? parsed : null;
    }
    return asNumberOrNull(value);
}

export function normalizePricing(value: unknown): ModelPricing {
    const record: RawRecord =
        typeof value === "object" && value !== null ? (value as RawRecord) : {};
    const pricing = {
        promptTextTokens: 0,
        completionTextTokens: 0,
        promptCachedTokens: 0,
    };
    for (const key of PRICE_KEYS) {
        pricing[key] = asPrice(record[key]) ?? 0;
    }
    return pricing;
}

export function normalizeTextModel(value: unknown): TextModel | null {
    if (typeof value !== "object" || value === null) {
        return null;
    }
    const record = value as RawRecord;
    const name = asString(record.name);
    if (!name) {
        return null;
    }
    const category = asString(record.category);
    if (category && category !== "text") {
        return null;
    }
    const health = asString((record.health as RawRecord | undefined)?.status);
    return {
        name,
        aliases: asStringList(record.aliases),
        title: asString(record.title),
        publisher: asString(record.publisher),
        community: record.community === true,
        specialized: record.is_specialized === true,
        health: health || "unknown",
        pricing: normalizePricing(record.pricing),
        supportedParameters: asStringList(record.supported_parameters),
    };
}

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export async function fetchTextModels(options: {
    baseUrl?: string;
    apiKey: string;
    fetchImpl?: FetchLike;
    includeSpecialized?: boolean;
}): Promise<TextModel[]> {
    const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    const fetchImpl = options.fetchImpl ?? fetch;
    const response = await fetchImpl(`${baseUrl}${MODELS_PATH}`, {
        headers: { Authorization: `Bearer ${options.apiKey}` },
    });
    if (!response.ok) {
        throw new Error(
            `GET ${baseUrl}${MODELS_PATH} failed with HTTP ${response.status}`,
        );
    }
    const payload = await response.json();
    const rows = Array.isArray(payload) ? payload : [];
    const models: TextModel[] = [];
    for (const row of rows) {
        const model = normalizeTextModel(row);
        if (!model) {
            continue;
        }
        if (model.specialized && options.includeSpecialized !== true) {
            continue;
        }
        models.push(model);
    }
    return models.sort((a, b) => a.name.localeCompare(b.name));
}

export type RunFilter = "all" | "official" | "community";

/**
 * Pick the models to run.
 *
 * Explicit `--models` names always win, so a reviewer can reproduce the PR's run
 * without paying for the whole catalog.
 */
export function selectModels(
    models: readonly TextModel[],
    options: { filter?: RunFilter; names?: readonly string[] } = {},
): TextModel[] {
    const names = (options.names ?? [])
        .map((name) => name.trim().toLowerCase())
        .filter(Boolean);
    if (names.length > 0) {
        return models.filter((model) =>
            names.some((name) => matchesName(model, name)),
        );
    }
    const filter = options.filter ?? "all";
    if (filter === "official") {
        return models.filter((model) => !model.community);
    }
    if (filter === "community") {
        return models.filter((model) => model.community);
    }
    return [...models];
}

export function matchesName(model: TextModel, name: string): boolean {
    const wanted = name.toLowerCase();
    return (
        model.name.toLowerCase() === wanted ||
        model.name.toLowerCase().endsWith(`/${wanted}`) ||
        model.aliases.some((alias) => alias.toLowerCase() === wanted)
    );
}

/** Only advertise a token cap the model says it accepts. */
export function tokenLimitParameter(
    model: TextModel,
): "max_tokens" | "max_completion_tokens" | null {
    if (model.supportedParameters.includes("max_tokens")) {
        return "max_tokens";
    }
    if (model.supportedParameters.includes("max_completion_tokens")) {
        return "max_completion_tokens";
    }
    return null;
}

/** Rough prompt length, only used to order models by expected price. */
export function estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
}

export function hasPricing(model: TextModel): boolean {
    return (
        model.pricing.promptTextTokens > 0 ||
        model.pricing.completionTextTokens > 0
    );
}

export function requestCost(model: TextModel, usage: TokenUsage): number {
    return (
        usage.prompt * model.pricing.promptTextTokens +
        usage.completion * model.pricing.completionTextTokens
    );
}

export function estimateModelCost(
    model: TextModel,
    options: {
        promptTokens: number;
        maxOutputTokens: number;
        questions: number;
    },
): number {
    const perQuestion = requestCost(model, {
        prompt: options.promptTokens,
        completion: options.maxOutputTokens,
    });
    return perQuestion * options.questions;
}

const MODEL_NAME_SEPARATOR = /[._]/g;

export function shortModelName(name: string): string {
    const parts = name.split("/").filter(Boolean);
    return parts.length > 0 ? parts[parts.length - 1] : name;
}

/**
 * Lowercase the short name and treat `.`/`_`/`-` as the same separator, so
 * `community/MarcosFRG/gpt_oss_120b` and `openai/gpt-oss-120b` compare equal.
 */
export function normalizeModelName(name: string): string {
    return shortModelName(name)
        .toLowerCase()
        .replace(MODEL_NAME_SEPARATOR, "-")
        .replace(/-+/g, "-");
}

export type ModelPair = {
    community: string;
    official: string;
    match: "exact" | "prefix";
};

/**
 * Find community models that carry an official model's name.
 *
 * Two strategies, in order: the same normalized short name (a clone), or an
 * official name used as a prefix at a token boundary (`kimi-k3-free` next to
 * `moonshotai/kimi-k3`).
 */
export function pairCommunityWithOfficial(
    models: readonly TextModel[],
): ModelPair[] {
    const officials = models.filter((model) => !model.community);
    const byNormalized = new Map<string, TextModel>();
    for (const model of officials) {
        const key = normalizeModelName(model.name);
        const existing = byNormalized.get(key);
        if (!existing || model.name.length < existing.name.length) {
            byNormalized.set(key, model);
        }
    }
    const pairs: ModelPair[] = [];
    for (const model of models) {
        if (!model.community) {
            continue;
        }
        const normalized = normalizeModelName(model.name);
        const exact = byNormalized.get(normalized);
        if (exact) {
            pairs.push({
                community: model.name,
                official: exact.name,
                match: "exact",
            });
            continue;
        }
        let best: TextModel | null = null;
        let bestKeyLength = 0;
        for (const [key, candidate] of byNormalized) {
            if (
                !normalized.startsWith(`${key}-`) ||
                key.length <= bestKeyLength
            ) {
                continue;
            }
            best = candidate;
            bestKeyLength = key.length;
        }
        if (best) {
            pairs.push({
                community: model.name,
                official: best.name,
                match: "prefix",
            });
        }
    }
    return pairs.sort((a, b) => a.community.localeCompare(b.community));
}
