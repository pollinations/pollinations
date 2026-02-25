// LocalStorage Management

const STORAGE_KEY = "catgpt-generated";
const ONE_MONTH = 30 * 24 * 60 * 60 * 1000;

export function saveGeneratedMeme(prompt, blobUrl) {
    const saved = getSavedMemes();
    const now = Date.now();
    const newMeme = { prompt, url: blobUrl, timestamp: now };
    const updated = [
        newMeme,
        ...saved.filter((m) => m.prompt !== prompt),
    ].slice(0, 8);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
}

export function getSavedMemes() {
    try {
        const data = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
        cleanupOldMemes(data);
        return data;
    } catch {
        return [];
    }
}

export function getSavedPrompts() {
    return getSavedMemes().map((m) => m.prompt);
}

export function cleanupOldMemes(memes) {
    const now = Date.now();
    const filtered = memes.filter((m) => (now - m.timestamp) < ONE_MONTH);
    if (filtered.length !== memes.length) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    }
    return filtered;
}
