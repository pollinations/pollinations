import {
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
    StatCard,
    Surface,
    Text,
    TrendUpIcon,
} from "@pollinations/ui";
import {
    formatPollen,
    TierChip,
    WalletKindIcon,
} from "@pollinations/ui/wallet";
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

type QuestGrant = {
    questId: string | null;
    title: string;
    pollenCredited: number;
    balanceBucket: string;
    createdAt: string;
};

type QuestOverviewProps = Record<string, never>;

type FetchState = {
    catalog: QuestCatalogItem[];
    grants: QuestGrant[];
    totalPollen: number;
    loading: boolean;
    error: string | null;
};

const INITIAL_STATE: FetchState = {
    catalog: [],
    grants: [],
    totalPollen: 0,
    loading: true,
    error: null,
};

type IconComponent = ComponentType<{ className?: string }>;

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
function formatGrantAmount(value: number | null): string {
    if (value == null) return "TBD";
    const formatted = formatPollen(value);
    if (value > 0 && formatted === "0") return "<0.0001";
    return formatted;
}

function formatRewardLabel(value: number | null): string {
    return value == null ? "Reward TBD" : `${formatGrantAmount(value)} pollen`;
}

// ── Card model ──────────────────────────────────────────────────────────────
// A single quest row, whether it comes from the catalog (open quests) or from a
// reward grant (completed). Open shows its reward; completed flips to a green
// check + the banked amount.
type QuestCard = {
    key: string;
    title: string;
    description?: string;
    url?: string;
    issueNumber?: number;
    reward: number | null;
    completed: boolean;
    earnedAmount?: number | null;
};

// ── Presentational primitives (composed from @pollinations/ui) ───────────────

// Progress ring (conic-gradient) with a neutral icon in the hole. Mirrors the
// dashboard summary ring; the hole matches the card surface so only the rim
// reads as progress.
function ProgressRing({
    percent,
    icon: Icon,
}: {
    percent: number;
    icon: IconComponent;
}) {
    const clamped = Math.max(0, Math.min(100, percent));
    return (
        <span
            role="progressbar"
            aria-label="Quest completion"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={clamped}
            className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-intent-success-text"
            style={{
                background: `conic-gradient(currentColor ${clamped * 3.6}deg, var(--color-theme-bg-active) 0)`,
            }}
        >
            <span className="absolute inset-1 rounded-full bg-theme-bg-pale" />
            <Icon className="relative h-6 w-6" />
        </span>
    );
}

