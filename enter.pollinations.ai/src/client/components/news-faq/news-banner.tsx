import { type FC, type ReactNode, useEffect, useState } from "react";
import { cn } from "@/util.ts";
import { Surface } from "../ui/surface.tsx";

const HIGHLIGHTS_RAW_URL =
    "https://raw.githubusercontent.com/pollinations/pollinations/news/social/news/highlights.md";
export const HIGHLIGHTS_GITHUB_URL =
    "https://github.com/pollinations/pollinations/blob/news/social/news/highlights.md";

const DYNAMIC_NEWS_COUNT = 6;

interface Highlight {
    date?: string;
    emoji: string;
    title: string;
    description: string;
}

/**
 * Pinned news items that stay visible regardless of daily updates.
 * Edit this array to add/remove pinned announcements.
 */
const PINNED_NEWS: Highlight[] = [
    {
        date: "2026-05-13",
        emoji: "🌻",
        title: "Pollen pack bonuses are stepping down",
        description:
            "As the service keeps improving, the bonus Pollen included with each pack is being reduced.",
    },
    {
        date: "2026-05-07",
        emoji: "🪷",
        title: "Developer earnings are live",
        description:
            "Turn on Developer earnings on any App Key to receive a share of pollen users spend in your app.",
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

export const NewsBanner: FC = () => {
    const [highlights, setHighlights] = useState<Highlight[]>([]);

    useEffect(() => {
        fetch(HIGHLIGHTS_RAW_URL)
            .then((res) => res.text())
            .then((md) =>
                setHighlights(parseHighlights(md).slice(0, DYNAMIC_NEWS_COUNT)),
            )
            .catch((err) => console.error("Failed to fetch highlights:", err));
    }, []);

    if (highlights.length === 0 && PINNED_NEWS.length === 0) return null;

    return (
        <div className="flex flex-col gap-3">
            {PINNED_NEWS.length > 0 && (
                <Surface
                    variant="card-themed"
                    theme="violet"
                    className="flex flex-col divide-y divide-violet-300/40 leading-relaxed"
                >
                    {PINNED_NEWS.map((item) => (
                        <PinnedNews key={item.title} item={item} />
                    ))}
                </Surface>
            )}
            {highlights.length > 0 && (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {highlights.map((item) => (
                        <DynamicNews
                            key={`${item.date}-${item.title}`}
                            item={item}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

const PinnedNews: FC<{ item: Highlight }> = ({ item }) => (
    <div className="min-w-0 py-3 first:pt-0 last:pb-0">
        {item.date && (
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-violet-700/70">
                {formatNewsDate(item.date)}
            </div>
        )}
        <div className="flex items-baseline gap-2 font-semibold text-gray-900 text-base sm:text-lg">
            {item.emoji && (
                <span aria-hidden="true" className="shrink-0">
                    {item.emoji}
                </span>
            )}
            <span>{item.title}</span>
        </div>
        <p className="mt-1 text-sm text-gray-700">
            {renderWithLinks(item.description)}
        </p>
    </div>
);

const DynamicNews: FC<{ item: Highlight }> = ({ item }) => (
    <Surface
        variant="card"
        className={cn("flex min-h-48 text-sm leading-relaxed")}
    >
        <div className="flex min-h-0 flex-1 flex-col items-start gap-3">
            <span className="shrink-0 text-2xl leading-none">{item.emoji}</span>
            <div className="min-w-0">
                <div className="font-semibold text-gray-900">{item.title}</div>
                {item.date && (
                    <div className="mt-1 text-xs font-medium text-gray-400">
                        {formatNewsDate(item.date)}
                    </div>
                )}
                <p className="mt-1 text-gray-700">
                    {renderWithLinks(item.description)}
                </p>
            </div>
        </div>
    </Surface>
);
