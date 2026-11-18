import {
    Alert,
    BeakerIcon,
    Button,
    CardIcon,
    CheckIcon,
    ChevronIcon,
    Chip,
    ClockIcon,
    CopyField,
    formatCount,
    GitMergeIcon,
    GitPullRequestIcon,
    InfoTip,
    InlineLink,
    IssueClosedIcon,
    LayersIcon,
    LoadingStatus,
    OutageNotice,
    ReceiptIcon,
    Section,
    SparkleIcon,
    SproutIcon,
    Surface,
    TabButton,
    TargetIcon,
    Text,
} from "@pollinations/ui";
import { Markdown } from "@pollinations/ui/markdown";
import {
    formatPollen,
    WalletBalanceCard,
    WalletKindIcon,
} from "@pollinations/ui/wallet";
import { useLoaderData, useRouter } from "@tanstack/react-router";
import {
    type FC,
    type ReactNode,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { accountClient, apiClient } from "../../api.ts";
import type {
    QuestCatalogResponse,
    QuestCheckResult,
    QuestStandingsResponse,
} from "../../backend-types.ts";
import { isOutageStatus, useOutage, useOutageRetry } from "../../lib/outage.ts";
import {
    CardLoading,
    LoadError,
    SectionContent,
} from "../layout/dashboard-loading.tsx";
import { QUEST_STATUS_UPDATED_EVENT } from "./quest-nav-status.ts";
import { QuestStandings } from "./quest-standings.tsx";
import { RedeemCode } from "./redeem-code.tsx";

type QuestCatalogItem = QuestCatalogResponse["quests"][number];
type QuestProgress = QuestCheckResult["progress"][number];

type QuestOverviewProps = Record<string, never>;

type QuestReward = {
    id: string;
    questId: string | null;
    title: string;
    pollenAmount: number;
    balanceBucket: string;
    earnedAt: string;
    claimedAt: string | null;
    url?: string | null;
};

type FetchState = {
    catalog: QuestCatalogItem[];
    rewards: QuestReward[];
    // Monthly leaderboard; null when it failed to load (the page still works).
    standings: QuestStandingsResponse | null;
    progress: QuestProgress[];
    loading: boolean;
    checking: boolean;
    error: string | null;
    claimingRewardIds: string[];
    // Anonymous (logged-out) visitors get the public catalog only — the
    // per-user rewards endpoint 401s, so there is nothing to claim and every
    // quest is rendered open as a "here's what you can earn" preview.
    anonymous: boolean;
};

const INITIAL_STATE: FetchState = {
    catalog: [],
    rewards: [],
    standings: null,
    progress: [],
    loading: true,
    checking: false,
    error: null,
    claimingRewardIds: [],
    anonymous: false,
};

type RewardIconKind = "paid" | "tier";

// ── Category model ──────────────────────────────────────────────────────────
// One lane per backend quest.category, mapped 1:1. The source group that found
// a quest is intentionally separate from the category that organizes it.
type CategoryKey = QuestCatalogItem["category"];

type CategoryMeta = {
    key: CategoryKey;
    label: string;
};

const CATEGORIES: CategoryMeta[] = [
    {
        key: "setup",
        label: "Setup",
    },
    {
        key: "grow",
        label: "Grow",
    },
    {
        key: "contribute",
        label: "Contribute",
    },
    {
        key: "community",
        label: "Community",
    },
];

// Keeps the admin grants (grant:<campaign>) on the page only: a grant is not a
// quest anyone can do, so it has no catalog entry. Shown to people who got one.
const OTHER_CONTRIBUTIONS: QuestCatalogItem = {
    id: "other_contributions",
    title: "Other contributions",
    description: "Rewards from the team for help beyond a PR or issue.",
    category: "contribute",
    state: "completed",
    repeatable: true,
    rewardAmount: 0,
    balanceBucket: "tier",
    url: null,
};

// Event codes as a quest: the code field sits in its card, and each code
// redeemed (promo:<event>) stacks on it. Page only, like the grants card.
const EVENT_CODES: QuestCatalogItem = {
    id: "event_codes",
    title: "Event codes",
    description: "",
    category: "community",
    state: "available",
    repeatable: true,
    rewardAmount: 0,
    balanceBucket: "tier",
    url: null,
};

// Rewards recorded one per PR, fixed issue, grant or code, and the card that
// keeps them.
// A GitHub quest you won was paid for your merged PR, so it joins that stack.
const CARD_BY_PREFIX = [
    ["github:merged_pr:", "merged_pr"],
    ["github:issue:", "merged_pr"],
    ["github:reported_issue:", "reported_merged_issue"],
    ["grant:", OTHER_CONTRIBUTIONS.id],
    ["promo:", EVENT_CODES.id],
] as const;

/** The catalog card a reward belongs to. */
function cardIdOf(questId: string | null): string | null {
    const match = CARD_BY_PREFIX.find(([prefix]) =>
        questId?.startsWith(prefix),
    );
    return match ? match[1] : questId;
}

function issueNumberFromId(id: string): number | null {
    const match = /^github:issue:(\d+)$/.exec(id);
    return match ? Number(match[1]) : null;
}

function githubNumberFromUrl(url: string | null | undefined): number | null {
    const match = url?.match(
        /github\.com\/[^/]+\/[^/]+\/(?:issues|pull)\/(\d+)/,
    );
    return match ? Number(match[1]) : null;
}

// Lifecycle stage for one quest row:
//  - coming_soon always renders in the receded (claimed) style.
//  - Logged-out preview (previewAll) forces every row open.
//  - Logged in: a reward you earned is claimed once banked, claimable until
//    then; no reward means the quest is still open.
function deriveCardStatus(
    comingSoon: boolean,
    previewAll: boolean,
    reward: QuestReward | undefined,
): QuestCardStatus {
    if (comingSoon) return "claimed";
    if (previewAll) return "open";
    if (!reward) return "open";
    return reward.claimedAt ? "claimed" : "claimable";
}

// Lane ordering rank: claimable first, then claimed, then open, then
// coming_soon last.
function cardSortRank(card: QuestCard): number {
    if (card.comingSoon) return 3;
    switch (card.status) {
        // Waiting for Claim, then still to do, then done.
        case "claimable":
            return 0;
        case "claimed":
            return 2;
        default:
            return 1;
    }
}

// ── Formatting helpers ──────────────────────────────────────────────────────
// Rewards are dollars; the sprout or card beside them names the balance.
function formatRewardAmount(value: number | null): string {
    if (value == null) return "TBD";
    const formatted = formatPollen(value);
    if (value > 0 && formatted === "0") return "<$0.0001";
    return `$${formatted}`;
}

function rewardIconKind(
    balanceBucket: string | null | undefined,
): RewardIconKind {
    return balanceBucket === "paid" || balanceBucket === "pack"
        ? "paid"
        : "tier";
}

type QuestData = Pick<
    FetchState,
    "catalog" | "rewards" | "standings" | "anonymous"
>;

async function loadQuestData(): Promise<QuestData> {
    // The catalog is public; the per-user rewards endpoint requires auth. A
    // logged-out visitor still gets the full catalog (rendered all-open as a
    // preview), so a 401 on rewards is expected, not an error.
    // Rewards and standings fail on their own (null = no response); the
    // list still shows.
    const [catalogResponse, rewardsResponse, standingsResponse] =
        await Promise.all([
            apiClient.quests.catalog.$get(),
            accountClient.quests.rewards.$get().catch(() => null),
            apiClient.quests.standings.$get().catch(() => null),
        ]);
    if (!catalogResponse.ok) {
        throw new Error(`Failed to load quests (${catalogResponse.status})`);
    }
    const catalog = (await catalogResponse.json()) as QuestCatalogResponse;

    // During an outage the list still shows, without the user's rewards.
    const anonymous =
        rewardsResponse?.status === 401 ||
        isOutageStatus(rewardsResponse?.status);
    if (rewardsResponse && !rewardsResponse.ok && !anonymous) {
        throw new Error(`Failed to load quests (${rewardsResponse.status})`);
    }
    const account =
        anonymous || !rewardsResponse
            ? { rewards: [] }
            : ((await rewardsResponse.json()) as {
                  rewards: QuestReward[];
              });

    const standings = standingsResponse?.ok
        ? ((await standingsResponse.json()) as QuestStandingsResponse)
        : null;

    return {
        catalog: catalog.quests ?? [],
        rewards: account.rewards ?? [],
        standings,
        anonymous,
    };
}

// ── Card model ──────────────────────────────────────────────────────────────
// A single quest row. Open shows the possible reward; claimable means the reward
// exists but has not moved into the balance; claimed means pollen was deposited.
export type QuestCardStatus = "open" | "claimable" | "claimed";

export type QuestCard = {
    key: string;
    /** The rewards one Claim pays. */
    rewardIds?: string[];
    title: string;
    description?: string;
    url?: string;
    issueNumber?: number;
    reward: number | null;
    balanceBucket?: string | null;
    status: QuestCardStatus;
    earnedAmount?: number | null;
    progress?: QuestProgress;
    /** A repeatable quest's rewards: its card keeps them all. */
    repeats?: QuestReward[];
    // coming_soon quests render at the bottom of their lane in the receded
    // (claimed) style, with a clock + "Coming soon" in place of the reward.
    comingSoon?: boolean;
};

// ── Presentational primitives (composed from @pollinations/ui) ───────────────

// Soft bucket-colored tile for the reward chip: amber paid / green Quest,
// so the row's reward badge carries the bucket identity.
// Logged-out preview: what the public catalog offers, as two plain numbers.
function QuestPreview({ quests, pollen }: { quests: number; pollen: number }) {
    return (
        <div className="grid grid-cols-2 gap-3">
            <WalletBalanceCard
                tone="neutral"
                kind="paid"
                label="Available quests"
                value={quests}
                icon={<SparkleIcon className="h-3.5 w-3.5 shrink-0" />}
            />
            <WalletBalanceCard
                tone="neutral"
                kind="tier"
                label="To earn"
                value={formatRewardAmount(pollen)}
                icon={
                    <SproutIcon
                        aria-hidden="true"
                        className="polli-wallet-text-tier h-3.5 w-3.5 shrink-0"
                    />
                }
            />
        </div>
    );
}

// ── Progress ────────────────────────────────────────────────────────────────
// One card for where you stand: a bar split by state (claimed, ready to
// claim, still to do) and the same states under it, one line each, as totals.
// A merged PR or a fixed issue counts like any other quest you completed.
// Colours: green is Quest balance you earned, honey is waiting.
// Below this many rewards and quests, a line points to more ways to earn.
const FEW_REWARDS = 40;
// Where a new contributor starts: issues, quests, docs and apps.
const CONTRIBUTING_URL =
    "https://github.com/pollinations/pollinations/blob/main/CONTRIBUTING.md";
// Rows a tab lists before "Show more".
const SECTION_PAGE_SIZE = 10;
const PROGRESS_STATES = {
    claimed: {
        label: "Claimed",
        tone: "bg-tier-soft",
        info: "Quests and contributions you claimed. They're in your balance.",
    },
    ready: {
        label: "Ready to claim",
        tone: "bg-theme-fill",
        info: "Quests and contributions you completed. Claim them below to add them to your balance.",
    },
    open: {
        label: "To do",
        tone: "bg-theme-text-strong/10",
        info: "Quests still open on the board.",
    },
} as const;
type ProgressState = keyof typeof PROGRESS_STATES;
const CARD_STATE: Record<QuestCardStatus, ProgressState> = {
    claimed: "claimed",
    claimable: "ready",
    open: "open",
};
type ProgressPart = { count: number; pollen: number };

function progressOf(cards: QuestCard[]): Record<ProgressState, ProgressPart> {
    const parts: Record<ProgressState, ProgressPart> = {
        claimed: { count: 0, pollen: 0 },
        ready: { count: 0, pollen: 0 },
        open: { count: 0, pollen: 0 },
    };
    for (const card of cards) {
        // A repeatable quest counts each reward it earned, and itself while
        // it is open to earn again.
        for (const repeat of card.repeats ?? []) {
            const part = parts[repeat.claimedAt ? "claimed" : "ready"];
            part.count += 1;
            part.pollen += repeat.pollenAmount;
        }
        if (card.repeats && card.status !== "open") continue;
        const part = parts[CARD_STATE[card.status]];
        part.count += 1;
        part.pollen +=
            (card.status === "open" ? null : card.earnedAmount) ??
            card.reward ??
            0;
    }
    return parts;
}

/** An amount: the sprout and a dollar amount, all in the Quest green.
 *  Rewards still waiting to be claimed have a plus. */
function ProgressPollen({ pollen, ready }: { pollen: number; ready: boolean }) {
    const waiting = ready && pollen > 0;
    return (
        <span className="polli-wallet-text-tier inline-flex items-center gap-1">
            <SproutIcon
                aria-hidden="true"
                className="polli-wallet-text-tier h-3.5 w-3.5 shrink-0"
            />
            {waiting ? "+" : ""}
            {formatRewardAmount(pollen)}
            <span className="sr-only"> in Quest rewards</span>
        </span>
    );
}

export function QuestProgress({
    cards,
}: {
    /** Every quest on the board and every reward earned, without coming-soon
     *  ones. */
    cards: QuestCard[];
}) {
    const parts = progressOf(cards);
    const states = Object.keys(PROGRESS_STATES) as ProgressState[];
    // Count rewards, not cards: a repeatable quest's card holds many rewards.
    const total = states.reduce((sum, state) => sum + parts[state].count, 0);
    const small = total < FEW_REWARDS;
    return (
        <Surface variant="card" className="flex flex-col gap-5 !p-5 sm:!p-6">
            <span
                aria-hidden="true"
                className="flex h-2.5 gap-0.5 overflow-hidden rounded-full"
            >
                {states.map(
                    (state) =>
                        parts[state].count > 0 && (
                            <span
                                key={state}
                                className={`min-w-1.5 ${PROGRESS_STATES[state].tone}`}
                                style={{ flexGrow: parts[state].count }}
                            />
                        ),
                )}
            </span>
            {/* One line per state, like a legend for the bar: label, count,
                Quest balance, with the numbers lined up in columns. */}
            <dl className="grid min-w-0 grid-cols-[auto_auto_auto] items-baseline justify-start gap-x-8 gap-y-2.5">
                <div className="contents text-xs font-semibold text-theme-text-muted">
                    <dt />
                    <dd className="text-right">Quests</dd>
                    <dd className="flex items-center justify-end gap-1.5">
                        Quest balance
                        <InfoTip
                            text="Earned from quests and your apps. Regular models use it before your paid balance."
                            label="About Quest balance"
                        />
                    </dd>
                </div>
                {states.map((state) => {
                    const { label, tone, info } = PROGRESS_STATES[state];
                    return (
                        <div key={state} className="contents">
                            <dt className="flex items-center gap-2 text-sm font-semibold text-theme-text-base">
                                <span
                                    aria-hidden="true"
                                    className={`h-2.5 w-2.5 shrink-0 rounded-full ${tone}`}
                                />
                                {label}
                                <InfoTip
                                    text={info}
                                    label={`${label} information`}
                                />
                            </dt>
                            <dd className="text-right text-xl font-bold leading-none tracking-tight tabular-nums text-theme-text-strong">
                                {/* Just the number: the label names it. */}
                                {parts[state].count}
                            </dd>
                            <dd className="flex justify-end text-sm font-semibold tabular-nums text-theme-text-muted">
                                {/* A quest still to do has no reward yet. */}
                                {state !== "open" && (
                                    <ProgressPollen
                                        pollen={parts[state].pollen}
                                        ready={state === "ready"}
                                    />
                                )}
                            </dd>
                        </div>
                    );
                })}
            </dl>
            <div className="flex flex-col gap-2">
                {small && (
                    // One line under the states; on a phone it may wrap.
                    <p className="flex items-center gap-1.5 text-[13px] leading-snug text-theme-text-muted">
                        <SparkleIcon className="h-3.5 w-3.5 shrink-0" />
                        <span className="sm:whitespace-nowrap">
                            Earn more with{" "}
                            <InlineLink
                                href={CONTRIBUTING_URL}
                                tone="quiet"
                                showIcon={false}
                            >
                                merged PRs
                            </InlineLink>{" "}
                            and fixed bugs
                        </span>
                    </p>
                )}
                <AlphaNote />
            </div>
        </Surface>
    );
}

/** The one footnote: it sits in the Progress card, or under the preview. */
function AlphaNote() {
    return (
        <p className="flex items-start gap-1.5 text-[13px] leading-snug text-theme-text-muted">
            <BeakerIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
                Quests are in alpha. Availability and amounts may change.
            </span>
        </p>
    );
}

function QuestDescription({ children }: { children: string }) {
    return (
        <Markdown
            linkTone="quiet"
            className="inline text-sm text-theme-text-muted [&_em]:text-xs [&_em]:text-theme-text-muted [&_em]:opacity-85 [&_p]:mb-0 [&_p]:inline"
        >
            {children}
        </Markdown>
    );
}

function QuestProgressBar({ progress }: { progress: QuestProgress }) {
    const percentage = Math.min(
        100,
        Math.max(0, (progress.current / progress.target) * 100),
    );
    // Amounts read as dollars; users and days keep their unit.
    const formatValue = (value: number) =>
        progress.unit === "pollen"
            ? `$${formatPollen(value)}`
            : formatCount(value);
    const unit = progress.unit === "pollen" ? null : ` ${progress.unit}`;

    // Nothing done yet: just the count, an empty bar reads as decoration.
    if (progress.current <= 0)
        return (
            <span className="text-xs tabular-nums text-theme-text-muted">
                {formatValue(progress.current)} / {formatValue(progress.target)}
                {unit}
            </span>
        );
    return (
        <div className="mt-1 flex max-w-sm items-center gap-2">
            <div
                role="progressbar"
                aria-label={`${progress.questId} progress`}
                aria-valuemin={0}
                aria-valuemax={progress.target}
                aria-valuenow={Math.min(progress.current, progress.target)}
                className="h-1.5 min-w-24 flex-1 overflow-hidden rounded-full bg-theme-bg-active"
            >
                <div
                    className="h-full rounded-full bg-tier-soft"
                    style={{ width: `${percentage}%` }}
                />
            </div>
            <span className="shrink-0 text-xs tabular-nums text-theme-text-muted">
                {formatValue(progress.current)} / {formatValue(progress.target)}
                {unit}
            </span>
        </div>
    );
}

// Leading marker for a quest row: one icon per state, so the left column
// reads as where you stand. Only a claimable row takes the amber accent;
// the rest follow their title's text colour.
//   open        → target, strong
//   claimable   → sparkle, amber (matches the Claim button)
//   claimed     → check, muted
//   coming soon → clock, muted
function QuestMarker({
    status,
    comingSoon,
    repeatable,
    github,
}: {
    status: QuestCardStatus;
    comingSoon?: boolean;
    /** Earned again and again: the open mark is a stack, like its rewards. */
    repeatable?: boolean;
    /** Won with a pull request that closes its issue: the open mark says so. */
    github?: boolean;
}) {
    const [Icon, tone] = comingSoon
        ? [ClockIcon, "text-theme-text-muted"]
        : status === "open"
          ? [
                repeatable
                    ? LayersIcon
                    : github
                      ? GitPullRequestIcon
                      : TargetIcon,
                "text-theme-text-strong",
            ]
          : status === "claimable"
            ? [SparkleIcon, "text-theme-text-soft"]
            : [CheckIcon, "text-theme-text-muted"];
    return (
        <span
            aria-hidden="true"
            className={`flex h-5 w-5 shrink-0 items-center justify-center ${tone}`}
        >
            <Icon className="h-5 w-5" />
        </span>
    );
}

// A merged PR, a won GitHub quest or a fixed issue shows GitHub's own mark.
const GITHUB_ICONS = [
    ["github:merged_pr:", GitMergeIcon],
    ["github:issue:", IssueClosedIcon],
    ["github:reported_issue:", IssueClosedIcon],
] as const;

/** One reward of a stacked card: what it was for, when, and what it paid. */
function RewardLine({ reward }: { reward: QuestReward }) {
    const github = GITHUB_ICONS.find(([prefix]) =>
        reward.questId?.startsWith(prefix),
    );
    const SourceIcon = github?.[1] ?? ReceiptIcon;
    // GitHub rows start with their number. Saved PR and issue titles read
    // "Merged PR #12: …"; a GitHub quest's is just the issue title.
    const number = reward.questId?.match(/:(\d+)$/)?.[1];
    const title = github
        ? `#${number} ${reward.title.replace(/^[^#]*#\d+: /, "")}`
        : reward.title;
    return (
        <li className="flex items-center gap-1.5">
            <SourceIcon className="h-3.5 w-3.5 shrink-0 text-theme-text-muted" />
            <span
                className="min-w-0 flex-1 truncate text-theme-text-muted"
                title={title}
            >
                {reward.url ? (
                    <InlineLink href={reward.url} tone="quiet" showIcon={false}>
                        {title}
                    </InlineLink>
                ) : (
                    title
                )}
            </span>
            <time
                className="shrink-0 whitespace-nowrap text-theme-text-muted tabular-nums"
                dateTime={reward.earnedAt}
            >
                {new Date(reward.earnedAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                })}
            </time>
            <span
                className={`flex shrink-0 items-center gap-0.5 tabular-nums ${
                    reward.claimedAt
                        ? "text-theme-text-muted"
                        : "font-semibold text-theme-text-strong"
                }`}
            >
                <WalletKindIcon
                    kind={rewardIconKind(reward.balanceBucket)}
                    className="h-3.5 w-3.5"
                />
                {formatRewardAmount(reward.pollenAmount)}
                <span className="sr-only">
                    {reward.claimedAt ? " claimed" : " ready to claim"}
                </span>
            </span>
        </li>
    );
}