function SummaryCard({
    ring,
    label,
    value,
    detail,
}: {
    ring: React.ReactNode;
    label: string;
    value: React.ReactNode;
    detail: string;
}) {
    return (
        <Surface variant="card-themed" className="flex items-center gap-4">
            {ring}
            <StatCard
                className="min-w-0 flex-1"
                label={label}
                value={value}
                detail={detail}
            />
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
            <TierChip size="sm" className="tabular-nums">
                {done} / {total}
            </TierChip>
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

// Leading marker for a quest row, wearing its section's icon. Tier green while
// open; shifts to the success tint once completed — the icon inherits the color
// via currentColor. Set inline so it beats the icon's own polli:-prefixed
// classes without a specificity fight.
function QuestMarker({
    icon: Icon,
    completed,
}: {
    icon: IconComponent;
    completed: boolean;
}) {
    return (
        <span
            aria-hidden="true"
            className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] transition-colors"
            style={{
                backgroundColor: completed
                    ? "var(--color-intent-success-bg-light)"
                    : "var(--polli-color-tier-pale)",
                color: completed
                    ? "var(--color-intent-success-text)"
                    : "var(--polli-color-tier-deep)",
            }}
        >
            <Icon className="h-5 w-5" />
        </span>
    );
}

function QuestRow({ card, icon }: { card: QuestCard; icon: IconComponent }) {
    // Per-row accent matches the marker: tier green while open, success green once
    // completed. Applied inline so it overrides the primitives' own
    // polli:-prefixed color classes without a specificity fight.
    const accent = card.completed
        ? "var(--color-intent-success-text)"
        : "var(--polli-color-tier-deep)";
    return (
        <Surface variant="card" className="flex items-center gap-4">
            <QuestMarker icon={icon} completed={card.completed} />
            <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                    <Text
                        as="span"
                        weight="semibold"
                        tone={card.completed ? "muted" : "strong"}
                    >
                        {card.title}
                    </Text>
                    {card.issueNumber != null && card.url && (
                        <InlineLink
                            href={card.url}
                            showIcon={false}
                            className="text-sm tabular-nums"
                            style={{ color: accent }}
                        >
                            #{card.issueNumber}
                        </InlineLink>
                    )}
                    {card.completed && (
                        <Chip intent="success" size="sm" className="gap-1">
                            <CheckIcon className="h-3 w-3 shrink-0" />
                            Completed
                        </Chip>
                    )}
                </div>
                {!card.completed && card.description && (
                    <Text size="sm" tone="muted" className="mt-1">
                        {card.description}
                    </Text>
                )}
            </div>
            <div className="flex shrink-0 items-center gap-2.5">
                {card.completed ? (
                    <Text
                        as="span"
                        size="sm"
                        className="tabular-nums"
                        style={{ color: accent }}
                    >
                        +{formatGrantAmount(card.earnedAmount ?? card.reward)}{" "}
                        pollen
                    </Text>
                ) : (
                    <TierChip size="sm" className="tabular-nums">
                        <WalletKindIcon kind="tier" />
                        {formatRewardLabel(card.reward)}
                    </TierChip>
                )}
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
                const [catalogResponse, grantsResponse] = await Promise.all([
                    apiClient.quests.catalog.$get(),
                    apiClient.account.quests.$get(),
                ]);
                if (cancelled) return;
                if (!catalogResponse.ok || !grantsResponse.ok) {
                    setState({
                        ...INITIAL_STATE,
                        loading: false,
                        error: `Failed to load quests (${catalogResponse.status}/${grantsResponse.status})`,
                    });
                    return;
                }
                const catalog =
                    (await catalogResponse.json()) as QuestCatalogResponse;
                const rewards = (await grantsResponse.json()) as {
                    totalPollen: number;
                    grants: QuestGrant[];
                };
                if (cancelled) return;
                setState({
                    catalog: catalog.quests ?? [],
                    grants: rewards.grants ?? [],
                    totalPollen: rewards.totalPollen ?? 0,
                    loading: false,
                    error: null,
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

    // A grant's questId IS the catalog id it completed (one grant == one quest),
    // so the completed-set / grant lookup key directly off questId.
    const completedCatalogIds = useMemo(
        () =>
            new Set(
                state.grants
                    .map((grant) => grant.questId)
                    .filter((id): id is string => id != null),
            ),
        [state.grants],
    );
    const grantByKey = useMemo(() => {
        const map = new Map<string, QuestGrant>();
        for (const grant of state.grants) {
            if (grant.questId) map.set(grant.questId, grant);
        }
        return map;
    }, [state.grants]);

    // Build the per-category quest rows from the catalog — ONE uniform pass, no
    // per-lane special-casing. The catalog is the single source of truth: every
    // quest (onboarding, GitHub, issue bounty, easter egg) is one card. Grants
    // only tell us "did YOU earn it" + the banked amount.
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
            const completed = completedCatalogIds.has(quest.id);
            // The single visibility rule: a card shows if it's on the open board
            // (availability "available"), OR if YOU earned it. So a claimed or
            // completed issue, and a per-person easter egg you didn't earn,
            // disappear for everyone except the user who completed it.
            if (quest.availability !== "available" && !completed) continue;

            byCat[quest.category].push({
                key: quest.id,
                title: quest.title,
                description: quest.description || undefined,
                url: quest.url || undefined,
                issueNumber: issueNumberFromId(quest.id) ?? undefined,
                reward: quest.rewardAmount,
                completed,
                earnedAmount: completed
                    ? (grantByKey.get(quest.id)?.pollenCredited ??
                      quest.rewardAmount)
                    : undefined,
            });
        }

        // Banked wins float to the top of each lane (the progress cue), then by
        // reward.
        for (const key of Object.keys(byCat) as CategoryKey[]) {
            byCat[key].sort((a, b) => {
                if (a.completed !== b.completed) return a.completed ? -1 : 1;
                return (
                    (a.reward ?? Number.POSITIVE_INFINITY) -
                    (b.reward ?? Number.POSITIVE_INFINITY)
                );
            });
        }
        return byCat;
    }, [state.catalog, completedCatalogIds, grantByKey]);

    // One roll-up across every lane: quests done / shown, and total pollen
    // earned (the authoritative sum from the grants endpoint).
    const allCards = [
        ...sections.setup,
        ...sections.grow,
        ...sections.build,
        ...sections.contribute,
        ...sections.community,
        ...sections.easteregg,
    ];
    const questsDone = allCards.filter((card) => card.completed).length;
    const questsTotal = allCards.length;
    const progressPercent =
        questsTotal > 0 ? Math.round((questsDone / questsTotal) * 100) : 0;

    return (
        <div className="flex flex-col gap-6">
            <SummaryCard
                ring={
                    <ProgressRing percent={progressPercent} icon={CheckIcon} />
                }
                label="Quest progress"
                value={
                    <span className="tabular-nums">
                        {questsDone} of {questsTotal}
                    </span>
                }
                detail={`${formatGrantAmount(state.totalPollen)} pollen earned`}
            />

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
                const done = cards.filter((card) => card.completed).length;
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
