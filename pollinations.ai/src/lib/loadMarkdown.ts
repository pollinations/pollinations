/**
 * Fetch a static markdown file. Throws on a non-OK response so a 404 page
 * body is never rendered as page copy — the route's error boundary shows
 * instead. Shared by the legal routes (terms/privacy/refunds).
 */
export async function loadMarkdown(path: string): Promise<string> {
    const res = await fetch(path);
    if (!res.ok) {
        throw new Error(`Failed to load ${path} (HTTP ${res.status})`);
    }
    return res.text();
}
