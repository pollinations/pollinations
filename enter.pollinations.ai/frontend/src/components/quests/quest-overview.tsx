import {
    Button,
    CardIcon,
    CheckIcon,
    Chip,
    ClockIcon,
    CodeIcon,
    DiscordIcon,
    GitHubIcon,
    Heading,
    InlineLink,
    KeyIcon,
    SproutIcon,
    Surface,
    TargetIcon,
    Text,
    TrendUpIcon,
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
        icon: KeyIcon,
    },
    {
        key: "grow",
        label: "Grow",
        blurb: "Grow your usage and revenue from apps.",
        icon: TrendUpIcon,
    },
    {
        key: "build",
        label: "Build",
        blurb: "Your standing as a developer: GitHub, stars, and PRs.",
        icon: CodeIcon,
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
type QuestCardStatus = "open" | "claimable" | "claimed";

type QuestCard = {
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

// Bucket-neutral pollen mark — a small blossom. Distinct from the tier sprout
// and the paid card; stands for aggregate/generic pollen and prefixes pollen
// amounts. TODO: promote to @pollinations/ui once the shape is settled.
function PollenIcon({ className }: { className?: string }) {
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
            <circle cx="12" cy="6.8" r="2.8" />
            <circle cx="17" cy="10.4" r="2.8" />
            <circle cx="15.1" cy="16.2" r="2.8" />
            <circle cx="8.9" cy="16.2" r="2.8" />
            <circle cx="7" cy="10.4" r="2.8" />
            <circle cx="12" cy="12" r="2.2" />
        </svg>
    );
}

// A 4-point sparkle — the joyful "you earned it" mark for the Claim button.
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
            <path d="M12 3 L13.7 10.3 L21 12 L13.7 13.7 L12 21 L10.3 13.7 L3 12 L10.3 10.3 Z" />
        </svg>
    );
}

// A single value in its bucket color — amber (paid) or green (tier).
function BucketNumber({
    kind,
    children,
}: {
    kind: RewardIconKind;
    children: React.ReactNode;
}) {
    return (
        <span
            className={`text-2xl font-bold leading-none tabular-nums ${BUCKET_TEXT_CLASS[kind]}`}
        >
            {children}
        </span>
    );
}

// One summary metric: a big icon + label, with the paid and tier values side by
// side beneath it. Grouping each metric with its own numbers keeps the value
// reading straight off the label.
function MetricSummaryCard({
    icon: Icon,
    label,
    paid,
    tier,
}: {
    icon: IconComponent;
    label: string;
    paid: React.ReactNode;
    tier: React.ReactNode;
}) {
    return (
        <Surface variant="card" className="flex items-center gap-4">
            <Icon className="h-10 w-10 shrink-0 text-theme-text-base" />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <Text
                    as="span"
                    size="micro"
                    weight="bold"
                    tone="muted"
                    className="uppercase tracking-wide"
                >
                    {label}
                </Text>
                <div className="flex items-center gap-3">
                    <BucketNumber kind="paid">{paid}</BucketNumber>
                    <span
                        aria-hidden="true"
                        className="h-7 self-center border-l border-divider"
                    />
                    <BucketNumber kind="tier">{tier}</BucketNumber>
                </div>
            </div>
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

// Leading marker for a quest row. Earned rewards get the switch's vivid "on"
// green with a light check — the same success affordance as the auto top-up
// toggle — so "done" reads as a real success state, not a tier tint. Open is a
// neutral dark square with its section icon. The icon rides currentColor.
function QuestMarker({
    icon: Icon,
    active,
}: {
    icon: IconComponent;
    active: boolean;
}) {
    const MarkerIcon = active ? CheckIcon : Icon;
    return (
        <span
            aria-hidden="true"
            className={`flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] ${
                active
                    ? "bg-switch-track-on text-switch-thumb"
                    : "bg-ink-900/80 text-ink-100"
            }`}
        >
            <MarkerIcon className="h-5 w-5" />
        </span>
    );
}

function QuestRow({
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
                className={`gap-1 tabular-nums ${BUCKET_TEXT_CLASS[rewardIcon]}`}
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
                        <QuestMarker icon={icon} active={earned} />
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
                <QuestMarker icon={icon} active={earned} />
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
                <div className="grid gap-3 sm:grid-cols-2">
                    <MetricSummaryCard
                        icon={TargetIcon}
                        label="Completed quests"
                        paid={bucketStats.paid.completed}
                        tier={bucketStats.tier.completed}
                    />
                    <MetricSummaryCard
                        icon={PollenIcon}
                        label="Pollen earned"
                        paid={formatRewardAmount(bucketStats.paid.pollen)}
                        tier={formatRewardAmount(bucketStats.tier.pollen)}
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
