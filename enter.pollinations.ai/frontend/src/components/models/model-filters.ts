import type { ModelCapability } from "./types.ts";

/**
 * Parsed search query: free-text terms + structured filters.
 *
 * Filter syntax (inspired by GitHub search):
 *   access:paid | access:quest | access:free
 *   owner:<github-login>       (community models)
 *   id:<model-id>
 *   type:<category>
 *   capability:<capability>
 *
 * Free-text terms and filters are combined with AND logic.
 */

export type ModelFilters = {
    freeText: string[];
    access: "paid" | "quest" | "free" | null;
    owner: string | null;
    id: string | null;
    type: string | null;
    capability: string | null;
};

const KNOWN_FILTER_KEYS = new Set([
    "access",
    "owner",
    "id",
    "type",
    "capability",
]);

/**
 * Parse a search query into free-text terms and structured filters.
 */
export function parseModelFilters(query: string): ModelFilters {
    const result: ModelFilters = {
        freeText: [],
        access: null,
        owner: null,
        id: null,
        type: null,
        capability: null,
    };

    if (!query) return result;

    const tokenRegex = /(\w+):(?:"([^"]*?)"|(\S+))/g;
    let match: RegExpExecArray | null;
    let remaining = query;

    while (true) {
        match = tokenRegex.exec(query);
        if (match === null) break;
        const [, key, quotedVal, rawVal] = match;
        const value = (quotedVal ?? rawVal ?? "").toLowerCase();
        if (!KNOWN_FILTER_KEYS.has(key)) continue;

        remaining = remaining.replace(match[0], " ");

        switch (key) {
            case "access":
                if (value === "paid" || value === "quest" || value === "free") {
                    result.access = value;
                }
                break;
            case "owner":
                result.owner = value;
                break;
            case "id":
                result.id = value;
                break;
            case "type":
                result.type = value;
                break;
            case "capability":
                result.capability = value;
                break;
        }
    }

    result.freeText = remaining
        .split(/\s+/)
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean);

    return result;
}

/**
 * Check if a model matches the parsed filters.
 */
export function modelMatchesFilters(
    model: {
        name: string;
        type?: string;
        community?: boolean;
        brand?: string;
        description?: string;
        displayName?: string;
        baseModel?: string;
        paidOnly?: boolean;
        free?: boolean;
        capabilities?: ModelCapability[];
    },
    filters: ModelFilters,
): boolean {
    // Access filter
    if (filters.access) {
        switch (filters.access) {
            case "paid":
                if (!model.paidOnly) return false;
                break;
            case "free":
                if (model.paidOnly) return false;
                break;
            case "quest":
                if (model.paidOnly) return false;
                break;
        }
    }

    // Owner filter — community model names are "owner/model-id"
    if (filters.owner) {
        if (!model.community) return false;
        const nameParts = model.name.split("/");
        const owner =
            nameParts.length > 1 ? nameParts[0]! : (model.brand ?? "");
        if (!owner.toLowerCase().includes(filters.owner)) return false;
    }

    // ID filter
    if (filters.id) {
        if (!model.name.toLowerCase().includes(filters.id)) return false;
    }

    // Type filter
    if (filters.type) {
        const modelType = model.type ?? "";
        if (!modelType.toLowerCase().includes(filters.type)) return false;
    }

    // Capability filter
    if (filters.capability) {
        const caps = model.capabilities ?? [];
        if (!caps.some((c) => c.toLowerCase().includes(filters.capability!))) {
            return false;
        }
    }

    // Free-text matching
    if (filters.freeText.length > 0) {
        const haystack = [
            model.displayName ?? "",
            model.name,
            model.brand ?? "",
            model.description ?? "",
            model.baseModel ?? "",
        ]
            .join(" ")
            .toLowerCase();

        for (const term of filters.freeText) {
            if (!haystack.includes(term)) return false;
        }
    }

    return true;
}
