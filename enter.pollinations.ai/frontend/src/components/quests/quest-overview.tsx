import {
    BeakerIcon,
    Button,
    CardIcon,
    ChatIcon,
    CheckIcon,
    Chip,
    ClockIcon,
    DiscordIcon,
    GitBranchIcon,
    GitHubIcon,
    InlineLink,
    KeyIcon,
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
    WalletIcon,
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
};

const INITIAL_STATE: FetchState = {
    catalog: [],
    rewards: [],
    loading: true,
    checking: false,
    error: null,
    claimingRewardId: null,
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
    blurb: string;
    icon: IconComponent;
    // Footer glyph — picked to echo the blurb sentence rather than repeat the
    // section icon (which already marks every row in the lane).
    footerIcon: IconComponent;
};

const CATEGORIES: CategoryMeta[] = [
    {
        key: "setup",
        label: "Setup",
        blurb: "Get started with Pollinations.",
        icon: RocketIcon,
        footerIcon: KeyIcon,
    },
    {
        key: "grow",
        label: "Grow",
        blurb: "Grow your usage and revenue from apps.",
        icon: TrendUpIcon,
        footerIcon: WalletIcon,
    },
    {
        key: "build",
        label: "Build",
        blurb: "Your standing as a developer: GitHub, stars, and PRs.",
        icon: TerminalIcon,
        footerIcon: GitBranchIcon,
    },
    {
        key: "contribute",
        label: "Contribute",
        blurb: "Open-source issues and bounties you can help ship.",
        icon: GitHubIcon,
        footerIcon: SearchIcon,
    },
    {
        key: "community",
        label: "Community",
        blurb: "Low-friction ways to join and support the project.",
        icon: DiscordIcon,
        footerIcon: ChatIcon,
    },
    {
        key: "easteregg",
        label: "Easter eggs",
        blurb: "One-off rewards unlocked for you.",
        icon: SproutIcon,
        footerIcon: SparkleIcon,
    },
];

