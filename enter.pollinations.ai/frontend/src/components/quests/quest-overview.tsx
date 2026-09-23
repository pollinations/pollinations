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
    LoadingStatus,
    RocketIcon,
    Section,
    SparkleIcon,
    SproutIcon,
    Surface,
    TargetIcon,
    TerminalIcon,
    Text,
    TrendUpIcon,
} from "@pollinations/ui";
import { Markdown } from "@pollinations/ui/markdown";
import { formatPollen, WalletBalanceCard } from "@pollinations/ui/wallet";
import { useLoaderData } from "@tanstack/react-router";
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
    QuestCatalogResponse,
    QuestCheckResult,
} from "../../backend-types.ts";
import { LoadError } from "../layout/dashboard-loading.tsx";
import { mergeQuestRewards, type QuestReward } from "./quest-rewards.ts";

type QuestCatalogItem = QuestCatalogResponse["quests"][number];
type QuestProgress = QuestCheckResult["progress"][number];

type QuestOverviewProps = Record<string, never>;

type CachedQuestData = Pick<
    FetchState,
    "catalog" | "rewards" | "progress" | "anonymous"
>;

// Keep the last account’s data across page visits, never across accounts.
let cachedQuests: { userId: string | null; data: CachedQuestData } | null =
    null;

type FetchState = {
    catalog: QuestCatalogItem[];
    rewards: QuestReward[];
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
    progress: [],
    loading: true,
    checking: false,
    error: null,
    claimingRewardIds: [],
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
    progress?: QuestProgress;
    // coming_soon quests render at the bottom of their lane in the receded
    // (claimed) style, with a clock + "Coming soon" in place of the reward.
    comingSoon?: boolean;
};

// ── Presentational primitives (composed from @pollinations/ui) ───────────────

// Soft bucket-colored tile for the reward chip: amber paid / green Quest,
// so the row's reward badge carries the bucket identity.
const BUCKET_CHIP_CLASS: Record<RewardIconKind, string> = {
    paid: "polli-wallet-chip-paid",
    tier: "polli-wallet-chip-tier",
};

function QuestSummary({
    quests,
    pollen,
    preview = false,
}: {
    quests: number;
    pollen: number;
    preview?: boolean;
}) {
    return (
        <div
            className={`grid grid-cols-2 gap-3${preview ? " quest-summary-preview" : ""}`}
        >
            <WalletBalanceCard
                kind="paid"
                label={preview ? "Available quests" : "Quests"}
                value={quests}
                icon={<SparkleIcon className="h-3.5 w-3.5 shrink-0" />}
            />
            <WalletBalanceCard
                kind="tier"
                label={preview ? "Potential Pollen" : "Pollen"}
                value={formatRewardAmount(pollen)}
            />
        </div>
    );
}

function QuestDescription({ children }: { children: string }) {
    return (
        <Markdown className="inline text-sm text-theme-text-muted [&_em]:text-xs [&_em]:text-theme-text-muted [&_em]:opacity-85 [&_p]:mb-0 [&_p]:inline">
            {children}
        </Markdown>
    );
}

function QuestProgressBar({ progress }: { progress: QuestProgress }) {
    const percentage = Math.min(
        100,
        Math.max(0, (progress.current / progress.target) * 100),
    );
    const formatValue = (value: number) =>
        progress.unit === "pollen"
            ? formatPollen(value)
            : value.toLocaleString();

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
                    className="h-full rounded-full bg-theme-text-soft"
                    style={{ width: `${percentage}%` }}
                />
            </div>
            <span className="shrink-0 text-xs tabular-nums text-theme-text-muted">
                {formatValue(progress.current)} / {formatValue(progress.target)}{" "}
                {progress.unit}
            </span>
        </div>
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
    const progress =
        !card.comingSoon && card.progress ? (
            <QuestProgressBar progress={card.progress} />
        ) : null;
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
            <InlineLink href={card.url} className="text-sm tabular-nums">
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
            intent="commit"
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
                    {progress}
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
                    {progress}
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
    const { user } = useLoaderData({ from: "/_dashboard" });
    return (
        <QuestOverviewContent
            key={user?.id ?? "anonymous"}
            userId={user?.id ?? null}
        />
    );
};

