export const HIGHLIGHTS_RAW_URL =
    "https://raw.githubusercontent.com/pollinations/pollinations/refs/heads/news/operations/social/news/highlights.md";
export const HIGHLIGHTS_GITHUB_URL =
    "https://github.com/pollinations/pollinations/blob/news/operations/social/news/highlights.md";

export const DYNAMIC_NEWS_COUNT = 6;

export interface Highlight {
    date?: string;
    /** Overrides the formatted date label (e.g. "Starting Jun 2"); pinned items only. */
    dateLabel?: string;
    emoji: string;
    title: string;
    description: string;
    /** Optional bullet list rendered under the description (pinned items only). */
    details?: string[];
}

export function parseHighlights(md: string): Highlight[] {
    return md
        .split("\n")
        .filter((line) => line.startsWith("- **"))
        .filter((line) => !line.includes("<!-- app -->"))
        .map((line) => {
            const dateMatch = line.match(/^- \*\*(\d{4}-\d{2}-\d{2})\*\*/);
            const emojiTitleMatch = line.match(/– \*\*(\S+)\s+([^*]+)\*\*/);
            const descStart = line.lastIndexOf("**") + 2;
            const description = line.slice(descStart).trim();
            return {
                date: dateMatch?.[1] ?? "",
                emoji: emojiTitleMatch?.[1] ?? "",
                title: emojiTitleMatch?.[2]?.trim() ?? "",
                description,
            };
        });
}
