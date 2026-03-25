import { type FC, type ReactNode, useEffect, useState } from "react";
import { Panel } from "../ui/panel.tsx";

const HIGHLIGHTS_RAW_URL =
    "https://raw.githubusercontent.com/pollinations/pollinations/news/social/news/highlights.md";
const HIGHLIGHTS_GITHUB_URL =
    "https://github.com/pollinations/pollinations/blob/news/social/news/highlights.md";

const TOTAL_NEWS_COUNT = 5;

interface Highlight {
    date: string;
    emoji: string;
    title: string;
    description: string;
}

/**
 * Pinned news items that stay visible regardless of daily updates.
 * Edit this array to add/remove pinned announcements.
 * When empty, the full TOTAL_NEWS_COUNT dynamic highlights are shown.
 */
const PINNED_NEWS: Highlight[] = [
    {
        date: "2026-03-26",
        emoji: "⏱️",
        title: "Flower & Nectar: Daily → Hourly Refills",
        description:
            "Starting Thursday, March 26 — Flower 0.4p/hr, Nectar 0.8p/hr. Need more? Grab a Pollen Pack below!",
    },
];

/** Render markdown links [text](url) as clickable <a> tags, preserving surrounding text. */
function renderWithLinks(text: string): ReactNode[] {
    const parts: ReactNode[] = [];
    const matches = [...text.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)];
    let lastIndex = 0;
    for (const match of matches) {
        const idx = match.index ?? 0;
        if (idx > lastIndex) {
            parts.push(text.slice(lastIndex, idx));
        }
        parts.push(
            <a
                key={idx}
                href={match[2]}
                target="_blank"
                rel="noopener noreferrer"
                className="text-violet-600 hover:text-violet-800 hover:underline font-medium"
            >
                {match[1]}
            </a>,
        );
        lastIndex = idx + match[0].length;
    }
    if (lastIndex < text.length) {
        parts.push(text.slice(lastIndex));
    }
    return parts;
}

function parseHighlights(md: string): Highlight[] {
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

export const NewsBanner: FC = () => {
    const [highlights, setHighlights] = useState<Highlight[]>([]);
    const dynamicCount = TOTAL_NEWS_COUNT - PINNED_NEWS.length;

    useEffect(() => {
        fetch(HIGHLIGHTS_RAW_URL)
            .then((res) => res.text())
            .then((md) =>
                setHighlights(parseHighlights(md).slice(0, dynamicCount)),
            )
            .catch((err) => console.error("Failed to fetch highlights:", err));
    }, [dynamicCount]);

    if (highlights.length === 0 && PINNED_NEWS.length === 0) return null;

    return (
        <Panel
            color="violet"
            compact
            className="border-transparent !bg-transparent"
        >
            <div className="flex flex-col gap-2">
                <span className="text-xs text-gray-500">What's new</span>
                {PINNED_NEWS.length > 0 && (
                    <div className="bg-amber-50 rounded-md px-3 py-2">
                        <ul className="text-xs space-y-1.5">
                            {PINNED_NEWS.map((h) => (
                                <li
                                    key={`pinned-${h.title}`}
                                    className="text-gray-900"
                                >
                                    {h.emoji} <strong>{h.title}:</strong>{" "}
                                    {renderWithLinks(h.description)}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
                {highlights.length > 0 && (
                    <ul className="text-xs space-y-1.5">
                        {highlights.map((h) => (
                            <li
                                key={h.date + h.title}
                                className="text-gray-600"
                            >
                                {h.emoji} <strong>{h.title}:</strong>{" "}
                                {renderWithLinks(h.description)}
                            </li>
                        ))}
                    </ul>
                )}
                <a
                    href={HIGHLIGHTS_GITHUB_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-violet-600 hover:text-violet-800 hover:underline"
                >
                    More...
                </a>
            </div>
        </Panel>
    );
};
