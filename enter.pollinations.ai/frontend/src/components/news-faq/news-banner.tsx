import {
    Chip,
    GitPullRequestIcon,
    InlineLink,
    Section,
    Surface,
} from "@pollinations/ui";
import { Markdown } from "@pollinations/ui/markdown";
import type { FC } from "react";
import {
    cardDetails,
    type Highlight,
    type ModelNews,
    useNewsIndex,
    visibleModelNews,
} from "./news-index.ts";

export const NEWS_MORE_URL =
    "https://github.com/pollinations/pollinations#-latest-news";

const DYNAMIC_NEWS_COUNT = 6;

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

function actionChip({ action, date }: ModelNews, today: string) {
    const upcoming = date > today;
    if (action === "NEW") return { label: "New", intent: "success" } as const;
    if (action === "RETIRE") {
        return {
            label: upcoming ? "Retiring" : "Retired",
            intent: "danger",
        } as const;
    }
    return {
        label: upcoming ? "Updating" : "Updated",
        intent: "info",
    } as const;
}

const ModelCard: FC<{ news: ModelNews; today: string }> = ({ news, today }) => {
    const chip = actionChip(news, today);
    const details = cardDetails(news);
    return (
        <Surface variant="card" className="min-w-0 polli:p-3 polli:sm:p-3">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <time
                    dateTime={news.date}
                    className="shrink-0 whitespace-nowrap text-xs text-theme-text-muted"
                >
                    {formatNewsDate(news.date)}
                </time>
                <span className="shrink-0">
                    <Chip size="sm" intent={chip.intent}>
                        {chip.label}
                    </Chip>
                </span>
                <strong className="min-w-0 font-semibold text-theme-text-strong">
                    {news.title}
                </strong>
                <span className="shrink-0">
                    <InlineLink
                        href={news.url}
                        className="inline-flex items-center gap-1"
                        size="sm"
                        aria-label={`View pull request #${news.pr}`}
                        title={`PR #${news.pr}`}
                    >
                        <GitPullRequestIcon className="h-3 w-3" />
                    </InlineLink>
                </span>
            </div>
            {details.length > 0 && (
                <dl className="mt-2 grid gap-y-1 text-xs leading-5">
                    {details.map(({ label, before, after }, i) => (
                        <div
                            key={`${label}:${before}`}
                            className="flex max-w-full items-baseline gap-2"
                        >
                            <dt className="w-16 shrink-0 font-semibold text-theme-text-base">
                                {details[i - 1]?.label === label ? "" : label}
                            </dt>
                            <dd className="min-w-0">
                                {before && (
                                    <>
                                        <span className="text-theme-text-muted">
                                            {before}
                                        </span>
                                        <span className="mx-2 text-theme-text-muted">
                                            →
                                        </span>
                                    </>
                                )}
                                <span className="font-medium text-theme-text-strong">
                                    {after}
                                </span>
                            </dd>
                        </div>
                    ))}
                </dl>
            )}
        </Surface>
    );
};

/** Official model changes from merged PRs, today −7 to +30 days. */
export const ModelAnnouncements: FC = () => {
    const index = useNewsIndex();
    const today = new Date().toISOString().slice(0, 10);
    const models = visibleModelNews(index?.models ?? [], today);
    if (models.length === 0) return null;
    return (
        <Section
            title="Model announcements"
            actionClassName="ml-auto"
            action={
                <InlineLink href="/models" size="sm">
                    Browse models
                </InlineLink>
            }
        >
            <ul className="grid gap-2 text-sm text-theme-text-base">
                {models.map((news) => (
                    <li key={news.id} className="min-w-0">
                        <ModelCard news={news} today={today} />
                    </li>
                ))}
            </ul>
        </Section>
    );
};

interface PinnedItem {
    date?: string;
    /** Optional status shown after the date. */
    dateLabel?: string;
    until?: string;
    emoji: string;
    title: string;
    description: string;
    /** Optional bullet list rendered under the description. */
    details?: string[];
}

const PINNED_NEWS: PinnedItem[] = [
    {
        date: "2026-08-27",
        dateLabel: "API update",
        emoji: "🧪",
        title: "Model IDs are now standardized",
        description:
            "Model IDs now follow `publisher/model`—for example, `flux` → `black-forest-labs/flux.1-schnell`. The model catalog uses the new IDs. Existing IDs remain supported as aliases in API requests. [Browse models and their aliases](/models).",
    },
    {
        date: "2026-10-06",
        until: "2026-10-20",
        emoji: "💳",
        title: "Pay with crypto",
        description:
            "Buy Pollen packs with **USDC**. Pick a pack in [Pollen](/pollen), then choose **Pay with Crypto**.",
    },
    {
        date: "2026-10-02",
        until: "2026-10-16",
        emoji: "📦",
        title: "Sandboxes",
        description:
            "Create E2B-compatible sandboxes through the API or `polli sandbox`, then connect over SSH. [Docs](https://gen.pollinations.ai/docs#tag/sandboxes).",
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

/** Hand-curated, pinned announcements — one card per item. */
export const InfrastructureAnnouncements: FC = () => {
    const today = new Date().toISOString().slice(0, 10);
    const current = PINNED_NEWS.filter(
        ({ until }) => !until || until >= today,
    ).sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
    return (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,20rem),1fr))] gap-2">
            {current.map((item) => (
                <PinnedNews key={item.title} item={item} />
            ))}
        </div>
    );
};

const PinnedNews: FC<{ item: PinnedItem }> = ({ item }) => (
    <Surface variant="card" className="min-w-0 polli:p-3 polli:sm:p-3">
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
        <div className="flex items-baseline gap-2 font-semibold text-theme-text-strong text-sm">
            <span aria-hidden="true" className="shrink-0">
                {item.emoji}
            </span>
            <span>{item.title}</span>
        </div>
        <Markdown className="mt-1 text-sm text-ink-700 polli:leading-5">
            {item.description}
        </Markdown>
        {item.details && item.details.length > 0 && (
            <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-theme-text-base">
                {item.details.map((detail) => (
                    <li key={detail}>
                        <Markdown className="polli:leading-5">
                            {detail}
                        </Markdown>
                    </li>
                ))}
            </ul>
        )}
    </Surface>
);

/** The latest daily highlights; apps are listed in the README instead. */
export const NewsBanner: FC = () => {
    const index = useNewsIndex();
    const highlights = (index?.highlights ?? [])
        .filter((item) => !item.app)
        .slice(0, DYNAMIC_NEWS_COUNT);
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
        <time
            dateTime={item.date}
            className="mb-1 block text-xs font-medium text-theme-text-muted"
        >
            {formatNewsDate(item.date)}
        </time>
        <div className="flex items-start gap-2 font-semibold text-ink-900">
            {item.emoji && (
                <span aria-hidden="true" className="shrink-0 text-base">
                    {item.emoji}
                </span>
            )}
            <div className="min-w-0">{item.title}</div>
        </div>
        <Markdown className="mt-1 text-ink-700">{item.text}</Markdown>
    </Surface>
);
