import { InlineLink, Surface } from "@pollinations/ui";
import { type FC, type ReactNode, useEffect, useState } from "react";

import {
    DYNAMIC_NEWS_COUNT,
    HIGHLIGHTS_RAW_URL,
    type Highlight,
    parseHighlights,
} from "./highlights";

export { HIGHLIGHTS_GITHUB_URL } from "./highlights";

/**
 * Pinned news items that stay visible regardless of daily updates.
 * Edit this array to add/remove pinned announcements.
 */
const PINNED_NEWS: Highlight[] = [
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
    {
        date: "2026-09-11",
        dateLabel: "Alpha",
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
        date: "2026-09-11",
        dateLabel: "Now live",
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
        date: "2026-08-15",
        dateLabel: "Alpha",
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
        date: "2026-08-15",
        dateLabel: "New quests",
        emoji: "🌱",
        title: "More ways to earn Pollen",
        description:
            "Earn 15 Pollen for your first external Paid Pollen request, 3 for reaching ten external app users, and 5 when other users spend 3 Paid Pollen through your apps. [View quests](/quests).",
    },
    {
        date: "2026-06-30",
        dateLabel: "Alpha",
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
            <CanonicalModelSlugAnnouncement />
            {PINNED_NEWS.map((item) => (
                <PinnedNews key={item.title} item={item} />
            ))}
        </div>
    );
};

const CanonicalModelSlugAnnouncement: FC = () => (
    <Surface
        id="canonical-model-slugs"
        variant="card"
        className="scroll-mt-4 break-words leading-relaxed [&_code]:break-all"
    >
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-theme-text-muted">
            API update
        </div>
        <div className="flex items-baseline gap-2 font-semibold text-ink-900 text-base sm:text-lg">
            <span aria-hidden="true" className="shrink-0">
                🧪
            </span>
            <span>Model IDs are now standardized</span>
        </div>
        <p className="mt-1 text-sm text-ink-700">
            Model IDs now follow <code>publisher/model</code>—for example,{" "}
            <code>flux</code> → <code>black-forest-labs/flux.1-schnell</code>.
            The model catalog uses the new IDs. Existing IDs remain supported as
            aliases in API requests.
        </p>
        <InlineLink href="/models" className="mt-3 block w-fit text-sm">
            Browse models and their aliases
        </InlineLink>
    </Surface>
);

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
