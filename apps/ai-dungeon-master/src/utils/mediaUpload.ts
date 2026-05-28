const MEDIA_URL = "https://media.pollinations.ai";
const MEDIA_HOST = "media.pollinations.ai";
const GEN_HOST = "gen.pollinations.ai";

/** Check if a URL is already durable or already asks gen to catalog it. */
function isPersistedUrl(url: string): boolean {
    try {
        const parsed = new URL(url);
        return (
            parsed.hostname === MEDIA_HOST ||
            (parsed.hostname === GEN_HOST &&
                (parsed.searchParams.get("save") === "1" ||
                    parsed.searchParams.get("catalog") === "1"))
        );
    } catch {
        return false;
    }
}

/**
 * Catalog a gen.pollinations.ai image for later lookup without downloading and
 * re-uploading bytes. Returns the original URL so existing saves remain stable.
 */
export async function uploadToMedia(
    genUrl: string,
    apiKey: string,
): Promise<string> {
    if (!genUrl || isPersistedUrl(genUrl)) return genUrl;

    try {
        await fetch(`${MEDIA_URL}/catalog`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                url: genUrl,
                tags: ["ai-dungeon-master"],
                visibility: "private",
            }),
        });

        return genUrl;
    } catch {
        return genUrl;
    }
}

/**
 * Count how many image URLs in the game state have NOT yet been uploaded to media.pollinations.ai.
 * Used to show the user how many images will be uploaded on save.
 */
export function countPendingUploads(gameState: {
    character: { avatar: string } | null;
    currentScene: { image: string };
    storyHistory: { image: string }[];
    inventory: { image: string }[];
}): number {
    let count = 0;

    if (
        gameState.character?.avatar &&
        !isPersistedUrl(gameState.character.avatar)
    ) {
        count++;
    }

    if (
        gameState.currentScene?.image &&
        !isPersistedUrl(gameState.currentScene.image)
    ) {
        count++;
    }

    for (const entry of gameState.storyHistory) {
        if (entry.image && !isPersistedUrl(entry.image)) count++;
    }

    for (const item of gameState.inventory) {
        if (item.image && !isPersistedUrl(item.image)) count++;
    }

    return count;
}
