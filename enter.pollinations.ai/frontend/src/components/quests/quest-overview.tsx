import {
    BeakerIcon,
    Button,
    CardIcon,
    CheckIcon,
    Chip,
    ClockIcon,
    DiscordIcon,
    GitHubIcon,
    InlineLink,
    Markdown,
    RocketIcon,
    SearchIcon,
    Section,
    SparkleIcon,
    SproutIcon,
    Surface,
    TargetIcon,
    TerminalIcon,
    Text,
    TrendUpIcon,
} from "@pollinations/ui";
import { formatPollen } from "@pollinations/ui/wallet";
import {
    type ComponentType,
    type FC,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { apiClient } from "../../api.ts";
import type {
    QuestCatalogItem,
    QuestCatalogResponse,
} from "../../backend-types.ts";

type QuestReward = {
    id: string;
    questId: string | null;
    title: string;
    pollenAmount: number;
    balanceBucket: string;
    earnedAt: string;
    claimedAt: string | null;
};

type QuestOverviewProps = Record<string, never>;

type FetchState = {
    catalog: QuestCatalogItem[];
    rewards: QuestReward[];
    loading: boolean;
    checking: boolean;
    error: string | null;
    claimingRewardId: string | null;
    // Anonymous (logged-out) visitors get the public catalog only — the
    // per-user rewards endpoint 401s, so there is nothing to claim and every
    // quest is rendered open as a "here's what you can earn" preview.
    anonymous: boolean;
};

const INITIAL_STATE: FetchState = {
    catalog: [],
    rewards: [],
    loading: true,
    checking: false,
    error: null,
    claimingRewardId: null,
    anonymous: false,
};

type IconComponent = ComponentType<{ className?: string }>;
type RewardIconKind = "paid" | "tier";

// ── Category model ──────────────────────────────────────────────────────────
// One lane per backend quest.category, mapped 1:1. The source group that found
// a quest is intentionally separate from the category that organizes it.
type CategoryKey = QuestCatalogItem["category"];

type CategoryMeta = {
    key: CategoryKey;
    label: string;
    icon: IconComponent;
};

const CATEGORIES: CategoryMeta[] = [
    {
        key: "setup",
        label: "Setup",
        icon: RocketIcon,
    },
    {
        key: "grow",
        label: "Grow",
        icon: TrendUpIcon,
    },
    {
        key: "build",
        label: "Build",
        icon: TerminalIcon,
    },
    {
        key: "contribute",
        label: "Contribute",
        icon: GitHubIcon,
    },
    {
        key: "community",
        label: "Community",
        icon: DiscordIcon,
    },
    {
        key: "easteregg",
        label: "Easter eggs",
        icon: SproutIcon,
    },
];

function issueNumberFromId(id: string): number | null {
    const match = /^github:issue:(\d+)$/.exec(id);
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
        case "claimable":
            return 0;
        case "claimed":
            return 1;
        default:
            return 2;
    }
}

// ── Formatting helpers ──────────────────────────────────────────────────────
function formatRewardAmount(value: number | null): string {
    if (value == null) return "TBD";
    const formatted = formatPollen(value);
    if (value > 0 && formatted === "0") return "<0.0001";
    return formatted;
}

function rewardIconKind(
    balanceBucket: string | null | undefined,
): RewardIconKind {
    return balanceBucket === "paid" || balanceBucket === "pack"
        ? "paid"
        : "tier";
}

type QuestData = Pick<FetchState, "catalog" | "rewards" | "anonymous">;

async function loadQuestData(): Promise<QuestData> {
    // The catalog is public; the per-user rewards endpoint requires auth. A
    // logged-out visitor still gets the full catalog (rendered all-open as a
    // preview), so a 401 on rewards is expected, not an error.
    const [catalogResponse, rewardsResponse] = await Promise.all([
        apiClient.quests.catalog.$get(),
        apiClient.quests.rewards.$get(),
    ]);
    if (!catalogResponse.ok) {
        throw new Error(`Failed to load quests (${catalogResponse.status})`);
    }
    const catalog = (await catalogResponse.json()) as QuestCatalogResponse;

    const anonymous = rewardsResponse.status === 401;
    if (!rewardsResponse.ok && !anonymous) {
        throw new Error(`Failed to load quests (${rewardsResponse.status})`);
    }
    const rewards = anonymous
        ? []
        : ((await rewardsResponse.json()) as { rewards: QuestReward[] })
              .rewards;

    return {
        catalog: catalog.quests ?? [],
        rewards: rewards ?? [],
        anonymous,
    };
}

