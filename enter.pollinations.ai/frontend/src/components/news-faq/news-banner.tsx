import { Chip, Eyebrow, InlineLink, Section, Surface } from "@pollinations/ui";
import { Markdown } from "@pollinations/ui/markdown";
import { type FC, Fragment, type ReactNode, useEffect, useState } from "react";

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
    Updating: "info",
    Retiring: "warning",
} as const;

type Launch = {
    name: string;
    /** Markdown. */
    change: string;
    /** Last UTC day the row shows. */
    until: string;
};

type ModelChange = {
    /** UTC day the change takes effect. */
    date: string;
    /** Last UTC day the row shows; defaults to `date`. */
    until?: string;
    name: string;
    action: keyof typeof ACTION_INTENT;
    /** Markdown. */
    change: string;
};

// Rows hide on their own after `until`; everything that shipped also
// reaches the news feed automatically.

/** Features available now, shown while they are new. */
const LAUNCHES: Launch[] = [
    {
        name: "Sandboxes",
        change: "Create E2B-compatible sandboxes through the API or `polli sandbox`, then connect over SSH. [Docs](https://gen.pollinations.ai/docs#tag/sandboxes).",
        until: "2026-10-16",
    },
    {
        name: "Pay with crypto",
        change: "Buy Pollen packs with **USDC**. Pick a pack in [Pollen](/pollen), then choose **Pay with Crypto**.",
        until: "2026-10-20",
    },
];

/** Recent and upcoming model changes, by the day they take effect. */
const MODEL_CHANGES: ModelChange[] = [
    {
        date: "2026-10-01",
        until: "2026-10-15",
        name: "MAI Image 2.5 Flash",
        action: "Retiring",
        change: "Retired. Use **MAI Image 2.6 Flash**.",
    },
    {
        date: "2026-10-05",
        until: "2026-10-19",
        name: "Qwen3 Coder 30B",
        action: "Updating",
        change: "Now on AWS Bedrock. **Paid Pollen only.**",
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
        change: "Azure route is due to retire. _Replacement details to follow._",
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
        action: "Retiring",
        change: "Retires. Use **Grok Imagine Image 2.0**.",
    },
];

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

const ROW =
    "grid grid-cols-[3.5rem_5.25rem_minmax(0,1fr)] items-start gap-x-2 gap-y-2 sm:grid-cols-[3.5rem_5.25rem_minmax(0,0.8fr)_minmax(0,1.2fr)]";
const DESCRIPTION =
    "col-span-3 sm:col-span-1 sm:border-l sm:border-theme-text-strong/15 sm:pl-2";

const AnnouncementGroup: FC<{ title: string; children: ReactNode }> = ({
    title,
    children,
}) => (
    <div className="flex flex-col gap-3">
        <Eyebrow as="h3">{title}</Eyebrow>
        <ul className="flex flex-col gap-4 text-sm text-theme-text-base">
            {children}
        </ul>
    </div>
);

export const Announcements: FC = () => {
    const today = new Date().toISOString().slice(0, 10);
    const launches = LAUNCHES.filter(({ until }) => until >= today);
    const changes = MODEL_CHANGES.filter(
        ({ date, until = date }) => until >= today,
    );
    // The "Today" line goes before the first upcoming change, after any past ones.
    const firstUpcoming = changes.findIndex(({ date }) => date >= today);
    if (launches.length === 0 && changes.length === 0) return null;
    return (
        <Section
            title="Announcements"
            action={
                <InlineLink href="/models" size="sm">
                    Browse models
                </InlineLink>
            }
        >
            {launches.length > 0 && (
                <AnnouncementGroup title="New">
                    {launches.map(({ name, change }) => (
                        <li
                            key={name}
                            className="grid items-start gap-x-2 gap-y-2 sm:grid-cols-[10rem_minmax(0,1fr)]"
                        >
                            <strong className="min-w-0 text-theme-text-strong">
                                {name}
                            </strong>
                            <Markdown className="sm:border-l sm:border-theme-text-strong/15 sm:pl-2">
                                {change}
                            </Markdown>
                        </li>
                    ))}
                </AnnouncementGroup>
            )}
            {changes.length > 0 && (
                <AnnouncementGroup title="Model changes">
                    {changes.map(({ date, name, action, change }, i) => (
                        <Fragment key={name}>
                            {i > 0 && i === firstUpcoming && (
                                <li className="flex items-center gap-2">
                                    <Eyebrow>Today</Eyebrow>
                                    <hr className="flex-1 border-theme-text-soft/40" />
                                </li>
                            )}
                            <li
                                className={
                                    date < today ? `${ROW} opacity-60` : ROW
                                }
                            >
                                <time
                                    dateTime={date}
                                    className="whitespace-nowrap text-theme-text-muted"
                                >
                                    {formatNewsDate(date)}
                                </time>
                                <span className="border-l border-theme-text-strong/15 pl-2">
                                    <Chip
                                        size="sm"
                                        intent={ACTION_INTENT[action]}
                                    >
                                        {action}
                                    </Chip>
                                </span>
                                <strong className="min-w-0 border-l border-theme-text-strong/15 pl-2 text-theme-text-strong">
                                    {name}
                                </strong>
                                <Markdown className={DESCRIPTION}>
                                    {change}
                                </Markdown>
                            </li>
                        </Fragment>
                    ))}
                </AnnouncementGroup>
            )}
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
        <Markdown className="mt-1 text-ink-700">{item.description}</Markdown>
    </Surface>
);