function issueNumberFromId(id: string): number | null {
    const match = /^github:issue:(\d+)$/.exec(id);
    return match ? Number(match[1]) : null;
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

type QuestData = Pick<FetchState, "catalog" | "rewards">;

async function loadQuestData(): Promise<QuestData> {
    const [catalogResponse, rewardsResponse] = await Promise.all([
        apiClient.quests.catalog.$get(),
        apiClient.account.quests.$get(),
    ]);
    if (!catalogResponse.ok || !rewardsResponse.ok) {
        throw new Error(
            `Failed to load quests (${catalogResponse.status}/${rewardsResponse.status})`,
        );
    }
    const catalog = (await catalogResponse.json()) as QuestCatalogResponse;
    const rewardsPayload = (await rewardsResponse.json()) as {
        rewards: QuestReward[];
    };
    return {
        catalog: catalog.quests ?? [],
        rewards: rewardsPayload.rewards ?? [],
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
// Surface card so the bg + well shadow match the Setup/quest rows exactly.
export function TotalCard({ value }: { value: React.ReactNode }) {
    return (
        <Surface
            variant="card"
            className="flex items-center justify-center py-4 sm:py-5"
        >
            <span className="flex items-center gap-1.5 text-3xl font-bold leading-none tracking-tight tabular-nums text-theme-text-base sm:gap-2 sm:text-5xl">
                <SparkleIcon className="h-7 w-7 shrink-0 sm:h-10 sm:w-10" />
                {value}
            </span>
        </Surface>
    );
}

function SectionFooter({ category }: { category: CategoryMeta }) {
    const Icon = category.footerIcon;
    return (
        <div className="mt-4 flex items-center gap-1.5 border-t border-divider pt-4 text-theme-text-muted">
            <Icon className="h-3.5 w-3.5 shrink-0" />
            <Text as="span" size="sm" tone="muted">
                {category.blurb}
            </Text>
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
}: {
    icon: IconComponent;
    status: QuestCardStatus;
}) {
    const MarkerIcon = status === "open" ? Icon : CheckIcon;
    const tile =
        status === "open"
            ? "bg-theme-bg-active text-theme-text-strong"
            : status === "claimable"
              ? "bg-theme-bg-subtle text-theme-text-muted"
              : "text-theme-text-muted";
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
    // "pollen" would just repeat it.
    const rewardLabel =
        rewardAmount == null ? "TBD" : formatRewardAmount(rewardAmount);

    // Shared pieces, placed differently per breakpoint below.
    const title = (
        <Text as="span" weight="semibold" tone={claimed ? "muted" : "strong"}>
            {card.title}
        </Text>
    );
    const description = !earned && card.description ? card.description : null;
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
    const rewardChip = (
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
    const reward = claimed ? (
        rewardChip
    ) : (
        <>
            {claimableRewardId && (
                <Button
                    type="button"
                    disabled={claiming}
                    onClick={() => onClaim(claimableRewardId)}
                    className="gap-1.5"
                >
                    <SparkleIcon className="h-4 w-4 shrink-0" />
                    {claiming ? "Claiming" : "Claim"}
                </Button>
            )}
            {rewardChip}
        </>
    );

    return (
        <Surface variant="card">
            {/* Mobile: stacked. Icon centered with the (wrappable) title;
                description full-width below the icon; issue link bottom-left and
                reward bottom-right. */}
            <div className="flex flex-col gap-3 sm:hidden">
                <div className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-4">
                        <QuestMarker icon={icon} status={card.status} />
                        <div className="min-w-0 flex-1">{title}</div>
                    </div>
                    {description && (
                        <QuestDescription>{description}</QuestDescription>
                    )}
                </div>
                <div className="flex items-center gap-2.5">
                    {issueLink}
                    <div className="ml-auto flex items-center gap-2.5">
                        {reward}
                    </div>
                </div>
            </div>

            {/* Desktop: three columns, all vertically centered. Icon | content
                (title + description, with the issue link at the end of the
                description) | claim + reward. Keeps the card to two text rows. */}
            <div className="hidden items-center gap-4 sm:flex">
                <QuestMarker icon={icon} status={card.status} />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
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
                <div className="flex shrink-0 items-center gap-2.5">
                    {reward}
                </div>
            </div>
        </Surface>
    );
}

export const QuestOverview: FC<QuestOverviewProps> = () => {
    const [state, setState] = useState<FetchState>(INITIAL_STATE);
    // Guards the auto-check so React 18 StrictMode's double-mount fires it once.
    const autoCheckedRef = useRef(false);

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
                    checking: true,
                    error: null,
                    claimingRewardId: null,
                });
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
                const response = await apiClient.account.quests.check.$post();
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
            const response = await apiClient.account.rewards[
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
            // The single visibility rule: a card shows if it's on the open board
            // (availability "available"), OR if YOU earned it. So an off-board
            // or per-person card you didn't earn disappears.
            if (quest.availability !== "available" && !earned) continue;

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
                status: reward
                    ? reward.claimedAt
                        ? "claimed"
                        : "claimable"
                    : "open",
                earnedAmount: reward?.pollenAmount ?? undefined,
            });
        }

        // Claimable wins float to the top of each lane, then claimed, then open.
        for (const key of Object.keys(byCat) as CategoryKey[]) {
            byCat[key].sort((a, b) => {
                const statusOrder: Record<QuestCardStatus, number> = {
                    claimable: 0,
                    claimed: 1,
                    open: 2,
                };
                if (a.status !== b.status) {
                    return statusOrder[a.status] - statusOrder[b.status];
                }
                return (
                    (a.reward ?? Number.POSITIVE_INFINITY) -
                    (b.reward ?? Number.POSITIVE_INFINITY)
                );
            });
        }
        return byCat;
    }, [state.catalog, rewardedCatalogIds, rewardByKey]);

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

    // Per-bucket roll-up for the summary: each earned reward is one completed
    // quest, while the pollen total counts only what has actually been claimed
    // (banked into the balance) — an unclaimed reward is completed but its
    // pollen has not landed yet, so it must not inflate the claimed total.
    const bucketStats = useMemo(() => {
        const stats: Record<
            RewardIconKind,
            { completed: number; pollen: number }
        > = {
            paid: { completed: 0, pollen: 0 },
            tier: { completed: 0, pollen: 0 },
        };
        for (const reward of state.rewards) {
            const kind = rewardIconKind(reward.balanceBucket);
            stats[kind].completed += 1;
            if (reward.claimedAt != null) {
                stats[kind].pollen += reward.pollenAmount;
            }
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
            <Surface variant="panel">
                {/* Responsive summary. Bucket cards are conditional on the
                    registry actually using that bucket (no point showing a
                    permanent zero). Source order is the mobile reading order
                    (header → total → header → pair); desktop uses explicit
                    col-start/row-start to put both headers on row 1 and the
                    cards on row 2. */}
                <div className={dimWhileChecking}>
                    {(() => {
                        const visibleBuckets = (
                            ["paid", "tier"] as const
                        ).filter((k) => usedBuckets[k]);
                        const bucketCount = visibleBuckets.length;
                        const totalCard = (
                            <TotalCard
                                value={
                                    bucketStats.paid.completed +
                                    bucketStats.tier.completed
                                }
                            />
                        );
                        if (bucketCount === 0) {
                            // No quest pays pollen → just the completed total.
                            return (
                                <div className="flex flex-col gap-2">
                                    <Text
                                        as="span"
                                        size="sm"
                                        weight="bold"
                                        tone="muted"
                                        className="uppercase tracking-wide"
                                    >
                                        Completed quests
                                    </Text>
                                    <div className="sm:w-1/3">{totalCard}</div>
                                </div>
                            );
                        }
                        const gridCols =
                            bucketCount === 2
                                ? "sm:grid-cols-3"
                                : "sm:grid-cols-2";
                        const claimedHeaderColSpan =
                            bucketCount === 2
                                ? "sm:col-span-2"
                                : "sm:col-span-1";
                        return (
                            <div
                                className={`grid grid-cols-2 gap-x-2 gap-y-2 ${gridCols}`}
                            >
                                <Text
                                    as="span"
                                    size="sm"
                                    weight="bold"
                                    tone="muted"
                                    className="col-span-2 uppercase tracking-wide sm:col-span-1 sm:col-start-1 sm:row-start-1"
                                >
                                    Completed quests
                                </Text>
                                <div className="col-span-2 sm:col-span-1 sm:col-start-1 sm:row-start-2">
                                    {totalCard}
                                </div>
                                <Text
                                    as="span"
                                    size="sm"
                                    weight="bold"
                                    tone="muted"
                                    className={`col-span-2 uppercase tracking-wide sm:col-start-2 sm:row-start-1 ${claimedHeaderColSpan}`}
                                >
                                    Claimed pollen reward
                                </Text>
                                {visibleBuckets.map((kind, i) => {
                                    const colStart =
                                        bucketCount === 2 && i === 1
                                            ? "sm:col-start-3"
                                            : "sm:col-start-2";
                                    return (
                                        <div
                                            key={kind}
                                            className={`${colStart} sm:row-start-2`}
                                        >
                                            <BucketCard
                                                kind={kind}
                                                value={formatRewardAmount(
                                                    bucketStats[kind].pollen,
                                                )}
                                                showBadge
                                            />
                                        </div>
                                    );
                                })}
                            </div>
                        );
                    })()}
                    {claimable.count > 0 && (
                        <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl bg-theme-bg-subtle px-4 py-2.5 text-sm font-semibold text-theme-text-soft">
                            <SparkleIcon className="h-4 w-4 shrink-0" />
                            <span>
                                <span className="tabular-nums">
                                    {claimable.count}
                                </span>{" "}
                                new {claimable.count === 1 ? "quest" : "quests"}{" "}
                                completed ready to claim!
                            </span>
                            {claimable.segments.map((seg, i) => {
                                const SegIcon =
                                    seg.kind === "paid" ? CardIcon : SproutIcon;
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
                                            {formatRewardAmount(seg.pollen)}
                                        </span>
                                    </span>
                                );
                            })}
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
                {/* Multi-line footer styled like the keys panel's footer —
                    text-[13px] + leading-snug keeps the two lines visually
                    tight. */}
                <div className="mt-4 space-y-2 border-t border-divider pt-4 text-[13px] leading-snug text-theme-text-muted">
                    <p className="flex items-start gap-1.5">
                        <BeakerIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span>
                            Quests are in alpha — rewards and availability
                            evolve as we tune them.
                        </span>
                    </p>
                    <p className="flex items-start gap-1.5">
                        <TargetIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span>
                            Complete → claim → credited to your{" "}
                            <InlineLink href="#pollen" showIcon={false}>
                                pollen wallet
                            </InlineLink>
                            .
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
                    const done = cards.filter(
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
                                    {done} / {cards.length}
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
                            <SectionFooter category={category} />
                        </Section>
                    );
                })}
            </div>
        </div>
    );
};
