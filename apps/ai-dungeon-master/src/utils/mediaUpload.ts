const MEDIA_HOST = "media.pollinations.ai";
const MEDIA_UPLOAD_URL = `https://${MEDIA_HOST}/upload`;

type MediaUploadOptions = {
    visibility?: "private" | "unlisted" | "public";
    relationship?: string;
    tags?: string[];
    parents?: string[];
};

/** Check if a URL is already uploaded to media.pollinations.ai */
function isMediaUrl(url: string): boolean {
    try {
        return new URL(url).hostname === MEDIA_HOST;
    } catch {
        return false;
    }
}

function mediaParent(url: string | undefined): string | null {
    if (!url || !isMediaUrl(url)) return null;
    return url;
}

function appendCatalogFields(
    formData: FormData,
    options: MediaUploadOptions,
): void {
    formData.append("visibility", options.visibility ?? "private");
    formData.append("relationship", options.relationship ?? "rpg_media");
    for (const tag of ["ai-dungeon-master", ...(options.tags ?? [])]) {
        formData.append("tags", tag);
    }
    for (const parent of options.parents ?? []) {
        const cleanParent = mediaParent(parent);
        if (cleanParent) formData.append("parents", cleanParent);
    }
}

/**
 * Upload a gen.pollinations.ai image to media.pollinations.ai for permanent storage.
 * Returns the permanent media URL on success, or the original URL on any error.
 * Skips upload if already a media URL (idempotent).
 */
export async function uploadToMedia(
    genUrl: string,
    apiKey: string,
    options: MediaUploadOptions = {},
): Promise<string> {
    if (!genUrl || isMediaUrl(genUrl)) return genUrl;

    try {
        const response = await fetch(genUrl);
        if (!response.ok) return genUrl;

        const blob = await response.blob();
        const formData = new FormData();
        formData.append("file", blob, "ai-dungeon-master.png");
        appendCatalogFields(formData, options);

        const uploadRes = await fetch(MEDIA_UPLOAD_URL, {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}` },
            body: formData,
        });

        if (!uploadRes.ok) return genUrl;

        const data = await uploadRes.json();
        return data.url || genUrl;
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
