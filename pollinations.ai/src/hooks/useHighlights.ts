import { useEffect, useState } from "react";

const HIGHLIGHTS_URL =
    "https://raw.githubusercontent.com/pollinations/pollinations/refs/heads/news/social/news/highlights.md";

const MAX_ITEMS = 5;

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

export function useHighlights() {
    const [highlights, setHighlights] = useState<Highlight[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch(HIGHLIGHTS_URL)
            .then((r) => r.text())
            .then((text) => {
                const items = text
                    .split("\n")
                    .filter((line) => line.trim().startsWith("- "))
                    .map(parseLine)
                    .filter((item): item is Highlight => item !== null)
                    .slice(0, MAX_ITEMS);
                setHighlights(items);
            })
            .catch((err) => console.error("Failed to load highlights:", err))
            .finally(() => setLoading(false));
    }, []);

    return { highlights, loading };
}
