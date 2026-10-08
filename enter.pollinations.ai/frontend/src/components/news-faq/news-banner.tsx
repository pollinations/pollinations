import { Button, Chip, InlineLink, Section } from "@pollinations/ui";
import { Markdown } from "@pollinations/ui/markdown";
import { WalletKindIcon } from "@pollinations/ui/wallet";
import { type FC, Fragment, type ReactNode, useState } from "react";
import {
    type ApiNews,
    apiDetails,
    type CardDetail,
    cardDetails,
    formatNewsDate,
    type ModelNews,
    newsHighlights,
    useNewsIndex,
    visibleModelNews,
} from "./news-index.ts";

export const NEWS_MORE_URL =
    "https://github.com/pollinations/pollinations#-latest-news";

/** Rows shown at first and added per "Show older". */
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

/** Balance values show the wallet icon and its name; the rest is text. */
const DetailValue: FC<{ label: string; value: string; muted?: boolean }> = ({
    label,
    value,
    muted,
}) =>
    label === "Balance" ? (
        <span
            className={`inline-flex items-center gap-1 ${muted ? "text-theme-text-muted" : "text-theme-text-base"}`}
        >
            <WalletKindIcon
                kind={value === "paid" ? "paid" : "tier"}
                className={muted ? "opacity-50" : undefined}
            />
            {value === "paid" ? "Paid" : "Quest"}
        </span>
    ) : (
        <span
            className={muted ? "text-theme-text-muted" : "text-theme-text-base"}
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
    name: <strong className="text-theme-text-strong">{news.title}</strong>,
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

const ChangeRow: FC<{ item: ChangeItem }> = ({ item }) => (
    <li className="grid items-baseline gap-x-3 gap-y-1 border-t border-theme-text-strong/10 py-2 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <Chip size="sm" intent={item.chip.intent}>
                    {item.chip.label}
                </Chip>
                <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    title={`PR #${item.pr}`}
                    className="min-w-0 hover:underline"
                >
                    {item.name}
                </a>
            </div>
        </div>
        {item.details.length > 0 && (
            <dl className="grid gap-y-0.5 text-xs leading-5">
                {item.details.map(({ label, before, after }, i) => (
                    <div
                        key={`${label}:${before}`}
                        className="flex max-w-full items-baseline gap-2"
                    >
                        <dt className="w-16 shrink-0 text-theme-text-muted">
                            {item.details[i - 1]?.label === label ? "" : label}
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

/** Adds PAGE_SIZE more rows, back to the 30 days the index keeps. */
const ShowOlder: FC<{ hidden: boolean; onClick: () => void }> = ({
    hidden,
    onClick,
}) =>
    hidden ? null : (
        <div className="mt-4 flex justify-end">
            <Button as="button" onClick={onClick}>
                Show older
            </Button>
        </div>
    );

/** Starts each day; the row after it needs no top border. */
const DayLine: FC<{ label: string }> = ({ label }) => (
    <li className="flex items-center gap-2 py-1 text-[11px] [&+li]:border-t-0 font-semibold uppercase tracking-wider text-theme-text-muted">
        <span className="h-px flex-1 bg-theme-text-strong/30" />
        {label}
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
                {shown.map((item, i) => {
                    const previous = shown[i - 1]?.date ?? "";
                    return (
                        <Fragment key={item.key}>
                            {/* Marks today even on a day without changes. */}
                            {item.date < today && previous > today && (
                                <DayLine label="Today" />
                            )}
                            {item.date !== previous && (
                                <DayLine
                                    label={
                                        item.date === today
                                            ? "Today"
                                            : formatNewsDate(item.date)
                                    }
                                />
                            )}
                            <ChangeRow item={item} />
                        </Fragment>
                    );
                })}
            </ul>
            <ShowOlder
                hidden={visiblePast >= past.length}
                onClick={() => setVisiblePast((count) => count + PAGE_SIZE)}
            />
        </Section>
    );
};

/** The latest highlights picked by the daily summaries, laid out like the Changelog. */
export const NewsBanner: FC = () => {
    const index = useNewsIndex();
    const [visible, setVisible] = useState(PAGE_SIZE);
    const all = index ? newsHighlights(index) : [];
    const highlights = all.slice(0, visible);
    if (highlights.length === 0) return null;
    const today = new Date().toISOString().slice(0, 10);
    return (
        <>
            <ul className="text-sm text-theme-text-base">
                {highlights.map((item, i) => (
                    <Fragment key={`${item.date}-${item.title}`}>
                        {item.date !== highlights[i - 1]?.date && (
                            <DayLine
                                label={
                                    item.date === today
                                        ? "Today"
                                        : formatNewsDate(item.date)
                                }
                            />
                        )}
                        <li className="grid items-baseline gap-x-3 gap-y-1 border-t border-theme-text-strong/10 py-2 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                            <strong className="text-theme-text-strong">
                                {item.emoji && (
                                    <span aria-hidden="true" className="mr-2">
                                        {item.emoji}
                                    </span>
                                )}
                                {item.title}
                            </strong>
                            <Markdown className="text-xs leading-5 text-theme-text-base">
                                {item.text}
                            </Markdown>
                        </li>
                    </Fragment>
                ))}
            </ul>
            <ShowOlder
                hidden={visible >= all.length}
                onClick={() => setVisible((count) => count + PAGE_SIZE)}
            />
        </>
    );
};