/** The viewer's invite link, inside the Invite friends quest. */
function InviteLink({ githubId }: { githubId: number | null }) {
    // The link carries the inviter's GitHub id.
    if (githubId === null) {
        return (
            <Text size="sm" tone="muted">
                <InlineLink href="/account" tone="quiet">
                    Connect GitHub
                </InlineLink>{" "}
                to get your invite link.
            </Text>
        );
    }
    // The catalog's small copy pill, as wide as the link.
    return (
        <div className="w-fit min-w-0 max-w-full">
            <CopyField
                label="Copy invite link"
                value={`${window.location.origin}/?ref=${githubId}`}
                size="sm"
            />
        </div>
    );
}

export function QuestRow({
    card,
    claiming,
    onClaim,
    children,
}: {
    card: QuestCard;
    claiming: boolean;
    onClaim(rewardIds: string[]): void;
    /** What the quest needs at hand, e.g. the invite link; shown in every state. */
    children?: ReactNode;
}) {
    const earned = card.status !== "open";
    const claimed = card.status === "claimed";
    const claimableRewardIds =
        card.status === "claimable" ? card.rewardIds : undefined;
    const [showRewards, setShowRewards] = useState(false);
    // A claimed quest no longer needs its progress bar — the reward is banked,
    // so the "N / N" count is done and just adds noise.
    const progress =
        !card.comingSoon && !claimed && card.progress ? (
            <QuestProgressBar progress={card.progress} />
        ) : null;
    const rewardAmount = earned
        ? (card.earnedAmount ?? card.reward)
        : card.reward;
    const rewardIcon = rewardIconKind(card.balanceBucket);
    // The icon beside the amount names the balance it lands in.
    // formatRewardAmount renders null as "TBD".
    const rewardLabel = formatRewardAmount(rewardAmount);

    // Shared pieces, placed differently per breakpoint below. A claimable
    // title is amber in dark mode, like its icon. In light mode amber text on
    // the cream panel reads weak, so it stays ink and the sparkle and the
    // Claim button carry the amber.
    const title = (
        <Text
            as="span"
            weight="semibold"
            tone={claimed ? "muted" : "strong"}
            className={
                claimableRewardIds
                    ? "[.dark_&]:text-theme-text-soft"
                    : undefined
            }
        >
            {card.title}
            {card.repeats && card.repeats.length > 0 && (
                <>
                    {" "}
                    <button
                        type="button"
                        aria-expanded={showRewards}
                        aria-label={`${card.repeats.length} earned rewards for ${card.title}`}
                        onClick={() => setShowRewards((shown) => !shown)}
                        className="polli-control inline-flex cursor-pointer items-center gap-0.5 whitespace-nowrap text-xs font-normal text-theme-text-muted hover:text-theme-text-strong"
                    >
                        · {card.repeats.length} earned
                        <ChevronIcon expanded={showRewards} />
                    </button>
                </>
            )}
        </Text>
    );
    // Show the "how to" description only while the quest is still open, and
    // on a repeatable quest only until it paid: after that the title, the
    // Claim button or the stack say enough. A GitHub quest has a link to its
    // issue below instead.
    const description =
        card.status === "open" &&
        !card.repeats?.length &&
        card.description &&
        card.issueNumber == null
            ? card.description
            : null;
    // One plain reward in every state, so it holds the same spot on the right;
    // only the bucket icon carries colour, and a claimed reward goes muted grey
    // (raw glyph, so it inherits the muted text colour).
    // A done stacked card shows what it paid into each balance.
    const amounts =
        claimed && card.repeats
            ? (["tier", "paid"] as const).flatMap((kind) => {
                  const sum = card.repeats
                      ?.filter(
                          (repeat) =>
                              rewardIconKind(repeat.balanceBucket) === kind,
                      )
                      .reduce(
                          (total, repeat) => total + repeat.pollenAmount,
                          0,
                      );
                  return sum ? [{ kind, label: formatRewardAmount(sum) }] : [];
              })
            : // A quest that pays a different amount each time shows none.
              card.status === "open" && !card.reward
              ? []
              : [
                    {
                        kind: rewardIcon,
                        // An open repeatable quest pays this again each time.
                        label:
                            card.repeats && card.status === "open"
                                ? `${rewardLabel} each`
                                : rewardLabel,
                    },
                ];
    const rewardChip = card.comingSoon ? (
        <Chip
            intent="neutral"
            size="lg"
            className="gap-1.5 bg-transparent text-theme-text-muted"
        >
            <SparkleIcon className="h-4 w-4 shrink-0" />
            Coming soon
        </Chip>
    ) : (
        <span
            className={`flex items-center gap-3 text-sm font-semibold tabular-nums ${
                claimed ? "text-theme-text-muted" : "text-theme-text-strong"
            }`}
        >
            {amounts.map(({ kind, label }) => (
                <span key={kind} className="flex items-center gap-1">
                    {claimed ? (
                        kind === "paid" ? (
                            <CardIcon className="h-4 w-4 shrink-0" />
                        ) : (
                            <SproutIcon className="h-4 w-4 shrink-0" />
                        )
                    ) : (
                        <WalletKindIcon kind={kind} className="h-4 w-4" />
                    )}
                    {label}
                </span>
            ))}
        </span>
    );
    // A claimable quest's reward becomes the Claim button on the right: the
    // standard action button, "Claim" and its reward on one line.
    const claimButton = claimableRewardIds ? (
        <Button
            type="button"
            intent="commit"
            disabled={claiming}
            onClick={() => onClaim(claimableRewardIds)}
            aria-label={`Claim ${rewardLabel} to your ${rewardIcon === "paid" ? "paid" : "Quest"} balance`}
            className="gap-2 whitespace-nowrap font-bold"
        >
            {claiming ? "Claiming" : "Claim"}
            {rewardChip}
        </Button>
    ) : null;
    // A GitHub quest is its issue: the title says what to build, and the
    // link under it carries the details instead of a description.
    const issueLink =
        card.issueNumber != null && card.url ? (
            <InlineLink
                href={card.url}
                tone="quiet"
                className="w-fit text-sm tabular-nums"
            >
                #{card.issueNumber} on GitHub
            </InlineLink>
        ) : null;
    const details = (description || issueLink || progress) && (
        <div className="flex min-w-0 flex-col gap-1">
            {description && (
                <div className="text-sm text-theme-text-muted [&_.polli-link-external-icon]:!hidden">
                    <QuestDescription>{description}</QuestDescription>
                </div>
            )}
            {issueLink}
            {progress}
        </div>
    );
    const marker = (
        <QuestMarker
            status={card.status}
            comingSoon={card.comingSoon}
            repeatable={card.repeats !== undefined}
            github={card.issueNumber != null}
        />
    );
    const reward = claimButton ?? rewardChip;

    return (
        // Open quests are white cards. One ready to claim is tinted honey, so
        // it stands out without changing shape; the tint is stronger in light
        // mode, where the panel behind is already a warm cream. Done ones keep
        // the card, faded to half: still a row of their own, but settled.
        <Surface
            variant="card"
            className={
                claimableRewardIds
                    ? "!bg-[color-mix(in_oklab,var(--polli-color-fill)_42%,var(--polli-color-surface-opaque))] [.dark_&]:!bg-[color-mix(in_oklab,var(--polli-color-fill)_16%,var(--polli-color-surface-opaque))]"
                    : claimed
                      ? "!bg-[color-mix(in_oklab,var(--polli-color-surface-opaque)_45%,transparent)]"
                      : undefined
            }
        >
            {/* Mobile: the title full width, then the description above the
                reward. */}
            <div className="flex flex-col gap-2 sm:hidden">
                <div className="flex items-center gap-4">
                    {marker}
                    <div className="min-w-0 flex-1">{title}</div>
                </div>
                {/* Indented past the icon, under the title. */}
                <div className="flex flex-col gap-2 pl-9">
                    {details}
                    <div>{reward}</div>
                </div>
            </div>

            {/* Desktop: icon | title and description | reward. */}
            <div className="hidden items-center gap-4 sm:flex">
                <div className="flex items-center">{marker}</div>
                <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
                    <div>{title}</div>
                    {details}
                </div>
                <div className="ml-auto flex shrink-0 items-center">
                    {reward}
                </div>
            </div>
            {/* Drawn once, under both layouts, so a field in it exists once. */}
            {children && <div className="ml-9 mt-2">{children}</div>}
            {showRewards && card.repeats && card.repeats.length > 0 && (
                <ul className="ml-9 mt-2 flex flex-col gap-0.5 text-xs">
                    {card.repeats.map((repeat) => (
                        <RewardLine key={repeat.id} reward={repeat} />
                    ))}
                </ul>
            )}
        </Surface>
    );
}