// ── Card model ──────────────────────────────────────────────────────────────
// A single quest row. Open shows the possible reward; claimable means the reward
// exists but has not moved into the balance; claimed means pollen was deposited.
export type QuestCardStatus = "open" | "claimable" | "claimed";

export type QuestCard = {
    key: string;
    rewardId?: string;
    title: string;
    description?: string;
    url?: string;
    issueNumber?: number;
    reward: number | null;
    balanceBucket?: string | null;
    status: QuestCardStatus;
    earnedAmount?: number | null;
    // coming_soon quests render at the bottom of their lane in the receded
    // (claimed) style, with a clock + "Coming soon" in place of the reward.
    comingSoon?: boolean;
};

// ── Presentational primitives (composed from @pollinations/ui) ───────────────

// Soft bucket-colored tile for the reward chip — amber (paid) / green (tier),
// so the row's reward badge carries the bucket identity.
const BUCKET_CHIP_CLASS: Record<RewardIconKind, string> = {
    paid: "polli-wallet-chip-paid",
    tier: "polli-wallet-chip-tier",
};

// A single bucket-coloured tile — wallet-style well in the bucket's pale hue,
// hosting one number (and, for pollen values, the bucket badge that tells you
// it IS pollen without spelling the word). One of four in the summary 2×2.
export function BucketCard({
    kind,
    value,
    showBadge,
}: {
    kind: RewardIconKind;
    value: React.ReactNode;
    showBadge?: boolean;
}) {
    const panelClass =
        kind === "paid" ? "polli-wallet-panel-paid" : "polli-wallet-panel-tier";
    const BadgeIcon = kind === "paid" ? CardIcon : SproutIcon;
    return (
        <div
            className={`flex items-center justify-center rounded-xl py-4 sm:py-5 ${panelClass}`}
        >
            <span className="flex items-center gap-1.5 text-3xl font-bold leading-none tracking-tight tabular-nums sm:gap-2 sm:text-5xl">
                {showBadge && (
                    <BadgeIcon className="h-7 w-7 shrink-0 sm:h-10 sm:w-10" />
                )}
                {value}
            </span>
        </div>
    );
}

// A bucket-agnostic total — one neutral well, used when paid/tier split would
// be noise rather than signal (e.g. quest counts are all "a quest"). Uses
// Surface card so the bg + well shadow match the Setup/quest rows exactly. The
// glyph defaults to the sparkle; pass `icon` (and an `iconClassName` tint) to
// label a different metric — e.g. a green sprout for the logged-out pollen
// total, which must read as "on offer", never as an owned (green-well) balance.
export function TotalCard({
    value,
    icon: Icon = SparkleIcon,
    iconClassName,
}: {
    value: React.ReactNode;
    icon?: IconComponent;
    iconClassName?: string;
}) {
    return (
        <Surface
            variant="card"
            className="flex items-center justify-center py-4 sm:py-5"
        >
            <span className="flex items-center gap-1.5 text-3xl font-bold leading-none tracking-tight tabular-nums text-theme-text-base sm:gap-2 sm:text-5xl">
                <Icon
                    className={`h-7 w-7 shrink-0 sm:h-10 sm:w-10 ${iconClassName ?? ""}`}
                />
                {value}
            </span>
        </Surface>
    );
}

