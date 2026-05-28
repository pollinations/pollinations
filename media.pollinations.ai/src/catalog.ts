const CATALOG_PREFIX = "catalog/v1";
const DEFAULT_LIST_LIMIT = 50;
const MAX_LIST_LIMIT = 100;
const MAX_TAGS = 20;
const MAX_TAG_LENGTH = 96;
const MAX_TEXT_LENGTH = 1000;
const MAX_MODEL_LENGTH = 128;
const MAX_CONTENT_TYPE_LENGTH = 128;
const REVERSE_TIMESTAMP_MAX = 9_999_999_999_999;
const RESERVED_SYSTEM_TAG_PREFIXES = ["app:", "hash:"];

const ALLOWED_CATALOG_HOSTS = new Set([
    "gen.pollinations.ai",
    "media.pollinations.ai",
]);

const CATALOG_URL_PARAMS = new Set([
    "key",
    "save",
    "catalog",
    "tag",
    "tags",
    "visibility",
]);

export type Visibility = "private" | "public" | "unlisted";

export interface CatalogFields {
    visibility: Visibility;
    tags: string[];
    prompt?: string;
    model?: string;
    contentType?: string;
    size?: number;
}

export interface CatalogEntry {
    entryId: string;
    url: string;
    hash?: string;
    contentType?: string;
    size?: number;
    createdAt: string;
    visibility: Visibility;
    tags: string[];
    prompt?: string;
    model?: string;
    ownerUserId?: string;
    ownerName?: string | null;
    apiKeyId?: string;
    keyType?: string;
    appKeyId?: string | null;
    appName?: string | null;
    appOwnerUserId?: string | null;
}

export type CatalogPublicItem = ReturnType<typeof catalogItem>;

export function catalogFieldsFromFormData(formData: FormData): CatalogFields {
    return normalizeCatalogFields({
        tag: formData.getAll("tag"),
        tags: formData.getAll("tags"),
        visibility: formData.get("visibility"),
        prompt: formData.get("prompt"),
        model: formData.get("model"),
        contentType: formData.get("contentType"),
        size: formData.get("size"),
    });
}

export function catalogFieldsFromObject(
    body: Record<string, unknown>,
): CatalogFields {
    return normalizeCatalogFields(body);
}

export function catalogFieldsFromSearchParams(
    params: URLSearchParams,
): CatalogFields {
    return normalizeCatalogFields({
        tag: params.getAll("tag"),
        tags: params.getAll("tags"),
        visibility: params.get("visibility"),
        prompt: params.get("prompt"),
        model: params.get("model"),
        contentType: params.get("contentType"),
        size: params.get("size"),
    });
}

export function normalizeTag(input: unknown): string | null {
    if (typeof input !== "string") return null;
    const tag = input
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9._:-]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^[-.:_]+|[-.:_]+$/g, "")
        .slice(0, MAX_TAG_LENGTH);
    return tag || null;
}

export function safeFacet(input: unknown, fallback = "unknown"): string {
    return normalizeTag(String(input ?? "")) || fallback;
}

export function parseListLimit(value: string | null): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIST_LIMIT;
    return Math.min(Math.floor(parsed), MAX_LIST_LIMIT);
}