export const QuestOverview: FC<QuestOverviewProps> = () => {
    const { user, sessionUnavailable } = useLoaderData({ from: "/_dashboard" });
    const [reloads, setReloads] = useState(0);
    return (
        <QuestOverviewContent
            key={`${user?.id ?? "anonymous"}:${reloads}`}
            userId={user?.id ?? null}
            githubId={user?.githubId ?? null}
            sessionUnavailable={sessionUnavailable}
            onRecovered={() => setReloads((count) => count + 1)}
        />
    );
};

function QuestOverviewContent({
    userId,
    githubId,
    sessionUnavailable,
    onRecovered,
}: {
    userId: string | null;
    githubId: number | null;
    sessionUnavailable: boolean;
    /** Rewards are back after an outage skipped the per-user check. */
    onRecovered: () => void;
}) {
    const router = useRouter();
    const [claimError, setClaimError] = useState<string | null>(null);
    const [openTab, setOpenTab] = useState<CategoryKey | null>(null);
    const [expandedTabs, setExpandedTabs] = useState<CategoryKey[]>([]);
    const [state, setState] = useState<FetchState>({
        ...INITIAL_STATE,
        anonymous: userId === null,
    });
    // Guards the auto-check so React 18 StrictMode's double-mount fires it once.
    const autoCheckedRef = useRef(false);
    // Claims, a redeemed code and the quest check reload the same data and
    // can overlap. A reload applies unless a newer one already has; one that
    // fails applies nothing, so an older success still lands. Others: null.
    const reloadRef = useRef(0);
    const appliedReloadRef = useRef(0);
    async function reloadQuestData(): Promise<QuestData | null> {
        const reload = ++reloadRef.current;
        const questData = await loadQuestData();
        if (reload < appliedReloadRef.current) return null;
        appliedReloadRef.current = reload;
        return questData;
    }
    // Logged-out visitors see a preview: every quest shown open (so all
    // descriptions render) and the off-board/unearned visibility filter
    // relaxed, since there is no per-user progress to gate on.
    const previewAll = state.anonymous;

    // On open: load saved quest data from D1, THEN run one
    // automatic quest check (slow GitHub + Tinybird fan-out) and refresh. There
    // is no manual button — quests check themselves when the page opens. The
    // whole flow is inlined here (not a separate callback) so the mount-only
    // effect has a stable, empty dependency list.
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const questData = await loadQuestData();
                if (cancelled) return;
                setState({
                    ...questData,
                    progress: [],
                    loading: false,
                    // Flag the auto-check as in-flight so the indicator shows
                    // straight after the initial render, with no idle flash.
                    // Anonymous visitors run no check (it would 401), so don't
                    // show the indicator for them.
                    checking: !questData.anonymous,
                    error: null,
                    claimingRewardIds: [],
                });
                // No per-user check for logged-out visitors — the catalog
                // preview is all they get.
                if (questData.anonymous) return;
            } catch (error) {
                if (cancelled) return;
                setState({
                    ...INITIAL_STATE,
                    loading: false,
                    error:
                        error instanceof Error
                            ? error.message
                            : "Failed to load quests",
                });
                return;
            }

            // StrictMode double-mounts the effect; run the check at most once.
            if (cancelled || autoCheckedRef.current) return;
            autoCheckedRef.current = true;

            // The automatic check is best-effort: a 429 (per-user throttle still
            // warm) or any failure leaves the already-loaded quests intact and
            // does NOT surface a red error — the cached data is still valid.
            try {
                const response = await accountClient.quests.check.$post();
                if (cancelled) return;
                if (response.ok) {
                    const checkResult =
                        (await response.json()) as QuestCheckResult;
                    const refreshed = await reloadQuestData();
                    if (cancelled) return;
                    setState((current) => ({
                        ...current,
                        ...refreshed,
                        progress: checkResult.progress,
                        checking: false,
                        loading: false,
                        error: null,
                    }));
                    window.dispatchEvent(new Event(QUEST_STATUS_UPDATED_EVENT));
                    return;
                }
                // Not ok (throttled or failed) — just stop the indicator.
                setState((current) => ({ ...current, checking: false }));
            } catch {
                if (cancelled) return;
                setState((current) => ({ ...current, checking: false }));
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    async function handleClaimRewards(rewardIds: string[]): Promise<void> {
        setClaimError(null);
        setState((current) => ({
            ...current,
            claimingRewardIds: [...current.claimingRewardIds, ...rewardIds],
        }));

        try {
            try {
                for (const rewardId of rewardIds) {
                    const response = await accountClient.quests.rewards[
                        ":rewardId"
                    ].claim.$post({
                        param: { rewardId },
                    });
                    if (!response.ok) {
                        throw new Error(
                            "Couldn’t claim the reward. Please try again.",
                        );
                    }
                }
            } finally {
                // Also after a failure part way: show what was credited.
                void router.invalidate({
                    filter: (match) => match.routeId === "/_dashboard",
                });
                const questData = await reloadQuestData();
                setState((current) => ({
                    ...current,
                    ...questData,
                    claimingRewardIds: current.claimingRewardIds.filter(
                        (id) => !rewardIds.includes(id),
                    ),
                }));
                window.dispatchEvent(new Event(QUEST_STATUS_UPDATED_EVENT));
            }
        } catch (error) {
            setState((current) => ({
                ...current,
                claimingRewardIds: current.claimingRewardIds.filter(
                    (id) => !rewardIds.includes(id),
                ),
            }));
            setClaimError(
                error instanceof Error
                    ? error.message
                    : "Couldn’t claim the reward. Please try again.",
            );
        }
    }

    async function refreshRewards(): Promise<void> {
        void router.invalidate({
            filter: (match) => match.routeId === "/_dashboard",
        });
        const questData = await reloadQuestData();
        // A newer reload is already on its way.
        if (!questData) return;
        // Reload once so the check the outage skipped runs, as on a visit.
        if (!questData.anonymous && !autoCheckedRef.current) {
            onRecovered();
            return;
        }
        setState((current) => ({ ...current, ...questData, error: null }));
        window.dispatchEvent(new Event(QUEST_STATUS_UPDATED_EVENT));
    }

    // A reward's questId IS the catalog id it earned (one reward == one quest),
    // so the earned-set / reward lookup key directly off questId.
    const rewardedCatalogIds = useMemo(
        () =>
            new Set(
                state.rewards
                    .map((reward) => cardIdOf(reward.questId))
                    .filter((id): id is string => id != null),
            ),
        [state.rewards],
    );
    const rewardByKey = useMemo(() => {
        const map = new Map<string, QuestReward>();
        for (const reward of state.rewards) {
            if (reward.questId) map.set(reward.questId, reward);
        }
        return map;
    }, [state.rewards]);
    // Build the per-category quest rows from the catalog — ONE uniform pass, no
    // per-lane special-casing. The catalog is the single source of truth: every
    // quest (onboarding, GitHub, issue bounty, easter egg) is one card. Rewards
    // only tell us "did YOU earn it" + whether it has been claimed.
    const sections = useMemo(() => {
        const progressByQuestId = new Map(
            state.progress.map((progress) => [progress.questId, progress]),
        );
        const byCat: Record<CategoryKey, QuestCard[]> = {
            setup: [],
            grow: [],
            contribute: [],
            community: [],
        };

        for (const quest of [
            ...state.catalog,
            OTHER_CONTRIBUTIONS,
            // Codes need an account, so the logged-out preview has no field.
            ...(previewAll ? [] : [EVENT_CODES]),
        ]) {
            // A repeatable quest keeps all its rewards on its card. One Claim
            // takes every waiting reward of the next one's balance. With none
            // waiting, it stays open while the quest is on the board, so it
            // reads as something to do again; off the board it rests.
            const repeats = quest.repeatable
                ? state.rewards.filter(
                      (reward) => cardIdOf(reward.questId) === quest.id,
                  )
                : undefined;
            const next = repeats?.find((repeat) => !repeat.claimedAt);
            const waiting = repeats?.filter(
                (repeat) =>
                    !repeat.claimedAt &&
                    repeat.balanceBucket === next?.balanceBucket,
            );
            const reward = repeats
                ? (next ??
                  (quest.state === "available" ? undefined : repeats[0]))
                : rewardByKey.get(quest.id);
            const earned = rewardedCatalogIds.has(quest.id);
            const comingSoon = quest.state === "coming_soon";
            // A GitHub quest you won sits in the pull request stack instead.
            if (
                quest.id.startsWith("github:issue:") &&
                rewardByKey.has(quest.id)
            )
                continue;
            // Visibility rule:
            //  - "coming_soon" always shows (at the bottom of its lane, in the
            //    receded style with a clock + "Coming soon" — see QuestRow).
            //  - Logged out (previewAll): otherwise show only "available".
            //  - Logged in: show "available" OR anything YOU earned.
            if (!comingSoon) {
                if (previewAll) {
                    if (quest.state !== "available") continue;
                } else if (quest.state !== "available" && !earned) {
                    continue;
                }
            }

            byCat[quest.category].push({
                key: quest.id,
                rewardIds: waiting?.length
                    ? waiting.map((repeat) => repeat.id)
                    : reward && [reward.id],
                title: quest.title,
                description: quest.description || undefined,
                url: quest.url || undefined,
                issueNumber: issueNumberFromId(quest.id) ?? undefined,
                reward: quest.rewardAmount,
                balanceBucket:
                    reward?.balanceBucket ?? quest.balanceBucket ?? "tier",
                status: deriveCardStatus(comingSoon, previewAll, reward),
                // A repeatable card shows what one Claim pays now.
                earnedAmount: repeats
                    ? waiting?.reduce(
                          (sum, repeat) => sum + repeat.pollenAmount,
                          0,
                      )
                    : reward?.pollenAmount,
                progress:
                    reward && quest.goal
                        ? {
                              questId: quest.id,
                              current: quest.goal.target,
                              ...quest.goal,
                          }
                        : progressByQuestId.get(quest.id),
                comingSoon,
                repeats,
            });
        }

        // A reward with no card of its own (a quest that left the catalog)
        // is a row of its quest's lane, else of Contribute.
        const catalog = new Map(
            [...state.catalog, OTHER_CONTRIBUTIONS, EVENT_CODES].map(
                (quest) => [quest.id, quest],
            ),
        );
        for (const reward of state.rewards) {
            const quest = catalog.get(cardIdOf(reward.questId) ?? "");
            if (
                quest?.repeatable ||
                rewardByKey.get(quest?.id ?? "") === reward
            )
                continue;
            byCat[quest?.category ?? "contribute"].push({
                key: reward.id,
                rewardIds: [reward.id],
                title: reward.title,
                url: reward.url ?? undefined,
                issueNumber: githubNumberFromUrl(reward.url) ?? undefined,
                reward: reward.pollenAmount,
                balanceBucket: reward.balanceBucket,
                status: reward.claimedAt ? "claimed" : "claimable",
                earnedAmount: reward.pollenAmount,
            });
        }

        // Order per lane by lifecycle rank only: a claim moves its own row and
        // nothing else; within a rank the catalog's order stays (stable sort).
        for (const key of Object.keys(byCat) as CategoryKey[]) {
            byCat[key].sort((a, b) => cardSortRank(a) - cardSortRank(b));
        }
        return byCat;
    }, [
        state.catalog,
        state.progress,
        state.rewards,
        rewardedCatalogIds,
        rewardByKey,
        previewAll,
    ]);

    // Logged-out totals show what the public catalog offers, not an owned balance.
    const previewTotals = useMemo(() => {
        let count = 0;
        let pollen = 0;
        for (const cards of Object.values(sections)) {
            for (const card of cards) {
                if (card.comingSoon || card.reward == null) continue;
                count += 1;
                pollen += card.reward;
            }
        }
        return { count, pollen };
    }, [sections]);

    // Quests the viewer can still earn, for the leaderboard's "next step" line.
    const openQuests = useMemo(
        () =>
            Object.values(sections)
                .flat()
                .filter(
                    (card) =>
                        // A repeatable quest can always be earned again.
                        (card.status === "open" || card.repeats) &&
                        !card.comingSoon &&
                        (card.reward ?? 0) > 0,
                )
                .map((card) => ({
                    title: card.title,
                    reward: card.reward ?? 0,
                    // Where the quest is done: its own link, else the first
                    // link in its description ("Create an API [key](/keys).").
                    href:
                        card.url ??
                        card.description?.match(/\]\(([^)\s]+)\)/)?.[1],
                })),
        [sections],
    );

    const initialError =
        state.catalog.length === 0 && state.rewards.length === 0
            ? state.error
            : null;
    const showSummary = !initialError;
    // During an outage the list still loads, but a possibly signed-in user's
    // rewards and the standings don't: say so instead of showing 0 progress.
    const rewardsDown = useOutage(["/account/quests/rewards"]);
    const standingsDown = useOutage(["/api/quests/standings"]);
    const progressUnavailable =
        rewardsDown &&
        state.anonymous &&
        (sessionUnavailable || userId !== null);
    const standingsUnavailable =
        standingsDown && !state.loading && !state.standings;
    // A failed first load retries through its own LoadError instead.
    useOutageRetry(
        (progressUnavailable || standingsUnavailable) && !state.error,
        "quests",
        refreshRewards,
    );

    // One tab per lane that has rows.
    const tabs = CATEGORIES.map(({ key, label }) => ({
        key,
        label,
        cards: sections[key],
    })).filter((tab) => tab.cards.length > 0);
    // Open the tab picked, else the first with a reward to claim.
    const defaultTab =
        tabs.find((tab) =>
            tab.cards.some((card) => card.status === "claimable"),
        ) ?? tabs[0];
    const activeTab = tabs.find((tab) => tab.key === openTab) ?? defaultTab;
    const expanded = activeTab && expandedTabs.includes(activeTab.key);
    // Pin that default once the quests load, so a claim or the quest check
    // can't move the view to another tab under the reader.
    const defaultTabKey = defaultTab?.key;
    useEffect(() => {
        if (!state.loading && openTab === null && defaultTabKey) {
            setOpenTab(defaultTabKey);
        }
    }, [state.loading, openTab, defaultTabKey]);

    return (
        <>
            {/* Your quests in one card: where you stand at the top, then one
                tab per kind of quest. The per-user accounting is hidden for
                logged-out visitors, who see what the catalog offers. */}
            <Section
                title={state.anonymous ? "What you can earn" : "Progress"}
                action={
                    state.checking && (
                        <LoadingStatus>Checking quests…</LoadingStatus>
                    )
                }
            >
                <SectionContent
                    loading={state.loading}
                    className="h-22 sm:h-28"
                >
                    {state.error && (
                        <LoadError
                            onRetry={refreshRewards}
                            paths={[
                                "/api/quests/catalog",
                                "/account/quests/rewards",
                            ]}
                        >
                            {state.error}
                        </LoadError>
                    )}
                    {progressUnavailable && <OutageNotice retrying />}
                    {showSummary && !state.anonymous && (
                        <QuestProgress
                            cards={Object.values(sections)
                                .flat()
                                .filter((card) => !card.comingSoon)}
                        />
                    )}
                    {/* The preview counts available quests and their possible rewards. */}
                    {showSummary && state.anonymous && (
                        <QuestPreview
                            quests={previewTotals.count}
                            pollen={previewTotals.pollen}
                        />
                    )}
                </SectionContent>
                {!state.loading && activeTab && (
                    <>
                        <div className="flex flex-wrap gap-1.5">
                            {tabs.map((tab) => {
                                // Coming-soon rows count neither as done nor
                                // in the total.
                                const live = tab.cards.filter(
                                    (card) => !card.comingSoon,
                                );
                                // A repeatable quest stays open, but counts
                                // once it paid.
                                const done = live.filter(
                                    (card) =>
                                        card.status !== "open" ||
                                        card.repeats?.length,
                                ).length;
                                return (
                                    <TabButton
                                        key={tab.key}
                                        active={tab.key === activeTab.key}
                                        onClick={() => setOpenTab(tab.key)}
                                        ariaLabel={tab.label}
                                        detail={
                                            initialError || progressUnavailable
                                                ? undefined
                                                : `${done}/${live.length}`
                                        }
                                    >
                                        {tab.label}
                                    </TabButton>
                                );
                            })}
                        </div>
                        {claimError && (
                            <Alert intent="danger">{claimError}</Alert>
                        )}
                        <div className="flex flex-col gap-2">
                            {(expanded
                                ? activeTab.cards
                                : activeTab.cards.slice(0, SECTION_PAGE_SIZE)
                            ).map((card) => (
                                <QuestRow
                                    key={card.key}
                                    card={card}
                                    claiming={
                                        card.rewardIds?.some((id) =>
                                            state.claimingRewardIds.includes(
                                                id,
                                            ),
                                        ) ?? false
                                    }
                                    onClaim={handleClaimRewards}
                                >
                                    {card.key === "invite_friends" &&
                                        !state.anonymous && (
                                            <InviteLink githubId={githubId} />
                                        )}
                                    {card.key === EVENT_CODES.id && (
                                        <RedeemCode
                                            onRedeemed={() =>
                                                void refreshRewards()
                                            }
                                        />
                                    )}
                                </QuestRow>
                            ))}
                        </div>
                        {!expanded &&
                            activeTab.cards.length > SECTION_PAGE_SIZE && (
                                <div
                                    data-theme="neutral"
                                    className="flex justify-center"
                                >
                                    <Button
                                        size="sm"
                                        onClick={() =>
                                            setExpandedTabs((keys) => [
                                                ...keys,
                                                activeTab.key,
                                            ])
                                        }
                                    >
                                        Show more
                                    </Button>
                                </div>
                            )}
                    </>
                )}
                {/* The Progress card carries it for signed-in visitors. */}
                {(state.anonymous || !showSummary) && <AlphaNote />}
            </Section>

            {/* This month's race: about everyone, so a card of its own. */}
            {(state.standings || state.loading || standingsUnavailable) && (
                <Section title="Leaderboard">
                    {state.standings ? (
                        <QuestStandings
                            standings={state.standings}
                            openQuests={openQuests}
                        />
                    ) : state.loading ? (
                        <CardLoading className="h-49.5 sm:h-50.5" />
                    ) : (
                        <OutageNotice retrying />
                    )}
                </Section>
            )}
        </>
    );
}
