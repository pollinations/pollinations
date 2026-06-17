import { cn, Surface } from "@pollinations/ui";
import { type FC, type ReactNode, useEffect, useState } from "react";

const HIGHLIGHTS_RAW_URL =
    "https://raw.githubusercontent.com/pollinations/pollinations/news/social/news/highlights.md";
export const HIGHLIGHTS_GITHUB_URL =
    "https://github.com/pollinations/pollinations/blob/news/social/news/highlights.md";

const DYNAMIC_NEWS_COUNT = 6;

interface Highlight {
    date?: string;
    /** Overrides the formatted date label (e.g. "Starting Jun 2"); pinned items only. */
    dateLabel?: string;
    emoji: string;
    title: string;
    description: string;
    /** Optional bullet list rendered under the description (pinned items only). */
    details?: string[];
}

/**
 * Pinned news items that stay visible regardless of daily updates.
 * Edit this array to add/remove pinned announcements.
 */
const PINNED_NEWS: Highlight[] = [
    {
        date: "2026-06-02",
        dateLabel: "Starting Jun 2",
        emoji: "🌻",
        title: "Pollen pricing update",
        description: "A few changes to how Pollen works, starting today.",
        details: [
            "Big price drops — many models are now 30–50% cheaper.",
            "Bonus Pollen on purchases has ended.",
            "More price cuts coming June 22.",
        ],
    },
    {
        date: "2026-06-22",
        dateLabel: "Starting Jun 22",
        emoji: "🎯",
        title: "Tiers & quests are changing",
        description: "Bigger updates to tiers and how you earn Pollen.",
        details: [
            "Spore, Seed, Flower & Nectar: the hourly Pollen refill becomes a one-time Pollen bonus.",
            "Earn Pollen from quests — new quest dashboard, more ways to earn.",
            "Another round of price cuts.",
        ],
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
                className="text-theme-text-soft hover:text-theme-text-strong hover:underline font-medium"
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

/** Hand-curated, pinned announcements — stacked white cards. */
export const Announcements: FC = () => {
    if (PINNED_NEWS.length === 0) return null;
    return (
        <div className="flex flex-col gap-3">
            {PINNED_NEWS.map((item) => (
                <PinnedNews key={item.title} item={item} />
            ))}
        </div>
    );
};

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

    if (highlights.length === 0) return null;

    return (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {highlights.map((item) => (
                <DynamicNews key={`${item.date}-${item.title}`} item={item} />
            ))}
        </div>
    );
};

const PinnedNews: FC<{ item: Highlight }> = ({ item }) => (
    <Surface variant="card" className="min-w-0 leading-relaxed">
        {(item.dateLabel || item.date) && (
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-theme-text-muted">
                {item.dateLabel ??
                    (item.date ? formatNewsDate(item.date) : null)}
            </div>
        )}
        <div className="flex items-baseline gap-2 font-semibold text-ink-900 text-base sm:text-lg">
            {item.emoji && (
                <span aria-hidden="true" className="shrink-0">
                    {item.emoji}
                </span>
            )}
            <span>{item.title}</span>
        </div>
        {item.description && (
            <p className="mt-1 text-sm text-ink-700">
                {renderWithLinks(item.description)}
            </p>
        )}
        {item.details && item.details.length > 0 && (
            <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm text-ink-700 marker:text-theme-text-soft">
                {item.details.map((detail) => (
                    <li key={detail}>{renderWithLinks(detail)}</li>
                ))}
            </ul>
        )}
    </Surface>
);

const DynamicNews: FC<{ item: Highlight }> = ({ item }) => (
    <Surface
        variant="card"
        className={cn("flex min-h-48 text-sm leading-relaxed")}
    >
        <div className="flex min-h-0 flex-1 flex-col items-start gap-3">
            <span className="shrink-0 text-2xl leading-none">{item.emoji}</span>
            <div className="min-w-0">
                <div className="font-semibold text-ink-900">{item.title}</div>
                {item.date && (
                    <div className="mt-1 text-xs font-medium text-theme-text-muted">
                        {formatNewsDate(item.date)}
                    </div>
                )}
                <p className="mt-1 text-ink-700">
                    {renderWithLinks(item.description)}
                </p>
            </div>
        </div>
    </Surface>
);