export function createCatalogEntry(input: {
    url: string;
    hash?: string;
    contentType?: string;
    size?: number;
    fields: CatalogFields;
    ownerUserId?: string;
    ownerName?: string | null;
    apiKeyId?: string;
    keyType?: string;
    appKeyId?: string | null;
    appName?: string | null;
    appOwnerUserId?: string | null;
}): CatalogEntry {
    const tags = mergeTags(input.fields.tags, [
        input.hash ? `hash:${input.hash}` : null,
        input.appKeyId ? `app:${input.appKeyId}` : null,
    ]);

    return {
        entryId: crypto.randomUUID(),
        url: input.url,
        ...(input.hash && { hash: input.hash }),
        ...(input.contentType && { contentType: input.contentType }),
        ...(input.size !== undefined && { size: input.size }),
        createdAt: new Date().toISOString(),
        visibility: input.fields.visibility,
        tags,
        ...(input.fields.prompt && { prompt: input.fields.prompt }),
        ...(input.fields.model && { model: input.fields.model }),
        ...(input.ownerUserId && { ownerUserId: input.ownerUserId }),
        ownerName: input.ownerName ?? null,
        ...(input.apiKeyId && { apiKeyId: input.apiKeyId }),
        ...(input.keyType && { keyType: input.keyType }),
        appKeyId: input.appKeyId ?? null,
        appName: input.appName ?? null,
        appOwnerUserId: input.appOwnerUserId ?? null,
    };
}

export async function writeCatalogEntry(
    bucket: R2Bucket,
    entry: CatalogEntry,
): Promise<void> {
    const body = JSON.stringify(entry);
    const keys = new Set<string>([
        `${CATALOG_PREFIX}/entries/${entry.entryId}.json`,
    ]);

    const suffix = `${reverseTimestamp(entry.createdAt)}-${entry.entryId}.json`;
    const ownerFacet = safeFacet(entry.ownerUserId || entry.ownerName);
    if (ownerFacet !== "unknown") {
        keys.add(`${CATALOG_PREFIX}/owner/${ownerFacet}/${suffix}`);
    }

    if (entry.visibility === "public") {
        for (const tag of entry.tags) {
            keys.add(`${CATALOG_PREFIX}/tag/${safeFacet(tag)}/${suffix}`);
        }
    }

    await Promise.all(
        [...keys].map((key) =>
            bucket.put(key, body, {
                httpMetadata: { contentType: "application/json" },
            }),
        ),
    );
}

export async function listCatalogEntries(
    bucket: R2Bucket,
    prefix: string,
    limit: number,
): Promise<CatalogEntry[]> {
    const listed = await bucket.list({ prefix, limit });
    const entries = await Promise.all(
        listed.objects.map(async (object) => {
            try {
                const stored = await bucket.get(object.key);
                if (!stored) return null;
                return await stored.json<CatalogEntry>();
            } catch {
                return null;
            }
        }),
    );

    const seen = new Set<string>();
    return entries.filter((entry): entry is CatalogEntry => {
        if (!entry || seen.has(entry.entryId)) return false;
        seen.add(entry.entryId);
        return true;
    });
}

export function catalogPrefix(kind: "owner" | "tag", facet?: string): string {
    return `${CATALOG_PREFIX}/${kind}/${safeFacet(facet)}/`;
}

export function catalogItem(entry: CatalogEntry, includePrivateFields = false) {
    const item = {
        entryId: entry.entryId,
        url: entry.url,
        ...(entry.hash && { hash: entry.hash }),
        ...(entry.contentType && { contentType: entry.contentType }),
        ...(entry.size !== undefined && { size: entry.size }),
        createdAt: entry.createdAt,
        visibility: entry.visibility,
        tags: entry.tags,
        ...(entry.prompt && { prompt: entry.prompt }),
        ...(entry.model && { model: entry.model }),
        ...(entry.appKeyId && { appKeyId: entry.appKeyId }),
        ...(entry.appName && { appName: entry.appName }),
    };

    if (!includePrivateFields) return item;

    return {
        ...item,
        ...(entry.ownerUserId && { ownerUserId: entry.ownerUserId }),
        ...(entry.ownerName && { ownerName: entry.ownerName }),
        ...(entry.apiKeyId && { apiKeyId: entry.apiKeyId }),
        ...(entry.keyType && { keyType: entry.keyType }),
        ...(entry.appOwnerUserId && { appOwnerUserId: entry.appOwnerUserId }),
    };
}

