const MEDIA_URL = "https://media.pollinations.ai";

/** Check if a URL is already uploaded to media.pollinations.ai */
function isMediaUrl(url: string): boolean {
  return url.startsWith(MEDIA_URL);
}

/**
 * Upload a gen.pollinations.ai image to media.pollinations.ai for permanent storage.
 * Returns the permanent media URL on success, or the original URL on any error.
 * Skips upload if already a media URL (idempotent).
 */
export async function uploadToMedia(
  genUrl: string,
  apiKey: string,
): Promise<string> {
  if (!genUrl || isMediaUrl(genUrl)) return genUrl;

  try {
    const response = await fetch(genUrl);
    if (!response.ok) return genUrl;

    const blob = await response.blob();
    const formData = new FormData();
    formData.append("file", blob);

    const uploadRes = await fetch(`${MEDIA_URL}/upload`, {
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
  storyHistory: { image: string }[];
  inventory: { image: string }[];
}): number {
  let count = 0;

  if (gameState.character?.avatar && !isMediaUrl(gameState.character.avatar)) {
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