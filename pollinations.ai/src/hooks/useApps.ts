import { useCallback } from "react";
import { useCachedFetch } from "./useCachedFetch";

const CACHE_KEY_PREFIX = "pollinations:apps:";
const TTL_MS = 30 * 60 * 1000; // 30 minutes

export interface App {
    emoji: string;
    name: string;
    url: string;
    description: string;
    category: string;
    platform: string;
    github: string;
    repo: string;
    discord: string;
    other: string;
    language: string;
    stars: number | null;
    date: string;
    approvedDate: string;
    byop: boolean;
    requests24h: number;
}

interface CatalogApp {
    emoji: string;
    name: string;
    url: string | null;
    description: string;
    language: string | null;
    category: string;
    platform: string;
    githubUsername: string | null;
    githubUserId: string | null;
    repositoryUrl: string | null;
    repositoryStars: number | null;
    discordUsername: string | null;
    other: string | null;
    submittedDate: string | null;
    issueUrl: string | null;
    approvedDate: string | null;
    byop: boolean;
    requests24h: number;
}

interface UseAppsReturn {
    apps: App[];
    loading: boolean;
}

function toApps(catalog: CatalogApp[]): App[] {
    const apps = catalog.map((app) => ({
        emoji: app.emoji,
        name: app.name,
        url: app.url || app.repositoryUrl || "",
        description: app.description,
        language: app.language || "",
        category: app.category.toLowerCase(),
        platform: app.platform,
        github: app.githubUsername ? `@${app.githubUsername}` : "",
        repo: app.repositoryUrl || "",
        stars: app.repositoryStars,
        discord: app.discordUsername || "",
        other: app.other || "",
        date: app.submittedDate || "",
        approvedDate: app.approvedDate || "",
        byop: app.byop,
        requests24h: app.requests24h,
    }));

    // Deduplicate by name, keeping the first occurrence (newest-first order)
    const seen = new Set<string>();
    return apps.filter((app) => {
        const key = app.name.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

export function useApps(filePath: string): UseAppsReturn {
    const fetcher = useCallback(async (): Promise<App[]> => {
        const response = await fetch(filePath);
        if (!response.ok) {
            throw new Error(`Failed to fetch apps: ${response.statusText}`);
        }
        const catalog = (await response.json()) as CatalogApp[];
        if (!Array.isArray(catalog)) throw new Error("Invalid apps catalog");
        return toApps(catalog);
    }, [filePath]);

    const { data, loading } = useCachedFetch<App[]>(
        `${CACHE_KEY_PREFIX}${filePath}`,
        fetcher,
        TTL_MS,
        !!filePath,
    );

    return { apps: data ?? [], loading };
}