export function normalizeCatalogUrl(input: unknown): {
    url: string;
    hash?: string;
} {
    if (typeof input !== "string" || !input.trim()) {
        throw new Error("url is required");
    }

    const url = new URL(input);
    if (url.protocol !== "https:") {
        throw new Error("Only HTTPS media URLs can be cataloged");
    }

    if (!ALLOWED_CATALOG_HOSTS.has(url.hostname)) {
        throw new Error("Only Pollinations media URLs can be cataloged");
    }

    for (const param of CATALOG_URL_PARAMS) {
        url.searchParams.delete(param);
    }

    const firstPathSegment = url.pathname.split("/").filter(Boolean)[0];
    const hash =
        url.hostname === "media.pollinations.ai" &&
        /^[a-f0-9]{16}$/i.test(firstPathSegment)
            ? firstPathSegment.toLowerCase()
            : undefined;

    return {
        url: url.toString(),
        ...(hash && { hash }),
    };
}

function normalizeCatalogFields(raw: Record<string, unknown>): CatalogFields {
    return {
        visibility: normalizeVisibility(raw.visibility),
        tags: normalizeTags([raw.tag, raw.tags]),
        ...(normalizeText(raw.prompt, MAX_TEXT_LENGTH) && {
            prompt: normalizeText(raw.prompt, MAX_TEXT_LENGTH),
        }),
        ...(normalizeText(raw.model, MAX_MODEL_LENGTH) && {
            model: normalizeText(raw.model, MAX_MODEL_LENGTH),
        }),
        ...(normalizeText(raw.contentType, MAX_CONTENT_TYPE_LENGTH) && {
            contentType: normalizeText(
                raw.contentType,
                MAX_CONTENT_TYPE_LENGTH,
            ),
        }),
        ...(normalizeSize(raw.size) !== undefined && {
            size: normalizeSize(raw.size),
        }),
    };
}

function normalizeVisibility(input: unknown): Visibility {
    return input === "public" || input === "unlisted" || input === "private"
        ? input
        : "private";
}

function normalizeText(input: unknown, maxLength: number): string | undefined {
    if (typeof input !== "string") return undefined;
    const text = input.trim().slice(0, maxLength);
    return text || undefined;
}

function normalizeSize(input: unknown): number | undefined {
    const value = Number(input);
    if (!Number.isFinite(value) || value < 0) return undefined;
    return Math.floor(value);
}

function normalizeTags(input: unknown[]): string[] {
    const seen = new Set<string>();
    for (const part of input.flatMap(tagParts)) {
        const tag = normalizeTag(part);
        if (!tag || isReservedSystemTag(tag) || seen.has(tag)) continue;
        seen.add(tag);
        if (seen.size >= MAX_TAGS) break;
    }
    return [...seen];
}

function mergeTags(
    userTags: string[],
    systemTagInputs: Array<string | null>,
): string[] {
    const seen = new Set(userTags);
    for (const input of systemTagInputs) {
        const tag = normalizeTag(input);
        if (tag) seen.add(tag);
    }
    return [...seen];
}

function isReservedSystemTag(tag: string): boolean {
    return RESERVED_SYSTEM_TAG_PREFIXES.some((prefix) =>
        tag.startsWith(prefix),
    );
}

function tagParts(input: unknown): string[] {
    if (input === undefined || input === null) return [];
    if (Array.isArray(input)) return input.flatMap(tagParts);
    if (typeof input !== "string") return [String(input)];

    const trimmed = input.trim();
    if (!trimmed) return [];

    if (trimmed.startsWith("[")) {
        try {
            const parsed = JSON.parse(trimmed);
            if (Array.isArray(parsed)) return parsed.flatMap(tagParts);
        } catch {
            // Fall through to comma parsing.
        }
    }

    return trimmed.split(",").map((tag) => tag.trim());
}

function reverseTimestamp(createdAt: string): string {
    const timestamp = Date.parse(createdAt);
    const reversed = REVERSE_TIMESTAMP_MAX - timestamp;
    return String(reversed).padStart(13, "0");
}
