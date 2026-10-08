import {
    Button,
    Chip,
    GitPullRequestIcon,
    InlineLink,
    Section,
    Surface,
} from "@pollinations/ui";
import { Markdown } from "@pollinations/ui/markdown";
import { type FC, Fragment, type ReactNode, useState } from "react";
import {
    type BalanceAccess,
    BalanceAccessChip,
} from "../models/model-status-chips.tsx";
import {
    type ApiNews,
    apiDetails,
    type CardDetail,
    cardDetails,
    formatNewsDate,
    type Highlight,
    type ModelNews,
    newsHighlights,
    useNewsIndex,
    visibleModelNews,
} from "./news-index.ts";

export const NEWS_MORE_URL =
    "https://github.com/pollinations/pollinations#-latest-news";

const DYNAMIC_NEWS_COUNT = 6;
/** Past changes shown at first and added per "Show older". */
const PAGE_SIZE = 10;

function changeChip(
    { action, date, changes, status }: ModelNews,
    today: string,
) {
    const upcoming = date > today;
    if (status === "cancelled") {
        return { label: "No longer retiring", intent: "info" } as const;
    }
    // Same ID, different model behind it: check voices and behavior.
    if (changes.model_id)
        return { label: "Replaced", intent: "warning" } as const;
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

/** Balance values use /models' Quest and Paid chips; the rest is text. */
const DetailValue: FC<{ label: string; value: string; muted?: boolean }> = ({
    label,
    value,
    muted,
}) =>
    label === "Balance" ? (
        <BalanceAccessChip access={value as BalanceAccess} />
    ) : (
        <span
            className={
                muted
                    ? "text-theme-text-muted"
                    : "font-medium text-theme-text-strong"
            }
        >
            {value}
        </span>
    );

type ChangeItem = {
    key: string;
    date: string;
    chip: { label: string; intent: "danger" | "info" | "success" | "warning" };
    name: ReactNode;
    pr: number;
    url: string;
    details: CardDetail[];
};

const modelChange = (news: ModelNews, today: string): ChangeItem => ({
    key: news.id,
    date: news.date,
    chip: changeChip(news, today),
    name: (
        <strong className="text-theme-text-strong">
            {news.changes.model_id
                ? `${news.previous_title ?? news.changes.model_id.before} → ${news.title}`
                : news.title}
        </strong>
    ),
    pr: news.pr,
    url: news.url,
    details: cardDetails(news),
});

const API_LABEL = {
    ADD: "New",
    CHANGE: "Changed",
    REMOVE: "Removed",
} as const;

/** API rows name the endpoint in code style; breaking ones are red like retirements. */
const apiChange = (news: ApiNews): ChangeItem => {
    const [method, path] = news.endpoint.split(" ");
    return {
        key: news.id,
        date: news.date,
        chip: {
            label: API_LABEL[news.action],
            intent:
                news.action === "ADD"
                    ? "success"
                    : news.breaking
                      ? "danger"
                      : "info",
        },
        name: (
            <code className="font-mono text-xs text-theme-text-strong">
                <span className="font-semibold">{method}</span> {path}
            </code>
        ),
        pr: news.pr,
        url: news.url,
        details: apiDetails(news),
    };
};

const ChangeRow: FC<{ item: ChangeItem }> = ({ item }) => {
    const { chip, details } = item;
    return (
        <li
            className={`grid border-t border-theme-text-strong/10 first:border-t-0 grid-cols-[3.5rem_5.25rem_minmax(0,1fr)] items-baseline gap-x-2 gap-y-1 py-2 sm:grid-cols-[3.5rem_5.25rem_minmax(0,0.8fr)_minmax(0,1.2fr)]`}
        >
            <time
                dateTime={item.date}
                className="whitespace-nowrap text-theme-text-muted"
            >
                {formatNewsDate(item.date)}
            </time>
            <span>
                <Chip size="sm" intent={chip.intent}>
                    {chip.label}
                </Chip>
            </span>
            <span className="min-w-0">
                {item.name}{" "}
                <InlineLink
                    href={item.url}
                    className="inline-flex items-center gap-1"
                    size="sm"
                    aria-label={`View pull request #${item.pr}`}
                    title={`PR #${item.pr}`}
                >
                    <GitPullRequestIcon className="h-3 w-3" />
                </InlineLink>
            </span>
            {details.length > 0 && (
                <dl className="col-span-3 grid gap-y-0.5 text-xs leading-5 sm:col-span-1">
                    {details.map(({ label, before, after }, i) => (
                        <div
                            key={`${label}:${before}`}
                            className="flex max-w-full items-baseline gap-2"
                        >
                            <dt className="w-16 shrink-0 font-semibold text-theme-text-base">
                                {details[i - 1]?.label === label ? "" : label}
                            </dt>
                            <dd className="flex min-w-0 flex-wrap items-baseline gap-x-1.5">
                                {before && (
                                    <>
                                        <DetailValue
                                            label={label}
                                            value={before}
                                            muted
                                        />
                                        <span className="text-theme-text-muted">
                                            →
                                        </span>
                                    </>
                                )}
                                <DetailValue label={label} value={after} />
                            </dd>
                        </div>
                    ))}
                </dl>
            )}
        </li>
    );
};

/** Separates upcoming changes (above) from past ones (below). */
const TodayLine: FC = () => (
    <li className="flex items-center gap-2 py-1 text-[11px] [&+li]:border-t-0 font-semibold uppercase tracking-wider text-theme-text-muted">
        <span className="h-px flex-1 bg-theme-text-strong/30" />
        Today
        <span className="h-px flex-1 bg-theme-text-strong/30" />
    </li>
);

/**
 * Changes that can affect what users built: model updates and retirements from
 * merged PRs (news/index.json), today −30 to +30 days.
 */
export const Changelog: FC = () => {
    const index = useNewsIndex();
    const [visiblePast, setVisiblePast] = useState(PAGE_SIZE);
    const today = new Date().toISOString().slice(0, 10);
    // Model changes and API changes, newest first, so upcoming changes lead.
    const changes = [
        ...visibleModelNews(index?.models ?? [], today).map((news) =>
            modelChange(news, today),
        ),
        ...visibleModelNews(index?.api ?? [], today).map(apiChange),
    ].sort((a, b) => b.date.localeCompare(a.date));
    // All upcoming changes, then the latest past ones, PAGE_SIZE at a time.
    const upcoming = changes.filter(({ date }) => date > today);
    const past = changes.filter(({ date }) => date <= today);
    const shown = [...upcoming, ...past.slice(0, visiblePast)];
    if (changes.length === 0) return null;
    return (
        <Section
            title="Changelog"
            actionClassName="ml-auto"
            action={
                <InlineLink href="/models" size="sm">
                    Browse models
                </InlineLink>
            }
        >
            <ul className="text-sm text-theme-text-base">
                {shown.map((item, i) => (
                    <Fragment key={item.key}>
                        {item.date <= today &&
                            (shown[i - 1]?.date ?? "") > today && <TodayLine />}
                        <ChangeRow item={item} />
                    </Fragment>
                ))}
            </ul>
            {visiblePast < past.length && (
                <div className="mt-4 flex justify-end">
                    <Button
                        as="button"
                        onClick={() =>
                            setVisiblePast((count) => count + PAGE_SIZE)
                        }
                    >
                        Show older
                    </Button>
                </div>
            )}
        </Section>
    );
};

/** The latest highlights picked by the daily summaries; apps are listed in the README only. */
export const NewsBanner: FC = () => {
    const index = useNewsIndex();
    const highlights = index
        ? newsHighlights(index).slice(0, DYNAMIC_NEWS_COUNT)
        : [];
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
