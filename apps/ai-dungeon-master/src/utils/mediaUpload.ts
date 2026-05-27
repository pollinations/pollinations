const MEDIA_URL = "https://media.pollinations.ai";
const MEDIA_UPLOAD_URL = `${MEDIA_URL}/upload`;
const MEDIA_HOST = "media.pollinations.ai";

export interface MediaCatalogFields {
    visibility?: "public" | "private";
    tags?: string[];
    parents?: string[];
    source?: "upload" | "generation" | "edit" | "saved_generation" | "remix";
    prompt?: string;
    model?: string;
}

/** Check if a URL is already uploaded to media.pollinations.ai */
function isMediaUrl(url: string): boolean {
    try {
        return new URL(url).hostname === MEDIA_HOST;
    } catch {
        return false;
    }
}

function appendCatalogFields(
    formData: FormData,
    {
        visibility = "private",
        tags = [],
        parents = [],
        source = "saved_generation",
        prompt,
        model,
    }: MediaCatalogFields,
) {
    formData.append("visibility", visibility);
    formData.append("source", source);
    if (prompt) formData.append("prompt", prompt);
    if (model) formData.append("model", model);
    if (tags.length) formData.append("tags", JSON.stringify(tags));
    if (parents.length) formData.append("parents", JSON.stringify(parents));
}

/**
 * Upload a gen.pollinations.ai image to media.pollinations.ai for permanent storage.
 * Returns the permanent media URL on success, or the original URL on any error.
 * Skips upload if already a media URL (idempotent).
 */
export async function uploadToMedia(
    genUrl: string,
    apiKey: string,
    catalog: MediaCatalogFields = {},
): Promise<string> {
    if (!genUrl || isMediaUrl(genUrl)) return genUrl;

    try {
        const response = await fetch(genUrl);
        if (!response.ok) return genUrl;

        const blob = await response.blob();
        const formData = new FormData();
        formData.append("file", blob, `ai-dungeon-${Date.now()}.png`);
        appendCatalogFields(formData, catalog);

        const uploadRes = await fetch(MEDIA_UPLOAD_URL, {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}` },
            body: formData,
        });

        if (!uploadRes.ok) return genUrl;

        const data = await uploadRes.json();
        return data.url || (data.id ? `${MEDIA_URL}/${data.id}` : genUrl);
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
        !isMediaUrl(gameState.character.avatar)
    ) {
        count++;
    }

    if (
        gameState.currentScene?.image &&
        !isMediaUrl(gameState.currentScene.image)
    ) {
        count++;
    }

    for (const entry of gameState.storyHistory) {
        if (entry.image && !isMediaUrl(entry.image)) count++;
    }

    for (const item of gameState.inventory) {
        if (item.image && !isMediaUrl(item.image)) count++;
    }

    return count;
}
