import { Chip, InlineLink, Section, Surface } from "@pollinations/ui";
import type { FC, ReactNode } from "react";

const UPCOMING_CHANGES = [
    {
        when: "Oct 3",
        model: "Qwen3 Coder 30B",
        action: "Updating",
        change: "Bedrock; Paid Pollen; $0.15/$0.60 per 1M input/output tokens. IDs unchanged.",
        note: "No Responses API, seed, logprobs or stop. Named tool choice uses auto; schemas are not enforced.",
    },
    {
        when: "Oct 9",
        model: "Qwen3 VL 235B Thinking",
        action: "Retiring",
        change: "Alibaba route retires. Choose another vision model.",
    },
    {
        when: "Oct 13",
        model: "Cohere Command A+",
        action: "Retiring",
        change: "Azure route is due to retire. Replacement details to follow.",
    },
    {
        when: "Oct 20",
        model: "Gemini 2.5 Flash Lite + Search",
        action: "Retiring",
        change: "Vertex AI routes retire. Update apps using these models or their aliases.",
    },
    {
        when: "Nov 2",
        model: "Grok Imagine Pro",
        action: "Updating",
        change: "Redirects to Image 2.0. Output and pricing change.",
    },
];

export const UpcomingChanges: FC = () => (
    <ul className="flex flex-col gap-4 text-sm text-theme-text-base">
        {UPCOMING_CHANGES.map(({ when, model, action, change, note }) => (
            <li
                key={model}
                className="grid grid-cols-[3.5rem_5.25rem_minmax(0,1fr)] items-start gap-x-2 gap-y-2 sm:grid-cols-[3.5rem_5.25rem_minmax(0,0.8fr)_minmax(0,1.2fr)]"
            >
                <span className="whitespace-nowrap text-theme-text-muted">
                    {when}
                </span>
                <span className="border-l border-theme-text-strong/15 pl-2">
                    <Chip
                        size="sm"
                        intent={action === "Retiring" ? "warning" : "info"}
                    >
                        {action}
                    </Chip>
                </span>
                <strong className="min-w-0 border-l border-theme-text-strong/15 pl-2 text-theme-text-strong">
                    {model}
                </strong>
                <div className="col-span-3 min-w-0 sm:col-span-1 sm:border-l sm:border-theme-text-strong/15 sm:pl-2">
                    <p>{change}</p>
                    {note && <p className="mt-1">{note}</p>}
                </div>
            </li>
        ))}
    </ul>
);

interface Highlight {
    date?: string;
    /** Optional status shown after the date. */
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
const RECENT_MODEL_CHANGES: Highlight[] = [
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

const PINNED_NEWS: Highlight[] = [
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
    });
}

export const RecentChanges: FC = () => {
    const today = new Date().toISOString().slice(0, 10);
    const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);
    const recent = RECENT_MODEL_CHANGES.filter(
        ({ date }) => date && date >= cutoff && date <= today,
    );
    if (recent.length === 0) return null;
    return (
        <Section title="Recent model changes">
            <div className="flex flex-col gap-3">
                {recent.map((item) => (
                    <PinnedNews key={item.title} item={item} />
                ))}
            </div>
        </Section>
    );
};

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
            <time dateTime="2026-08-27">Aug 27</time> · API update
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

const PinnedNews: FC<{ item: Highlight }> = ({ item }) => (
    <Surface variant="card" className="min-w-0 leading-relaxed">
        {(item.dateLabel || item.date) && (
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-theme-text-muted">
                {item.date && (
                    <time dateTime={item.date}>
                        {formatNewsDate(item.date)}
                    </time>
                )}
                {item.dateLabel && <span> · {item.dateLabel}</span>}
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
