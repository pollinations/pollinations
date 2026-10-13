import {
    Button,
    Chip,
    ExternalLinkButton,
    Eyebrow,
    GlobeIcon,
    Heading,
    IconTile,
    type IconTileProps,
    InlineLink,
    KeyIcon,
    Surface,
    TerminalIcon,
    Text,
    WalletIcon,
} from "@pollinations/ui";
import { Markdown } from "@pollinations/ui/markdown";
import { WalletKindIcon } from "@pollinations/ui/wallet";
import { type FC, type ReactNode, useState } from "react";
import {
    API_DOCS_URL,
    type ApiNews,
    apiDetails,
    apiDocsAnchor,
    type CardDetail,
    cardDetails,
    formatNewsDate,
    type Highlight,
    highlightLink,
    type ModelNews,
    type NewsIndex,
    visibleModelNews,
} from "./news-index.ts";

export const NEWS_MORE_URL =
    "https://github.com/pollinations/pollinations#-latest-news";

/** Rows shown at first and added per "Show older". */
const PAGE_SIZE = 10;

/** A launch or change pinned by hand; it shows until `until` (UTC day). */
type Announcement = {
    /** The day it shipped or takes effect. */
    date: string;
    until: string;
    label: "New" | "Changing";
    title: string;
    text: string;
    icon: IconTileProps["icon"];
    cta: { label: string; href: string };
};

/**
 * Newest first. Cards share a row, so keep them even: a title of a few
 * words, one sentence of about 80 characters and a two- or three-word button.
 */
const ANNOUNCEMENTS: Announcement[] = [
    {
        date: "2026-11-01",
        until: "2026-11-15",
        label: "Changing",
        title: "Publishable keys",
        text: "From Nov 1, pk_ keys only identify your app; users pay through Connect User Wallets.",
        icon: KeyIcon,
        cta: {
            label: "Migrate your app",
            href: "https://gen.pollinations.ai/docs#tag/connect-user-wallets",
        },
    },
    {
        date: "2026-10-10",
        until: "2026-10-24",
        label: "New",
        title: "A new pollinations.ai",
        text: "Redesigned: try models on Play, browse community apps and meet the builders.",
        icon: GlobeIcon,
        cta: {
            label: "Visit the website",
            href: "https://pollinations.ai",
        },
    },
    {
        date: "2026-10-06",
        until: "2026-10-20",
        label: "New",
        title: "Pay with crypto",
        text: "Buy Pollen packs with USDC: pick a pack, then choose Pay with Crypto.",
        icon: WalletIcon,
        cta: { label: "Buy Pollen", href: "/pollen" },
    },
    {
        date: "2026-10-02",
        until: "2026-10-16",
        label: "New",
        title: "Sandboxes",
        text: "Create E2B-compatible sandboxes with the API or polli sandbox, then connect over SSH.",
        icon: TerminalIcon,
        cta: {
            label: "Read the docs",
            href: "https://gen.pollinations.ai/docs#tag/sandboxes",
        },
    },
];

export const currentAnnouncements = (today: string) =>
    ANNOUNCEMENTS.filter(({ until }) => until >= today);

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
    <li className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1 border-t border-theme-text-strong/10 py-2 first:border-t-0 sm:grid-cols-[5.5rem_minmax(0,0.9fr)_minmax(0,1.1fr)]">
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

/** A day card's header: upcoming days say so, since they lead the list. */
const dayLabel = (date: string, today: string) =>
    date === today
        ? "Today"
        : date > today
          ? `Upcoming · ${formatNewsDate(date)}`
          : formatNewsDate(date);

/**
 * Model and API changes from merged PRs (news/index.json), today −30 to +30
 * days: upcoming ones first, then the latest past ones.
 */
export const Changelog: FC<{ index?: NewsIndex }> = ({ index }) => {
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
    // One card per day.
    const days: { date: string; items: ChangeItem[] }[] = [];
    for (const item of shown) {
        const day = days.at(-1);
        if (day?.date === item.date) day.items.push(item);
        else days.push({ date: item.date, items: [item] });
    }
    return (
        <>
            <div className="flex flex-col gap-3">
                {days.map(({ date, items }) => (
                    <Surface key={date} className="flex flex-col gap-1">
                        <Eyebrow>{dayLabel(date, today)}</Eyebrow>
                        <ul className="text-sm text-theme-text-base">
                            {items.map((item) => (
                                <ChangeRow key={item.key} item={item} />
                            ))}
                        </ul>
                    </Surface>
                ))}
            </div>
            <ShowOlder
                hidden={visiblePast >= past.length}
                onClick={() => setVisiblePast((count) => count + PAGE_SIZE)}
            />
        </>
    );
};

/** Hand-picked launches and changes as tinted feature cards that share each row. */
export const Announcements: FC<{ items: Announcement[] }> = ({ items }) => (
    <ul className="flex flex-wrap gap-3">
        {items.map((item) => (
            <Surface
                as="li"
                key={item.title}
                variant="card-themed"
                className="flex grow basis-72 flex-col gap-3 p-5 sm:p-6"
            >
                <div className="flex items-center gap-3">
                    <IconTile icon={item.icon} />
                    <Eyebrow>
                        {item.label} · {formatNewsDate(item.date)}
                    </Eyebrow>
                </div>
                <Heading as="h3" size="subsection">
                    {item.title}
                </Heading>
                <Text size="sm">{item.text}</Text>
                <div className="mt-auto pt-1">
                    <ExternalLinkButton href={item.cta.href}>
                        {item.cta.label}
                    </ExternalLinkButton>
                </div>
            </Surface>
        ))}
    </ul>
);

/** The daily highlights as a grid of cards, newest first. */
export const Updates: FC<{ items: Highlight[] }> = ({ items }) => {
    const [visible, setVisible] = useState(PAGE_SIZE);
    const updates = items.slice(0, visible);
    if (updates.length === 0) return null;
    const today = new Date().toISOString().slice(0, 10);
    return (
        <>
            <ul className="grid gap-3 sm:grid-cols-2">
                {updates.map((item) => {
                    const { text, link } = highlightLink(item.text);
                    return (
                        <Surface
                            as="li"
                            key={`${item.date}-${item.title}`}
                            className="flex flex-col gap-2"
                        >
                            <Eyebrow>
                                {item.date === today
                                    ? "Today"
                                    : formatNewsDate(item.date)}
                            </Eyebrow>
                            <strong className="text-sm text-theme-text-strong">
                                {item.title}
                            </strong>
                            <Markdown className="text-xs leading-5 text-theme-text-base">
                                {text}
                            </Markdown>
                            {link && (
                                <InlineLink
                                    href={link.href}
                                    size="sm"
                                    className="mt-auto self-start pt-1"
                                >
                                    {link.label}
                                </InlineLink>
                            )}
                        </Surface>
                    );
                })}
            </ul>
            <ShowOlder
                hidden={visible >= items.length}
                onClick={() => setVisible((count) => count + PAGE_SIZE)}
            />
        </>
    );
};
