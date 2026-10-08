import { Button, Chip, InlineLink, Section } from "@pollinations/ui";
import { Markdown } from "@pollinations/ui/markdown";
import { WalletKindIcon } from "@pollinations/ui/wallet";
import { type FC, Fragment, type ReactNode, useState } from "react";
import {
    API_DOCS_URL,
    type ApiNews,
    apiDetails,
    apiDocsAnchor,
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
        return { label: "Not retiring", intent: "info" } as const;
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
}) => {
    const tone = muted ? "text-theme-text-muted" : "text-theme-text-base";
    return label === "Balance" ? (
        <span className={`inline-flex items-baseline gap-1 ${tone}`}>
            <WalletKindIcon
                kind={value === "paid" ? "paid" : "tier"}
                className={`self-center ${muted ? "opacity-50" : ""}`}
            />
            {value === "paid" ? "Paid" : "Quest"}
        </span>
    ) : (
        <span className={tone}>{value}</span>
    );
};

type ChangeItem = {
    key: string;
    date: string;
    chip: { label: string; intent: "danger" | "info" | "success" | "warning" };
    name: ReactNode;
    /** Where the change lives now; none once it is gone. */
    href?: string;
    details: CardDetail[];
};

const modelChange = (news: ModelNews, today: string): ChangeItem => ({
    key: news.id,
    date: news.date,
    chip: changeChip(news, today),
    name: <strong>{news.title}</strong>,
    href:
        news.action === "RETIRE" &&
        news.status !== "cancelled" &&
        news.date <= today
            ? undefined
            : `/models?q=${encodeURIComponent(news.model_id)}`,
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
            <code className="font-mono text-xs">
                <span className="font-semibold">{method}</span> {path}
            </code>
        ),
        href:
            news.action === "REMOVE"
                ? undefined
                : `${API_DOCS_URL}#${apiDocsAnchor(news)}`,
        details: apiDetails(news),
    };
};

const ChangeRow: FC<{ item: ChangeItem }> = ({ item }) => (
    <li className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1 border-t border-theme-text-strong/10 py-2 sm:grid-cols-[5.5rem_minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <Chip
            size="sm"
            intent={item.chip.intent}
            className="justify-self-start"
        >
            {item.chip.label}
        </Chip>
        <div className="min-w-0 text-theme-text-strong sm:border-l sm:border-theme-text-strong/15 sm:pl-3">
            {item.href ? (
                <InlineLink href={item.href}>{item.name}</InlineLink>
            ) : (
                item.name
            )}
        </div>
        {item.details.length > 0 && (
            <dl className="col-start-2 grid gap-y-0.5 text-xs leading-5 sm:col-start-3 sm:border-l sm:border-theme-text-strong/15 sm:pl-3">
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
const DayLine: FC<{ date: string; today: string }> = ({ date, today }) => (
    <li className="flex items-center gap-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-theme-text-muted [&+li]:border-t-0">
        <span className="h-px flex-1 bg-theme-text-strong/30" />
        {date === today ? "Today" : formatNewsDate(date)}
        <span className="h-px flex-1 bg-theme-text-strong/30" />
    </li>
);

/**
 * Model and API changes from merged PRs (news/index.json), today −30 to +30
 * days: upcoming ones first, then the latest past ones.
 */
export const Changelog: FC = () => {
    const index = useNewsIndex();
    const [visiblePast, setVisiblePast] = useState(PAGE_SIZE);
    if (!index) return null;
    const today = new Date().toISOString().slice(0, 10);
    // Newest first, so upcoming changes lead.
    const changes = [
        ...visibleModelNews(index.models, today).map((news) =>
            modelChange(news, today),
        ),
        ...visibleModelNews(index.api, today).map(apiChange),
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
                <div className="flex gap-4">
                    <InlineLink href="/models" size="sm">
                        Browse models
                    </InlineLink>
                    <InlineLink href="https://gen.pollinations.ai/docs" size="sm">
                        API docs
                    </InlineLink>
                </div>
            }
        >
            <ul className="text-sm text-theme-text-base">
                {shown.map((item, i) => {
                    const previous = shown[i - 1]?.date ?? "";
                    return (
                        <Fragment key={item.key}>
                            {/* Marks today even on a day without changes. */}
                            {item.date < today && previous > today && (
                                <DayLine date={today} today={today} />
                            )}
                            {item.date !== previous && (
                                <DayLine date={item.date} today={today} />
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
                            <DayLine date={item.date} today={today} />
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
