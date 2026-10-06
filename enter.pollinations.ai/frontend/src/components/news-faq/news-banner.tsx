import { InlineLink, Surface } from "@pollinations/ui";
import { type FC, type ReactNode, useEffect, useState } from "react";

const HIGHLIGHTS_RAW_URL =
    "https://raw.githubusercontent.com/pollinations/pollinations/refs/heads/news/operations/social/news/highlights.md";
export const HIGHLIGHTS_GITHUB_URL =
    "https://github.com/pollinations/pollinations/blob/news/operations/social/news/highlights.md";

const DYNAMIC_NEWS_COUNT = 6;

interface Highlight {
    date?: string;
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
        date: "2026-10-01",
        emoji: "🖼️",
        title: "MAI Image 2.5 Flash moves to 2.6 Flash",
        description:
            "The 2.5 Flash model ID still works, but now uses MAI Image 2.6 Flash and its pricing. [Browse models](/models).",
        details: [
            "Use microsoft/mai-image-2.6-flash for new integrations.",
            "Nova Canvas and Nova Reel retired on September 30. Their model IDs and aliases no longer accept requests.",
        ],
    },
    {
        date: "2026-09-24",
        emoji: "🔄",
        title: "Model provider changes",
        description:
            "Some models moved to new providers. Model IDs are unchanged. [Browse models](/models).",
        details: [
            "Now Paid Pollen only: DeepSeek V4 Pro, DeepSeek V4 Flash Vision, Kimi K2.7 Code, GLM 5.2, Muse Glimmer 30B.",
            "Price up: DeepSeek V4 Flash to $0.33/$0.99 per 1M tokens; GLM 5.2 and Kimi K2.7 Code about 5%.",
            "Price down: DeepSeek V4 Pro and Muse Glimmer 30B.",
            "Kimi K2.7 Code always reasons, so forcing a tool call returns an error.",
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
        const href = match[2];
        if (idx > lastIndex) {
            parts.push(text.slice(lastIndex, idx));
        }
        parts.push(
            <InlineLink key={idx} href={href}>
                {match[1]}
            </InlineLink>,
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

/** Hand-curated, pinned announcements — one card per item. */
export const Announcements: FC = () => {
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
        {item.date && (
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-theme-text-muted">
                {formatNewsDate(item.date)}
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
    <Surface variant="card" className="text-sm leading-relaxed">
        {item.date && (
            <time
                dateTime={item.date}
                className="mb-1 block text-xs font-medium text-theme-text-muted"
            >
                {formatNewsDate(item.date)}
            </time>
        )}
        <div className="flex items-start gap-2 font-semibold text-ink-900">
            {item.emoji && (
                <span aria-hidden="true" className="shrink-0 text-base">
                    {item.emoji}
                </span>
            )}
            <div className="min-w-0">{item.title}</div>
        </div>
        <p className="mt-1 text-ink-700">{renderWithLinks(item.description)}</p>
    </Surface>
);
