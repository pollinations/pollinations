import { Chip, InlineLink, Section, Surface } from "@pollinations/ui";
import { type FC, type ReactNode, useEffect, useState } from "react";

const HIGHLIGHTS_RAW_URL =
    "https://raw.githubusercontent.com/pollinations/pollinations/refs/heads/news/operations/social/news/highlights.md";
export const HIGHLIGHTS_GITHUB_URL =
    "https://github.com/pollinations/pollinations/blob/news/operations/social/news/highlights.md";

const DYNAMIC_NEWS_COUNT = 6;

interface Highlight {
    date: string;
    emoji: string;
    title: string;
    description: string;
}

const ACTION_INTENT = {
    New: "new",
    Updating: "info",
    Retiring: "warning",
} as const;

type Announcement = {
    /** UTC day the launch or change takes effect. */
    date: string;
    /** Last UTC day the row shows; defaults to `date`. */
    until?: string;
    name: string;
    action: keyof typeof ACTION_INTENT;
    change: string;
};

/**
 * New launches and upcoming changes. Rows hide on their own after `until`;
 * everything that shipped also reaches the news feed automatically.
 */
const ANNOUNCEMENTS: Announcement[] = [
    {
        date: "2026-10-02",
        until: "2026-10-16",
        name: "Sandboxes",
        action: "New",
        change: "Create E2B-compatible sandboxes through the API or polli sandbox, then connect over SSH. [Docs](https://gen.pollinations.ai/docs#tag/sandboxes).",
    },
    {
        date: "2026-10-06",
        until: "2026-10-20",
        name: "Pay with crypto",
        action: "New",
        change: "Buy Pollen packs with USDC. Pick a pack in [Pollen](/pollen), then choose Pay with Crypto.",
    },
    {
        date: "2026-10-09",
        name: "Qwen3 VL 235B Thinking + TTS Instruct Flash",
        action: "Retiring",
        change: "Alibaba routes retire. Choose another vision or voice model.",
    },
    {
        date: "2026-10-09",
        name: "Cohere Command A+",
        action: "Retiring",
        change: "Azure route is due to retire. Replacement details to follow.",
    },
    {
        date: "2026-10-20",
        name: "Gemini 2.5 Flash Lite + Search",
        action: "Retiring",
        change: "Vertex AI routes retire. Update apps using these models or their aliases.",
    },
    {
        date: "2026-11-02",
        name: "Grok Imagine Pro",
        action: "Updating",
        change: "Redirects to Image 2.0. Output and pricing change.",
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
    });
}

export const Announcements: FC = () => {
    const today = new Date().toISOString().slice(0, 10);
    const current = ANNOUNCEMENTS.filter(
        ({ date, until = date }) => until >= today,
    );
    if (current.length === 0) return null;
    return (
        <Section
            title="Announcements"
            action={
                <InlineLink href="/models" size="sm">
                    Browse models
                </InlineLink>
            }
        >
            <ul className="flex flex-col gap-4 text-sm text-theme-text-base">
                {current.map(({ date, name, action, change }) => (
                    <li
                        key={name}
                        className="grid grid-cols-[3.5rem_5.25rem_minmax(0,1fr)] items-start gap-x-2 gap-y-2 sm:grid-cols-[3.5rem_5.25rem_minmax(0,0.8fr)_minmax(0,1.2fr)]"
                    >
                        <time
                            dateTime={date}
                            className="whitespace-nowrap text-theme-text-muted"
                        >
                            {formatNewsDate(date)}
                        </time>
                        <span className="border-l border-theme-text-strong/15 pl-2">
                            <Chip size="sm" intent={ACTION_INTENT[action]}>
                                {action}
                            </Chip>
                        </span>
                        <strong className="min-w-0 border-l border-theme-text-strong/15 pl-2 text-theme-text-strong">
                            {name}
                        </strong>
                        <p className="col-span-3 min-w-0 sm:col-span-1 sm:border-l sm:border-theme-text-strong/15 sm:pl-2">
                            {renderWithLinks(change)}
                        </p>
                    </li>
                ))}
            </ul>
        </Section>
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