// The summary card frame shared by the logged-in view (your completed quests +
// claimed pollen) and the logged-out preview (quests + pollen on offer). One
// layout, two callers: the caller supplies the already-styled pollen card
// node(s) — green/amber owned wells when logged in, neutral tiles when logged
// out — and this only positions them.
//
// We only ever render two or three cards (count + 1 or 2 pollen buckets):
//   • two   → one row, side by side, at every width.
//   • three → three across once the container is wide enough (@lg); below that,
//     the count takes a full-width row and the pollen pair folds underneath.
// Width-driven via a container query (not the viewport) because the panel is
// narrower than the screen when the sidebar is open.
function QuestSummaryGrid({
    totalLabel,
    totalValue,
    pollenLabel,
    pollenCards,
}: {
    totalLabel: string;
    totalValue: React.ReactNode;
    pollenLabel: string;
    pollenCards: { key: string; node: React.ReactNode }[];
}) {
    const header = (label: string, className: string) => (
        <Text
            as="span"
            size="sm"
            weight="bold"
            tone="muted"
            className={`uppercase tracking-wide ${className}`}
        >
            {label}
        </Text>
    );
    const totalCard = <TotalCard value={totalValue} />;

    // No pollen on offer at all → just the count (kept for safety; in practice
    // there is always at least the tier bucket).
    if (pollenCards.length === 0) {
        return (
            <div className="flex flex-col gap-2">
                {header(totalLabel, "")}
                <div className="sm:w-1/3">{totalCard}</div>
            </div>
        );
    }

    // Two cards (count + one pollen bucket) → one row, side by side, any width.
    if (pollenCards.length === 1) {
        return (
            <div className="grid grid-cols-2 gap-x-2 gap-y-2">
                {header(totalLabel, "col-span-1")}
                {header(pollenLabel, "col-span-1")}
                <div className="col-span-1">{totalCard}</div>
                <div className="col-span-1">{pollenCards[0].node}</div>
            </div>
        );
    }

    // Three cards (count + tier + paid) → three across when the container is
    // wide enough; otherwise the count spans a full row and the pollen pair
    // sits side by side beneath it.
    return (
        <div className="@container">
            <div className="grid grid-cols-2 gap-x-2 gap-y-2 @lg:grid-cols-3">
                {header(
                    totalLabel,
                    "col-span-2 @lg:col-span-1 @lg:col-start-1 @lg:row-start-1",
                )}
                <div className="col-span-2 @lg:col-span-1 @lg:col-start-1 @lg:row-start-2">
                    {totalCard}
                </div>
                {header(
                    pollenLabel,
                    "col-span-2 @lg:col-span-2 @lg:col-start-2 @lg:row-start-1",
                )}
                {pollenCards.map((card, i) => (
                    <div
                        key={card.key}
                        className={`${i === 1 ? "@lg:col-start-3" : "@lg:col-start-2"} @lg:row-start-2`}
                    >
                        {card.node}
                    </div>
                ))}
            </div>
        </div>
    );
}

function QuestDescription({ children }: { children: string }) {
    return (
        <Markdown className="inline text-sm text-theme-text-muted [&_p]:mb-0 [&_p]:inline">
            {children}
        </Markdown>
    );
}

