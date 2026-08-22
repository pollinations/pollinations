import { useCallback } from "react";
import { useCachedFetch } from "./useCachedFetch";

const MEDIA_URL = "https://media.pollinations.ai";
const LEADERBOARD_USER = "voodoohop";
const CACHE_KEY = "pollinations:community-leaderboards";
const TTL_MS = 5 * 60 * 1000;

const BOARDS = [
    { kind: "text", tag: "community:leaderboard" },
    { kind: "image", tag: "community:image-leaderboard" },
] as const;

export interface CommunityLeaderboard {
    kind: (typeof BOARDS)[number]["kind"];
    url: string;
    createdAt: string;
}

interface MediaGalleryResponse {
    items?: Array<{ url?: string; createdAt?: string }>;
    user?: string;
}

async function fetchBoard(
    board: (typeof BOARDS)[number],
): Promise<CommunityLeaderboard | null> {
    const response = await fetch(
        `${MEDIA_URL}/media?tag=${encodeURIComponent(board.tag)}&limit=1&user=${LEADERBOARD_USER}`,
    );
    if (!response.ok) return null;
    const gallery = (await response.json()) as MediaGalleryResponse;
    if (gallery.user !== LEADERBOARD_USER) return null;
    const item = gallery.items?.[0];
    if (!item?.url || !item.createdAt) return null;
    return { kind: board.kind, url: item.url, createdAt: item.createdAt };
}

export function useCommunityLeaderboards() {
    const fetcher = useCallback(async (): Promise<CommunityLeaderboard[]> => {
        const results = await Promise.all(
            BOARDS.map((board) => fetchBoard(board).catch(() => null)),
        );
        return results.filter(
            (board): board is CommunityLeaderboard => board !== null,
        );
    }, []);

    const { data, loading } = useCachedFetch<CommunityLeaderboard[]>(
        CACHE_KEY,
        fetcher,
        TTL_MS,
    );

    return { leaderboards: data ?? [], loading };
}
