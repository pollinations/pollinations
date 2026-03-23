import { useCachedFetch } from "./useCachedFetch";

const HIGHLIGHTS_URL =
    "https://raw.githubusercontent.com/pollinations/pollinations/refs/heads/news/social/news/highlights.md";

const MAX_ITEMS = 5;
const CACHE_KEY = "pollinations:highlights";
const TTL_MS = 60 * 60 * 1000; // 1 hour

export interface Highlight {
    date: string;
    emoji: string;
    title: string;
    description: string;
}

// Parses: - **2026-03-09** – **🤖 Title** Description text
function parseLine(line: string): Highlight | null {
    const content = line.trim().substring(2).trim();
    const match = content.match(
        /^\*\*(\d{4}-\d{2}-\d{2})\*\*\s*[–-]\s*\*\*([^\s*]+)\s+([^*]+)\*\*\s*(.*)/,
    );
    if (!match) return null;
    const [, date, emoji, title, description] = match;
    return {
        date,
        emoji: emoji.trim(),
        title: title.trim(),
        description: description.trim(),
    };
}

async function fetchHighlights(): Promise<Highlight[]> {
    const r = await fetch(HIGHLIGHTS_URL);
    const text = await r.text();
    return text
        .split("\n")
        .filter((line) => line.trim().startsWith("- "))
        .filter((line) => !line.includes("<!-- app -->"))
        .map(parseLine)
        .filter((item): item is Highlight => item !== null)
        .slice(0, MAX_ITEMS);
}

export function useHighlights() {
    const { data, loading } = useCachedFetch<Highlight[]>(
        CACHE_KEY,
        fetchHighlights,
        TTL_MS,
    );

    return { highlights: data ?? [], loading };
}