// Leading marker for a quest row, by lifecycle stage:
//   open      → ambient theme tile + section icon (vanilla amber — the row's
//                bucket lives on the reward chip; the marker is just "do this")
//   claimable → muted theme well + check (works in light and dark — receded
//                relative to the open tile, but readable on either surface)
//   claimed   → no tile, muted check (banked already, fully receded)
function QuestMarker({
    icon: Icon,
    status,
    comingSoon,
}: {
    icon: IconComponent;
    status: QuestCardStatus;
    comingSoon?: boolean;
}) {
    // coming_soon → clock; open → the lane's section icon; otherwise the
    // earned/banked check.
    function resolveIcon(): IconComponent {
        if (comingSoon) return ClockIcon;
        if (status === "open") return Icon;
        return CheckIcon;
    }
    // open → ambient active tile; claimable → muted well; claimed (and
    // coming_soon, which always renders claimed) → no tile, muted glyph.
    function resolveTile(): string {
        if (!comingSoon && status === "open")
            return "bg-theme-bg-active text-theme-text-strong";
        if (status === "claimable")
            return "bg-theme-bg-subtle text-theme-text-muted";
        return "text-theme-text-muted";
    }
    const MarkerIcon = resolveIcon();
    const tile = resolveTile();
    return (
        <span
            aria-hidden="true"
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${tile}`}
        >
            <MarkerIcon className="h-5 w-5" />
        </span>
    );
}

export function QuestRow({
    card,
    icon,
    claiming,
    onClaim,
}: {
    card: QuestCard;
    icon: IconComponent;
    claiming: boolean;
    onClaim(rewardId: string): void;
}) {
    const earned = card.status !== "open";
    const claimed = card.status === "claimed";
    const claimableRewardId =
        card.status === "claimable" ? card.rewardId : undefined;
    const rewardAmount = earned
        ? (card.earnedAmount ?? card.reward)
        : card.reward;
    const rewardIcon = rewardIconKind(card.balanceBucket);
    // The icon next to the number IS the "this is pollen" signal, so the word
    // "pollen" would just repeat it. formatRewardAmount renders null as "TBD".
    const rewardLabel = formatRewardAmount(rewardAmount);

    // Shared pieces, placed differently per breakpoint below.
    const title = (
        <Text as="span" weight="semibold" tone={claimed ? "muted" : "strong"}>
            {card.title}
        </Text>
    );
    // Show the "how to" description while the quest is actionable (open or
    // claimable); drop it only once it's done: claimed, or coming_soon (which
    // also derives to "claimed").
    const description =
        card.status !== "claimed" && card.description ? card.description : null;
    const issueLink =
        card.issueNumber != null && card.url ? (
            <InlineLink
                href={card.url}
                showIcon={false}
                className="text-sm tabular-nums"
            >
                #{card.issueNumber}
            </InlineLink>
        ) : null;
    // One reward badge in every state, so it holds the same spot on the right —
    // only its emphasis shifts. Open/claimable show the live bucket chip;
    // claimed recedes to a transparent, muted-grey badge (no fill, no sign),
    // so the badge never jumps when a quest is claimed. Raw glyph (not
    // WalletKindIcon) so the icon inherits the chip's currentColor — bucket
    // deep when open, muted grey when claimed — instead of being forced to
    // the bucket hue regardless of state.
    const RewardKindIcon = rewardIcon === "paid" ? CardIcon : SproutIcon;
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
        <Chip
            intent="neutral"
            size="lg"
            className={`gap-1.5 tabular-nums ${
                claimed
                    ? "bg-transparent text-theme-text-muted"
                    : BUCKET_CHIP_CLASS[rewardIcon]
            }`}
        >
            <RewardKindIcon className="h-4 w-4 shrink-0" />
            {rewardLabel}
        </Chip>
    );
    const claimButton = claimableRewardId ? (
        <Button
            type="button"
            disabled={claiming}
            onClick={() => onClaim(claimableRewardId)}
            className="gap-1.5"
        >
            <SparkleIcon className="h-4 w-4 shrink-0" />
            {claiming ? "Claiming" : "Claim"}
        </Button>
    ) : null;
    // Both layouts place the claim button and reward chip separately: claim
    // beside the text, chip pinned to the right edge (ml-auto).

    return (
        <Surface variant="card">
            {/* Mobile: stacked. Icon centered with the (wrappable) title; the
                description (issue link at its end) full-width below; action row
                last, mirroring desktop — Claim on the left, reward chip pinned
                right. */}
            <div className="flex flex-col gap-3 sm:hidden">
                <div className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-4">
                        <QuestMarker
                            icon={icon}
                            status={card.status}
                            comingSoon={card.comingSoon}
                        />
                        <div className="min-w-0 flex-1">{title}</div>
                    </div>
                    {(description || issueLink) && (
                        <div className="text-sm text-theme-text-muted">
                            {description && (
                                <QuestDescription>
                                    {description}
                                </QuestDescription>
                            )}
                            {description && issueLink ? " " : null}
                            {issueLink}
                        </div>
                    )}
                </div>
                <div className="flex items-center gap-2.5">
                    {claimButton}
                    <div className="ml-auto flex items-center gap-2.5">
                        {rewardChip}
                    </div>
                </div>
            </div>

            {/* Desktop: icon | content (title + description, with the issue link
                at the end of the description) | claim | reward. The content is
                sized to its text (no flex-1), so the claim button sits right
                beside it; the reward chip is pushed to the far-right edge with
                ml-auto so amounts line up in a column. Keeps the card to two
                text rows. */}
            <div className="hidden items-center gap-4 sm:flex">
                <QuestMarker
                    icon={icon}
                    status={card.status}
                    comingSoon={card.comingSoon}
                />
                <div className="flex min-w-0 flex-col gap-1">
                    <div>{title}</div>
                    {(description || issueLink) && (
                        <div className="text-sm text-theme-text-muted">
                            {description && (
                                <QuestDescription>
                                    {description}
                                </QuestDescription>
                            )}
                            {description && issueLink ? " " : null}
                            {issueLink}
                        </div>
                    )}
                </div>
                {claimButton}
                <div className="ml-auto flex shrink-0 items-center gap-2.5">
                    {rewardChip}
                </div>
            </div>
        </Surface>
    );
}

export const QuestOverview: FC<QuestOverviewProps> = () => {
    const [state, setState] = useState<FetchState>(INITIAL_STATE);
    // Guards the auto-check so React 18 StrictMode's double-mount fires it once.
    const autoCheckedRef = useRef(false);
    // Logged-out visitors see a preview: every quest shown open (so all
    // descriptions render) and the off-board/unearned visibility filter
    // relaxed, since there is no per-user progress to gate on.
    const previewAll = state.anonymous;

    // On open: render cached quest data immediately (fast D1 read), THEN run one
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
                    loading: false,
                    // Flag the auto-check as in-flight so the indicator shows
                    // straight after the initial render, with no idle flash.
                    // Anonymous visitors run no check (it would 401), so don't
                    // show the indicator for them.
                    checking: !questData.anonymous,
                    error: null,
                    claimingRewardId: null,
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
                const response = await apiClient.quests.check.$post();
                if (cancelled) return;
                if (response.ok) {
                    const refreshed = await loadQuestData();
                    if (cancelled) return;
                    setState((current) => ({
                        ...current,
                        ...refreshed,
                        checking: false,
                        loading: false,
                        error: null,
                    }));
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

    async function handleClaimReward(rewardId: string): Promise<void> {
        setState((current) => ({
            ...current,
            claimingRewardId: rewardId,
            error: null,
        }));

        try {
            const response = await apiClient.quests.rewards[
                ":rewardId"
            ].claim.$post({
                param: { rewardId },
            });
            if (!response.ok) {
                throw new Error(`Failed to claim reward (${response.status})`);
            }
            const questData = await loadQuestData();
            setState((current) => ({
                ...current,
                ...questData,
                claimingRewardId: null,
                checking: false,
                loading: false,
                error: null,
            }));
        } catch (error) {
            setState((current) => ({
                ...current,
                claimingRewardId: null,
                error:
                    error instanceof Error
                        ? error.message
                        : "Failed to claim reward",
            }));
        }
    }

    // A reward's questId IS the catalog id it earned (one reward == one quest),
    // so the earned-set / reward lookup key directly off questId.
    const rewardedCatalogIds = useMemo(
        () =>
            new Set(
                state.rewards
                    .map((reward) => reward.questId)
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
        const byCat: Record<CategoryKey, QuestCard[]> = {
            setup: [],
            grow: [],
            build: [],
            contribute: [],
            community: [],
            easteregg: [],
        };

        for (const quest of state.catalog) {
            const reward = rewardByKey.get(quest.id);
            const earned = rewardedCatalogIds.has(quest.id);
            const comingSoon = quest.state === "coming_soon";
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
                rewardId: reward?.id,
                title: quest.title,
                description: quest.description || undefined,
                url: quest.url || undefined,
                issueNumber: issueNumberFromId(quest.id) ?? undefined,
                reward: quest.rewardAmount,
                balanceBucket:
                    reward?.balanceBucket ?? quest.balanceBucket ?? "tier",
                status: deriveCardStatus(comingSoon, previewAll, reward),
                earnedAmount: reward?.pollenAmount ?? undefined,
                comingSoon,
            });
        }

        // Order per lane by lifecycle rank; within a rank, cheaper reward first.
        for (const key of Object.keys(byCat) as CategoryKey[]) {
            byCat[key].sort((a, b) => {
                const rankDelta = cardSortRank(a) - cardSortRank(b);
                if (rankDelta !== 0) return rankDelta;
                return (
                    (a.reward ?? Number.POSITIVE_INFINITY) -
                    (b.reward ?? Number.POSITIVE_INFINITY)
                );
            });
        }
        return byCat;
    }, [state.catalog, rewardedCatalogIds, rewardByKey, previewAll]);

    // Logged-out totals for the summary cards: across every available quest
    // shown (coming_soon excluded), how many there are and the pollen on offer,
    // split per bucket so the preview shows a paid card exactly when (and only
    // when) some available quest pays paid pollen — the same rule the logged-in
    // view uses, with catalog potential instead of this user's history.
    const previewTotals = useMemo(() => {
        const byBucket: Record<RewardIconKind, number> = { paid: 0, tier: 0 };
        let count = 0;
        for (const cards of Object.values(sections)) {
            for (const card of cards) {
                if (card.comingSoon || card.reward == null) continue;
                count += 1;
                byBucket[rewardIconKind(card.balanceBucket)] += card.reward;
            }
        }
        const usedBuckets: Record<RewardIconKind, boolean> = {
            tier: byBucket.tier > 0,
            paid: byBucket.paid > 0,
        };
        return { count, byBucket, usedBuckets };
    }, [sections]);

    // Which buckets the registry or earned rewards actually use — drives
    // whether the matching summary card is rendered. If no quest/reward touches
    // paid pollen, showing an always-zero paid card is just noise.
    const usedBuckets = useMemo(() => {
        const used: Record<RewardIconKind, boolean> = {
            paid: false,
            tier: false,
        };
        for (const quest of state.catalog) {
            used[rewardIconKind(quest.balanceBucket)] = true;
        }
        for (const reward of state.rewards) {
            used[rewardIconKind(reward.balanceBucket)] = true;
        }
        return used;
    }, [state.catalog, state.rewards]);

    // Per-bucket roll-up for the summary: a reward only counts once it has been
    // claimed (banked into the balance). Both the count and the pollen total are
    // gated on claimedAt, so an unclaimed reward inflates neither — it sits in
    // the "ready to claim" banner instead.
    const bucketStats = useMemo(() => {
        const stats: Record<
            RewardIconKind,
            { claimed: number; pollen: number }
        > = {
            paid: { claimed: 0, pollen: 0 },
            tier: { claimed: 0, pollen: 0 },
        };
        for (const reward of state.rewards) {
            if (reward.claimedAt == null) continue;
            const kind = rewardIconKind(reward.balanceBucket);
            stats[kind].claimed += 1;
            stats[kind].pollen += reward.pollenAmount;
        }
        return stats;
    }, [state.rewards]);

    // Unclaimed rewards waiting to be banked. The banner shows: total quest
    // count + per-bucket pollen amounts (each with its bucket glyph, since a
    // pollen number without its bucket icon is ambiguous).
    const claimable = useMemo(() => {
        const byKind: Record<RewardIconKind, number> = { paid: 0, tier: 0 };
        let count = 0;
        for (const reward of state.rewards) {
            if (reward.claimedAt == null) {
                byKind[rewardIconKind(reward.balanceBucket)] +=
                    reward.pollenAmount;
                count += 1;
            }
        }
        const segments = (["tier", "paid"] as RewardIconKind[])
            .filter((kind) => byKind[kind] > 0)
            .map((kind) => ({ kind, pollen: byKind[kind] }));
        return { count, segments };
    }, [state.rewards]);

    // While the automatic quest check is running, dim the stats and cards so
    // the panel reads as "refreshing" — the numbers may be about to change. The
    // checking indicator itself stays outside this wrapper so it stays crisp.
    const dimWhileChecking = state.checking
        ? "pointer-events-none select-none opacity-50 transition-opacity duration-300"
        : "transition-opacity duration-300";

    return (
        <div className="flex flex-col gap-6">
            {/* Summary panel. The per-user accounting (completed/claimed cards +
                claimable banner + checking indicator) is hidden for logged-out
                visitors, but the alpha + claim-flow footer stays so the preview
                still explains how quests work. */}
            <Surface variant="panel">
                {!state.anonymous && (
                    <>
                        {/* Responsive summary. Bucket cards are conditional on the
                    registry actually using that bucket (no point showing a
                    permanent zero). Source order is the mobile reading order
                    (header → total → header → pair); desktop uses explicit
                    col-start/row-start to put both headers on row 1 and the
                    cards on row 2. */}
                        <div className={dimWhileChecking}>
                            <QuestSummaryGrid
                                totalLabel="Claimed quests"
                                totalValue={
                                    bucketStats.paid.claimed +
                                    bucketStats.tier.claimed
                                }
                                pollenLabel="Claimed pollen"
                                pollenCards={(["tier", "paid"] as const)
                                    .filter((k) => usedBuckets[k])
                                    .map((kind) => ({
                                        key: kind,
                                        node: (
                                            <BucketCard
                                                kind={kind}
                                                value={formatRewardAmount(
                                                    bucketStats[kind].pollen,
                                                )}
                                                showBadge
                                            />
                                        ),
                                    }))}
                            />
                            {claimable.count > 0 && (
                                <div className="mt-3 flex flex-wrap items-center gap-x-1.5 gap-y-1 rounded-xl bg-theme-bg-subtle px-4 py-2.5 text-sm font-semibold text-theme-text-soft">
                                    <SparkleIcon className="h-4 w-4 shrink-0" />
                                    <span>
                                        <span className="tabular-nums">
                                            {claimable.count}
                                        </span>{" "}
                                        new{" "}
                                        {claimable.count === 1
                                            ? "quest"
                                            : "quests"}{" "}
                                        completed
                                    </span>
                                    {/* Reward amount pulled inline — "…completed
                                        🌱 5 pollen ready to claim!" — so it reads
                                        as one sentence, not a trailing chip. */}
                                    {claimable.segments.map((seg, i) => {
                                        const SegIcon =
                                            seg.kind === "paid"
                                                ? CardIcon
                                                : SproutIcon;
                                        return (
                                            <span
                                                key={seg.kind}
                                                className="flex items-center gap-1.5"
                                            >
                                                {i > 0 && (
                                                    <span
                                                        aria-hidden="true"
                                                        className="opacity-60"
                                                    >
                                                        ·
                                                    </span>
                                                )}
                                                <SegIcon className="h-4 w-4 shrink-0" />
                                                <span className="tabular-nums">
                                                    {formatRewardAmount(
                                                        seg.pollen,
                                                    )}
                                                </span>
                                            </span>
                                        );
                                    })}
                                    <span>pollen ready to claim!</span>
                                </div>
                            )}
                        </div>
                        {/* Auto-check indicator: quests check themselves on open, so
                    there's no button. Show a subtle "checking" line only while
                    the automatic check is in flight; nothing when idle. */}
                        {state.checking && (
                            <div className="mt-3 flex justify-end">
                                <span className="flex animate-[pulse_2s_ease-in-out_infinite] items-center gap-1.5 text-[13px] leading-snug text-theme-text-muted">
                                    <SearchIcon className="h-4 w-4 shrink-0" />
                                    Checking for new quests…
                                </span>
                            </div>
                        )}
                    </>
                )}
                {/* Logged-out summary: the same two-card pair, but the numbers are
                    catalog totals (how many quests are live, how much pollen they
                    pay) instead of this visitor's completed/claimed history. */}
                {state.anonymous && (
                    <>
                        {/* Same frame as the logged-in summary, but neutral tiles
                            (not the green/amber owned wells) so the pollen on
                            offer never reads as a balance the visitor holds. The
                            bucket glyph still marks tier (green sprout) vs paid
                            (amber card). */}
                        <QuestSummaryGrid
                            totalLabel="Available quests"
                            totalValue={previewTotals.count}
                            pollenLabel="Available pollen"
                            pollenCards={(["tier", "paid"] as const)
                                .filter((k) => previewTotals.usedBuckets[k])
                                .map((kind) => ({
                                    key: kind,
                                    node: (
                                        <TotalCard
                                            value={formatRewardAmount(
                                                previewTotals.byBucket[kind],
                                            )}
                                            icon={
                                                kind === "paid"
                                                    ? CardIcon
                                                    : SproutIcon
                                            }
                                            iconClassName={
                                                kind === "paid"
                                                    ? "polli-wallet-text-paid"
                                                    : "polli-wallet-text-tier"
                                            }
                                        />
                                    ),
                                }))}
                        />
                        {/* Same banner as the logged-in "ready to claim" line.
                            Not a link yet; the real login CTA is a follow-up. */}
                        <div className="mt-3 flex flex-wrap items-center gap-x-1.5 gap-y-1 rounded-xl bg-theme-bg-subtle px-4 py-2.5 text-sm font-semibold text-theme-text-soft">
                            Log in to start earning.
                        </div>
                    </>
                )}
                {/* Multi-line footer styled like the keys panel's footer —
                    text-[13px] + leading-snug keeps the two lines visually
                    tight. Always shown — explains quests to logged-out
                    visitors too. */}
                <div className="mt-4 space-y-2 border-t border-divider pt-4 text-[13px] leading-snug text-theme-text-muted">
                    <p className="flex items-start gap-1.5">
                        <TargetIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span>
                            Complete → claim → credited to your{" "}
                            <InlineLink href="#pollen" showIcon={false}>
                                wallet
                            </InlineLink>
                            .
                        </span>
                    </p>
                    <p className="flex items-start gap-1.5">
                        <CheckIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span>
                            Quests are retroactive — if you already qualify,
                            just claim the reward.
                        </span>
                    </p>
                    <p className="flex items-start gap-1.5">
                        <BeakerIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span>
                            Early days — quests are in alpha, with more coming
                            and rewards still evolving.
                        </span>
                    </p>
                </div>
            </Surface>

            {state.error && (
                <Text size="sm" className="text-intent-danger-text">
                    {state.error}
                </Text>
            )}

            {state.loading && (
                <Surface
                    variant="card"
                    className="flex items-center gap-2 text-theme-text-muted"
                >
                    <ClockIcon className="h-4 w-4 shrink-0" />
                    <Text size="sm" tone="muted">
                        Loading quests…
                    </Text>
                </Surface>
            )}

            <div className={`flex flex-col gap-6 ${dimWhileChecking}`}>
                {CATEGORIES.map((category) => {
                    const cards = sections[category.key];
                    if (cards.length === 0) return null;
                    // The progress chip counts only real (grantable) quests —
                    // coming_soon rows are excluded from both done and total.
                    const liveCards = cards.filter((card) => !card.comingSoon);
                    const done = liveCards.filter(
                        (card) => card.status !== "open",
                    ).length;
                    return (
                        <Section
                            key={category.key}
                            title={category.label}
                            framed
                            panelClassName="flex flex-col gap-2"
                            action={
                                <Chip
                                    intent="neutral"
                                    size="sm"
                                    className="tabular-nums"
                                >
                                    {done} / {liveCards.length}
                                </Chip>
                            }
                        >
                            {cards.map((card) => (
                                <QuestRow
                                    key={card.key}
                                    card={card}
                                    icon={category.icon}
                                    claiming={
                                        state.claimingRewardId === card.rewardId
                                    }
                                    onClaim={handleClaimReward}
                                />
                            ))}
                        </Section>
                    );
                })}
            </div>
        </div>
    );
};
