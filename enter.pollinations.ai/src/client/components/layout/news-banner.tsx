import { type FC, type ReactNode, useEffect, useState } from "react";
import { cn } from "@/util.ts";
import { Card } from "../ui/card.tsx";

const HIGHLIGHTS_RAW_URL =
    "https://raw.githubusercontent.com/pollinations/pollinations/news/social/news/highlights.md";
export const HIGHLIGHTS_GITHUB_URL =
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
        date: "2026-04-28",
        emoji: "💸",
        title: "ElevenLabs Music, ElevenLabs TTS and GPT Image 2 moving to paid",
        description: "Starting May 1, 2026, these models will no longer be free.",
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

function formatNewsDate(date: string): string {
    if (!date) return "";
    const parsed = new Date(`${date}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime())) return date;
    return parsed.toLocaleDateString("en-US", {
        timeZone: "UTC",
        month: "short",
        day: "numeric",
        year: "numeric",
    });
}

type NewsItem = Highlight & {
    key: string;
    pinned: boolean;
};

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

    const items: NewsItem[] = [
        ...PINNED_NEWS.map((item) => ({
            ...item,
            key: `pinned-${item.title}`,
            pinned: true,
        })),
        ...highlights.map((item) => ({
            ...item,
            key: `${item.date}-${item.title}`,
            pinned: false,
        })),
    ];

    return (
        <div className="grid gap-3">
            {items.map((item) => (
                <NewsCard key={item.key} item={item} />
            ))}
        </div>
    );
};

const NewsCard: FC<{ item: NewsItem }> = ({ item }) => (
    <Card
        color="violet"
        className={cn(
            "leading-relaxed",
            item.pinned
                ? "!border-transparent !bg-violet-200/70 text-base"
                : "!border-transparent text-sm",
        )}
    >
        <div className="flex items-start gap-2">
            <span
                className={cn(
                    "shrink-0",
                    item.pinned ? "text-2xl leading-none" : "mt-0.5",
                )}
            >
                {item.emoji}
            </span>
            <div className="min-w-0">
                <div
                    className={cn(
                        "font-semibold text-gray-900",
                        item.pinned && "text-base sm:text-lg",
                    )}
                >
                    <span>{item.title}</span>
                    {item.date && !item.pinned && (
                        <span className="font-medium text-gray-400">
                            {" "}
                            - {formatNewsDate(item.date)}
                        </span>
                    )}
                </div>
                <p className="mt-1 text-gray-700">
                    {renderWithLinks(item.description)}
                </p>
            </div>
        </div>
    </Card>
);
