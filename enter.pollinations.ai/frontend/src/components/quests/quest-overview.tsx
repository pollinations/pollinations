import {
    AppIcon,
    Button,
    CardIcon,
    CheckIcon,
    Chip,
    ClockIcon,
    DiscordIcon,
    GitHubIcon,
    Heading,
    InlineLink,
    RocketIcon,
    SproutIcon,
    Surface,
    TerminalIcon,
    Text,
} from "@pollinations/ui";
import { formatPollen, WalletKindIcon } from "@pollinations/ui/wallet";
import {
    type ComponentType,
    type FC,
    useEffect,
    useMemo,
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
    error: string | null;
    claimingRewardId: string | null;
};

const INITIAL_STATE: FetchState = {
    catalog: [],
    rewards: [],
    loading: true,
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
};

const CATEGORIES: CategoryMeta[] = [
    {
        key: "setup",
        label: "Setup",
        blurb: "Get started with Pollinations.",
        icon: RocketIcon,
    },
    {
        key: "grow",
        label: "Grow",
        blurb: "Grow your usage and revenue from apps.",
        icon: AppIcon,
    },
    {
        key: "build",
        label: "Build",
        blurb: "Your standing as a developer: GitHub, stars, and PRs.",
        icon: TerminalIcon,
    },
    {
        key: "contribute",
        label: "Contribute",
        blurb: "Open-source issues and bounties you can help ship.",
        icon: GitHubIcon,
    },
    {
        key: "community",
        label: "Community",
        blurb: "Low-friction ways to join and support the project.",
        icon: DiscordIcon,
    },
    {
        key: "easteregg",
        label: "Easter eggs",
        blurb: "One-off rewards unlocked for you.",
        icon: SproutIcon,
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

function questStatusAccent(status: QuestCardStatus): string {
    if (status === "claimed") return "var(--color-theme-text-muted)";
    return "var(--color-intent-warning-text)";
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

// The summary keeps the wallet page's big-icon cards — one per metric — but
// splits each value into its paid (amber) and tier (green) parts, so a paid
// reward is never forced into tier colors. Paid/tier is carried by color here;
// the legend can live in a footer or tooltip. Built from the wallet's own text
// classes so the colors match the wallet exactly.
const BUCKET_TEXT_CLASS: Record<RewardIconKind, string> = {
    paid: "polli-wallet-text-paid",
    tier: "polli-wallet-text-tier",
};

// Soft bucket-colored tile for the Claim button — amber (paid) / green (tier),
// so the action carries the reward's own identity instead of a generic CTA hue.
const BUCKET_CHIP_CLASS: Record<RewardIconKind, string> = {
    paid: "polli-wallet-chip-paid",
    tier: "polli-wallet-chip-tier",
};

// A sparkle cluster — the joyful "you earned it" mark for the Claim button.
function SparkleIcon({ className }: { className?: string }) {
    return (
        <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className}
        >
            <path d="M9.94 15.5A2 2 0 0 0 8.5 14.06l-6.14-1.58a.5.5 0 0 1 0-.96L8.5 9.94A2 2 0 0 0 9.94 8.5l1.58-6.14a.5.5 0 0 1 .96 0L14.06 8.5A2 2 0 0 0 15.5 9.94l6.14 1.58a.5.5 0 0 1 0 .96L15.5 14.06a2 2 0 0 0-1.44 1.44l-1.58 6.14a.5.5 0 0 1-.96 0z" />
            <path d="M20 3v4" />
            <path d="M22 5h-4" />
            <path d="M4 17v2" />
            <path d="M5 18H3" />
        </svg>
    );
}

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
            <span className="polli-wallet-balance-value flex items-center gap-2 font-bold leading-none tracking-tight tabular-nums">
                {showBadge && (
                    <BadgeIcon className="h-8 w-8 shrink-0 sm:h-10 sm:w-10" />
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
            <span className="polli-wallet-balance-value font-bold leading-none tracking-tight tabular-nums text-theme-text-base">
                {value}
            </span>
        </Surface>
    );
}

function SectionHeader({
    category,
    done,
    total,
}: {
    category: CategoryMeta;
    done: number;
    total: number;
}) {
    return (
        <div className="flex items-center justify-between gap-4 px-1">
            <Heading as="h2" size="section">
                {category.label}
            </Heading>
            <Chip
                intent="neutral"
                size="sm"
                className="bg-switch-track-on text-switch-thumb tabular-nums"
            >
                {done} / {total}
            </Chip>
        </div>
    );
}

function SectionFooter({ category }: { category: CategoryMeta }) {
    const Icon = category.icon;
    return (
        <div className="mt-4 flex items-center gap-1.5 border-t border-divider pt-4 text-theme-text-muted">
            <Icon className="h-3.5 w-3.5 shrink-0" />
            <Text as="span" size="sm" tone="muted">
                {category.blurb}
            </Text>
        </div>
    );
}

// Leading marker for a quest row, by lifecycle stage:
//   open      → tier-green tile + section icon ("available — go earn this")
//   claimable → dim dark tile + light check (just completed, reward waiting)
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
            ? "polli-wallet-chip-tier"
            : status === "claimable"
              ? "bg-ink-900/80 text-ink-100"
              : "text-theme-text-muted";
    return (
        <span
            aria-hidden="true"
            className={`flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] ${tile}`}
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
    const accent = questStatusAccent(card.status);
    const rewardAmount = earned
        ? (card.earnedAmount ?? card.reward)
        : card.reward;
    const rewardIcon = rewardIconKind(card.balanceBucket);
    const rewardLabel =
        rewardAmount == null
            ? "Reward TBD"
            : `${formatRewardAmount(rewardAmount)} pollen`;

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
                style={{ color: accent }}
            >
                #{card.issueNumber}
            </InlineLink>
        ) : null;
    // Claimed rewards are banked, so they read as a quiet greyed "+N pollen"
    // (no chip fill) — matching the approved mockup. WalletKindIcon forces its
    // own tier/paid color, so use the raw glyph here to let it grey out.
    const RewardKindIcon = rewardIcon === "paid" ? CardIcon : SproutIcon;
    const reward = claimed ? (
        <span className="flex items-center gap-1 tabular-nums text-theme-text-muted">
            <RewardKindIcon className="h-3.5 w-3.5 shrink-0" />+
            {formatRewardAmount(rewardAmount)} pollen
        </span>
    ) : (
        <>
            {claimableRewardId && (
                <Button
                    type="button"
                    disabled={claiming}
                    onClick={() => onClaim(claimableRewardId)}
                    className={`gap-1.5 ${BUCKET_CHIP_CLASS[rewardIcon]}`}
                >
                    <SparkleIcon className="h-4 w-4 shrink-0" />
                    {claiming ? "Claiming" : "Claim"}
                </Button>
            )}
            <Chip
                intent="neutral"
                size="sm"
                className={`gap-1 tabular-nums ${BUCKET_CHIP_CLASS[rewardIcon]}`}
            >
                <WalletKindIcon kind={rewardIcon} />
                {rewardLabel}
            </Chip>
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
                        <Text size="sm" tone="muted">
                            {description}
                        </Text>
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
                        <Text as="div" size="sm" tone="muted">
                            {description}
                            {description && issueLink ? " " : null}
                            {issueLink}
                        </Text>
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

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const questData = await loadQuestData();
                if (cancelled) return;
                setState({
                    ...questData,
                    loading: false,
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

    // Per-bucket roll-up for the summary: each earned reward is one completed
    // quest, and its pollen total lands in either the paid or tier bucket.
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
            stats[kind].pollen += reward.pollenAmount;
        }
        return stats;
    }, [state.rewards]);

    // Unclaimed rewards waiting to be banked, split by bucket so the banner can
    // mark each amount with the kind of pollen it is (tier sprout / paid card).
    const claimable = useMemo(() => {
        const byKind: Record<RewardIconKind, number> = { paid: 0, tier: 0 };
        for (const reward of state.rewards) {
            if (reward.claimedAt == null) {
                byKind[rewardIconKind(reward.balanceBucket)] +=
                    reward.pollenAmount;
            }
        }
        return (["tier", "paid"] as RewardIconKind[])
            .filter((kind) => byKind[kind] > 0)
            .map((kind) => ({ kind, pollen: byKind[kind] }));
    }, [state.rewards]);

    return (
        <div className="flex flex-col gap-6">
            <Surface variant="panel">
                {/* Three equal-width cells across the row: Completed quests
                    takes one (bucket-agnostic — a quest is a quest); Pollen
                    earned takes two (paid + tier, since the buckets spend
                    differently). Section titles sit as headers above their
                    cards, spanning their group's columns. */}
                <div className="grid grid-cols-3 gap-x-2 gap-y-2">
                    <Text
                        as="span"
                        size="sm"
                        weight="bold"
                        tone="muted"
                        className="col-span-1 uppercase tracking-wide"
                    >
                        Completed quests
                    </Text>
                    <Text
                        as="span"
                        size="sm"
                        weight="bold"
                        tone="muted"
                        className="col-span-2 uppercase tracking-wide"
                    >
                        Pollen earned
                    </Text>
                    <TotalCard
                        value={
                            bucketStats.paid.completed +
                            bucketStats.tier.completed
                        }
                    />
                    <BucketCard
                        kind="paid"
                        value={formatRewardAmount(bucketStats.paid.pollen)}
                        showBadge
                    />
                    <BucketCard
                        kind="tier"
                        value={formatRewardAmount(bucketStats.tier.pollen)}
                        showBadge
                    />
                </div>
                {claimable.length > 0 && (
                    <div className="mt-3 flex flex-wrap items-center gap-x-1.5 gap-y-1 rounded-xl bg-intent-success-bg-light px-4 py-2.5 text-sm font-semibold text-intent-success-text">
                        <span>You&apos;ve earned</span>
                        {claimable.map((segment, index) => (
                            <span
                                key={segment.kind}
                                className="flex items-center gap-1.5"
                            >
                                {index > 0 && (
                                    <span
                                        aria-hidden="true"
                                        className="opacity-60"
                                    >
                                        ·
                                    </span>
                                )}
                                <WalletKindIcon kind={segment.kind} />
                                <span
                                    className={`tabular-nums ${BUCKET_TEXT_CLASS[segment.kind]}`}
                                >
                                    {formatRewardAmount(segment.pollen)} pollen
                                </span>
                            </span>
                        ))}
                        <span>— claim it now</span>
                    </div>
                )}
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

            {CATEGORIES.map((category) => {
                const cards = sections[category.key];
                if (cards.length === 0) return null;
                const done = cards.filter(
                    (card) => card.status !== "open",
                ).length;
                return (
                    <section key={category.key} className="flex flex-col gap-3">
                        <SectionHeader
                            category={category}
                            done={done}
                            total={cards.length}
                        />
                        <Surface
                            variant="panel"
                            className="flex flex-col gap-2"
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
                        </Surface>
                    </section>
                );
            })}
        </div>
    );
};