function QuestOverviewContent({ userId }: { userId: string | null }) {
    const [state, setState] = useState<FetchState>(() => ({
        ...INITIAL_STATE,
        anonymous: userId === null,
        ...(cachedQuests?.userId === userId
            ? {
                  ...cachedQuests.data,
                  loading: false,
                  checking: userId !== null,
              }
            : {}),
    }));
    useEffect(() => {
        if (!state.loading && !state.error) {
            const { catalog, rewards, progress, anonymous } = state;
            cachedQuests = {
                userId,
                data: { catalog, rewards, progress, anonymous },
            };
        }
    }, [userId, state]);
    // Guards the auto-check so React 18 StrictMode's double-mount fires it once.
    const autoCheckedRef = useRef(false);
    // Logged-out visitors see a preview: every quest shown open (so all
    // descriptions render) and the off-board/unearned visibility filter
    // relaxed, since there is no per-user progress to gate on.
    const previewAll = state.anonymous;

    // On open: keep previously loaded data visible, fetch saved rewards, THEN run one
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
                setState((current) => ({
                    ...current,
                    ...questData,
                    rewards: mergeQuestRewards(
                        current.rewards,
                        questData.rewards,
                    ),
                    loading: false,
                    // Flag the auto-check as in-flight so the indicator shows
                    // straight after the initial render, with no idle flash.
                    // Anonymous visitors run no check (it would 401), so don't
                    // show the indicator for them.
                    checking: !questData.anonymous,
                    error: null,
                }));
                // No per-user check for logged-out visitors — the catalog
                // preview is all they get.
                if (questData.anonymous) return;
            } catch (error) {
                if (cancelled) return;
                setState((current) => ({
                    ...current,
                    loading: false,
                    checking: false,
                    error:
                        error instanceof Error
                            ? error.message
                            : "Failed to load quests",
                }));
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
                    const checkResult =
                        (await response.json()) as QuestCheckResult;
                    const refreshed = await loadQuestData();
                    if (cancelled) return;
                    setState((current) => ({
                        ...current,
                        ...refreshed,
                        rewards: mergeQuestRewards(
                            current.rewards,
                            refreshed.rewards,
                        ),
                        progress: checkResult.progress,
                        checking: false,
                        loading: false,
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
            claimingRewardIds: [...current.claimingRewardIds, rewardId],
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
            const { reward } = await response.json();
            setState((current) => ({
                ...current,
                rewards: current.rewards.map((existing) =>
                    existing.id === reward.id
                        ? { ...existing, ...reward }
                        : existing,
                ),
                claimingRewardIds: current.claimingRewardIds.filter(
                    (id) => id !== rewardId,
                ),
            }));
        } catch (error) {
            setState((current) => ({
                ...current,
                claimingRewardIds: current.claimingRewardIds.filter(
                    (id) => id !== rewardId,
                ),
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
        const progressByQuestId = new Map(
            state.progress.map((progress) => [progress.questId, progress]),
        );
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
                progress:
                    reward && quest.goal
                        ? {
                              questId: quest.id,
                              current: quest.goal.target,
                              ...quest.goal,
                          }
                        : progressByQuestId.get(quest.id),
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
    }, [
        state.catalog,
        state.progress,
        rewardedCatalogIds,
        rewardByKey,
        previewAll,
    ]);

    // Rewards created by a maintainer or another non-catalog source still need
    // their own claim control. This is deliberately derived from the ledger —
    // no synthetic catalog entry or special balance path.
    const bonusRewardCards = useMemo(() => {
        const catalogIds = new Set(state.catalog.map((quest) => quest.id));
        return state.rewards
            .filter(
                (reward) =>
                    reward.questId == null || !catalogIds.has(reward.questId),
            )
            .map<QuestCard>((reward) => ({
                key: reward.id,
                rewardId: reward.id,
                title: reward.title,
                url: reward.url ?? undefined,
                issueNumber: githubNumberFromUrl(reward.url) ?? undefined,
                reward: reward.pollenAmount,
                balanceBucket: reward.balanceBucket,
                status: reward.claimedAt ? "claimed" : "claimable",
                earnedAmount: reward.pollenAmount,
            }));
    }, [state.catalog, state.rewards]);

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

    // Only banked rewards count as claimed; unclaimed rewards stay in the banner.
    const claimedStats = useMemo(() => {
        const stats = { quests: 0, pollen: 0 };
        for (const reward of state.rewards) {
            if (reward.claimedAt == null) continue;
            stats.quests += 1;
            stats.pollen += reward.pollenAmount;
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

    const showSummary =
        !state.loading &&
        (!state.error || state.catalog.length > 0 || state.rewards.length > 0);

    return (
        <div className="flex flex-col gap-6">
            {/* Summary. The per-user accounting (completed/claimed cards +
                claimable banner + checking indicator) is hidden for logged-out
                visitors, but the alpha + claim-flow footer stays so the preview
                still explains how quests work. */}
            <Section
                title={state.anonymous ? "Pollen you can earn" : "Claimed"}
            >
                {state.loading && (
                    <LoadingStatus>Loading quests…</LoadingStatus>
                )}
                {showSummary && !state.anonymous && (
                    <>
                        <div>
                            <QuestSummary
                                quests={claimedStats.quests}
                                pollen={claimedStats.pollen}
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
                        {state.checking && (
                            <LoadingStatus>
                                Checking for new quests…
                            </LoadingStatus>
                        )}
                    </>
                )}
                {/* The preview counts available quests and their possible rewards. */}
                {showSummary && state.anonymous && (
                    <QuestSummary
                        preview
                        quests={previewTotals.count}
                        pollen={previewTotals.pollen}
                    />
                )}
                <div className="space-y-2 text-[13px] leading-snug text-theme-text-muted">
                    <p className="flex items-start gap-1.5">
                        <TargetIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span>
                            Complete → claim → credited to your{" "}
                            <InlineLink href="/pollen">wallet</InlineLink>.
                        </span>
                    </p>
                    <p className="flex items-start gap-1.5">
                        <CheckIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span>
                            Quests can be retroactive — if you qualify under a
                            quest's rules, just claim the reward.
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
            </Section>

            {state.error && <LoadError>{state.error}</LoadError>}

            <div className="flex flex-col gap-6">
                {bonusRewardCards.length > 0 && (
                    <Section
                        title="Bonus rewards"
                        action={
                            <span className="text-xs font-medium tabular-nums text-theme-text-strong">
                                {
                                    bonusRewardCards.filter(
                                        (card) => card.status === "claimed",
                                    ).length
                                }{" "}
                                / {bonusRewardCards.length}
                            </span>
                        }
                    >
                        <div className="flex flex-col gap-2">
                            {bonusRewardCards.map((card) => (
                                <QuestRow
                                    key={card.key}
                                    card={card}
                                    icon={SparkleIcon}
                                    claiming={state.claimingRewardIds.includes(
                                        card.rewardId ?? "",
                                    )}
                                    onClaim={handleClaimReward}
                                />
                            ))}
                        </div>
                    </Section>
                )}
                {CATEGORIES.map((category) => {
                    const cards = sections[category.key];
                    if (!state.loading && cards.length === 0) return null;
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
                            action={
                                !state.loading && (
                                    <span className="text-xs font-medium tabular-nums text-theme-text-strong">
                                        {done} / {liveCards.length}
                                    </span>
                                )
                            }
                        >
                            <div
                                className="flex min-h-5 flex-col gap-2"
                                aria-busy={state.loading}
                            >
                                {cards.map((card) => (
                                    <QuestRow
                                        key={card.key}
                                        card={card}
                                        icon={category.icon}
                                        claiming={state.claimingRewardIds.includes(
                                            card.rewardId ?? "",
                                        )}
                                        onClaim={handleClaimReward}
                                    />
                                ))}
                            </div>
                        </Section>
                    );
                })}
            </div>
        </div>
    );
}
