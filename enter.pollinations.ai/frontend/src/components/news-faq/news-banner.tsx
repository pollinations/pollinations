import { InlineLink, Surface } from "@pollinations/ui";
import { type FC, type ReactNode, useEffect, useState } from "react";

const HIGHLIGHTS_RAW_URL =
    "https://raw.githubusercontent.com/pollinations/pollinations/refs/heads/news/operations/social/news/highlights.md";
export const HIGHLIGHTS_GITHUB_URL =
    "https://github.com/pollinations/pollinations/blob/news/operations/social/news/highlights.md";

const DYNAMIC_NEWS_COUNT = 6;

/** A dated item from the daily news feed. */
interface Highlight {
    date: string;
    emoji: string;
    title: string;
    description: string;
}

/** A hand-picked notice that stays up until it no longer needs attention. */
interface Announcement {
    /** Short status above the title, e.g. "New", "Alpha" or "Upcoming · Oct 13". */
    label: string;
    emoji: string;
    title: string;
    description: string;
    details?: string[];
}

/**
 * Fixed announcements: current features plus recent or upcoming changes that
 * need action. Unlike the news feed they don't age out; remove an item once it
 * no longer needs attention.
 */
const ANNOUNCEMENTS: Announcement[] = [
    {
        label: "New",
        emoji: "🪙",
        title: "Pay with crypto",
        description:
            "Buy Pollen packs with stablecoins such as USDC through Stripe. Pick a pack in [Pollen](/pollen), then choose Pay with Crypto.",
        details: [
            "Checkout is in USD. Refunds follow the [refund policy](/refunds) and return to your wallet as stablecoins.",
        ],
    },
    {
        label: "Since Oct 1",
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
        label: "Since Sep 24",
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
    {
        label: "API update",
        emoji: "🧪",
        title: "Model IDs are now standardized",
        description:
            "Model IDs now follow `publisher/model`, for example `flux` → `black-forest-labs/flux.1-schnell`. Existing IDs remain supported as aliases in API requests. [Browse models and their aliases](/models).",
    },
    {
        label: "Now live",
        emoji: "🧩",
        title: "Community model IDs get a clearer prefix",
        description:
            "Community models and agents are listed as community/username/model instead of username/model.",
        details: [
            "Both IDs keep working in generation requests. No changes to models, prices or providers.",
            "Key permissions use the canonical IDs. Existing permissions were migrated automatically.",
            "If your app matches saved IDs against the catalog, check aliases too.",
        ],
    },
    {
        label: "Alpha",
        emoji: "🧑‍💻",
        title: "Code agents: run your own agent.ts",
        description:
            "Point a code agent at a public GitHub repository and Pollinations deploys and runs it as a model.",
        details: [
            "Write one agent.ts using the bundled Vercel AI SDK, Pollinations models, and MCP tools.",
            "Calls are billed to whoever uses the agent, never to you.",
            "Fork an [example repository](https://github.com/orgs/pollinations/repositories?q=topic%3Apollinations-code-agent-example), then add it from [My Models](/my-models). [Read the guide](https://gen.pollinations.ai/docs#tag/publish-an-agent).",
        ],
    },
    {
        label: "Alpha",
        emoji: "🤖",
        title: "Build your own agents",
        description:
            "Create managed prompt agents and call them through the Pollinations API like any other model.",
        details: [
            "Choose a base model, add instructions, and optionally enable Pollinations tools.",
            "Create an agent from [My Models](/my-models).",
        ],
    },
    {
        label: "Alpha",
        emoji: "🧪",
        title: "Community models alpha",
        description:
            "Community models are now available on Pollinations in alpha.",
        details: [
            "Try community-hosted models from the [Models tab](/models), with attractive pricing.",
            "The catalog is early and will expand as more models are approved.",
            "Want to deploy your own model? Access is allowlist-only for now; contact us in the [Discord community](https://discord.gg/pollinations-ai-885844321461485618).",
        ],
    },
];

/** Render markdown links [text](url) and `code` spans, preserving surrounding text. */
function renderInline(text: string): ReactNode[] {
    const parts: ReactNode[] = [];
    let lastIndex = 0;
    for (const match of text.matchAll(/\[([^\]]+)\]\(([^)]+)\)|`([^`]+)`/g)) {
        const idx = match.index ?? 0;
        if (idx > lastIndex) {
            parts.push(text.slice(lastIndex, idx));
        }
        parts.push(
            match[3] !== undefined ? (
                <code key={idx}>{match[3]}</code>
            ) : (
                <InlineLink key={idx} href={match[2]}>
                    {match[1]}
                </InlineLink>
            ),
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

/** Hand-curated, fixed announcements — one card per item. */
export const Announcements: FC = () => {
    return (
        <div className="flex flex-col gap-3">
            {ANNOUNCEMENTS.map((item) => (
                <AnnouncementCard key={item.title} item={item} />
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

const AnnouncementCard: FC<{ item: Announcement }> = ({ item }) => (
    <Surface
        variant="card"
        className="min-w-0 break-words leading-relaxed [&_code]:break-all"
    >
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-theme-text-muted">
            {item.label}
        </div>
        <div className="flex items-baseline gap-2 font-semibold text-ink-900 text-base sm:text-lg">
            <span aria-hidden="true" className="shrink-0">
                {item.emoji}
            </span>
            <span>{item.title}</span>
        </div>
        <p className="mt-1 text-sm text-ink-700">
            {renderInline(item.description)}
        </p>
        {item.details && (
            <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm text-ink-700 marker:text-theme-text-soft">
                {item.details.map((detail) => (
                    <li key={detail}>{renderInline(detail)}</li>
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
        <p className="mt-1 text-ink-700">{renderInline(item.description)}</p>
    </Surface>
);
