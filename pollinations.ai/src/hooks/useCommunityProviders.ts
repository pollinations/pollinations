import { useCallback } from "react";
import { API_BASE } from "../api.config";
import { useCachedFetch } from "./useCachedFetch";

const MODELS_URL = `${API_BASE}/models`;
const CACHE_KEY = "pollinations:community-providers";
const TTL_MS = 5 * 60 * 1000;

interface CatalogModel {
    name?: string;
    category?: string;
    brand?: string;
    brand_url?: string;
    community?: boolean;
}

export interface CommunityProvider {
    name: string;
    url: string;
    modelCount: number;
    categories: string[];
}

export function communityProvidersFromModels(
    models: CatalogModel[],
): CommunityProvider[] {
    const grouped = new Map<
        string,
        {
            name: string;
            url: string;
            models: Set<string>;
            categories: Set<string>;
        }
    >();

    for (const model of models) {
        const name = model.brand?.trim();
        const url = model.brand_url?.trim();
        if (!model.community || !name || !url) continue;

        const key = `${name}\u0000${url}`;
        const provider = grouped.get(key) ?? {
            name,
            url,
            models: new Set<string>(),
            categories: new Set<string>(),
        };
        if (model.name) provider.models.add(model.name);
        if (model.category) provider.categories.add(model.category);
        grouped.set(key, provider);
    }

    return [...grouped.values()]
        .map((provider) => ({
            name: provider.name,
            url: provider.url,
            modelCount: provider.models.size,
            categories: [...provider.categories].sort(),
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
}

export function useCommunityProviders() {
    const fetcher = useCallback(async (): Promise<CommunityProvider[]> => {
        const response = await fetch(MODELS_URL);
        if (!response.ok) {
            throw new Error(`Failed to fetch models: ${response.status}`);
        }
        const models = (await response.json()) as CatalogModel[];
        if (!Array.isArray(models)) throw new Error("Invalid model catalog");
        return communityProvidersFromModels(models);
    }, []);

    const { data, loading } = useCachedFetch<CommunityProvider[]>(
        CACHE_KEY,
        fetcher,
        TTL_MS,
    );

    return { providers: data ?? [], loading };
}
