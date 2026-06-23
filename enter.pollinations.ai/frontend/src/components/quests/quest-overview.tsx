import {
    Button,
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
function formatGrantAmount(value: number | null): string {
    if (value == null) return "TBD";
    const formatted = formatPollen(value);
    if (value > 0 && formatted === "0") return "<0.0001";
    return formatted;
}

function questStatusAccent(completed: boolean): string {
    return completed
        ? "var(--color-theme-text-muted)"
        : "var(--color-intent-warning-text)";
}

function rewardIconKind(
    balanceBucket: string | null | undefined,
): RewardIconKind {
    return balanceBucket === "paid" || balanceBucket === "pack"
        ? "paid"
        : "tier";
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
    balanceBucket?: string | null;
    completed: boolean;
    earnedAmount?: number | null;
};

// ── Presentational primitives (composed from @pollinations/ui) ───────────────

// Two top-line metrics — positive achievement stats, so the icon + label wear
// the success (green) accent; the bold value stays neutral as the focal point.
function SummaryMetricCard({
    icon: Icon,
    label,
    value,
}: {
    icon: IconComponent;
    label: string;
    value: React.ReactNode;
}) {
    return (
        <Surface variant="card" className="flex items-center gap-4">
            <Icon className="h-10 w-10 shrink-0 text-intent-success-text" />
            <StatCard
                className="min-w-0 flex-1"
                label={label}
                labelClassName="text-intent-success-text"
                value={value}
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
            <Chip intent="neutral" size="sm" className="tabular-nums">
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

// Leading marker for a quest row. Completed earns the success (green) tint with
// a check; open is a neutral square with its section icon. The icon rides
// currentColor from the square's text tone.
function QuestMarker({
    icon: Icon,
    completed,
}: {
    icon: IconComponent;
    completed: boolean;
}) {
    const MarkerIcon = completed ? CheckIcon : Icon;
    return (
        <span
            aria-hidden="true"
            className={`flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] ${
                completed
                    ? "bg-intent-success-bg-light text-intent-success-text"
                    : "bg-ink-900/80 text-ink-100"
            }`}
        >
            <MarkerIcon className="h-5 w-5" />
        </span>
    );
}

function QuestRow({ card, icon }: { card: QuestCard; icon: IconComponent }) {
    const accent = questStatusAccent(card.completed);
    const rewardAmount = card.completed
        ? (card.earnedAmount ?? card.reward)
        : card.reward;
    const rewardIcon = rewardIconKind(card.balanceBucket);
    const rewardLabel =
        rewardAmount == null
            ? "Reward TBD"
            : `${formatGrantAmount(rewardAmount)} pollen`;

    // Shared pieces, placed differently per breakpoint below.
    const title = (
        <Text
            as="span"
            weight="semibold"
            tone={card.completed ? "muted" : "strong"}
        >
            {card.title}
        </Text>
    );
    const description =
        !card.completed && card.description ? card.description : null;
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
    const reward = (
        <>
            {card.completed && (
                // Reward earned but not yet claimed — opens the claim flow
                // (handler wiring lands in a follow-up).
                <Button type="button">Claim</Button>
            )}
            <Chip intent="neutral" size="sm" className="gap-1 tabular-nums">
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
                        <QuestMarker icon={icon} completed={card.completed} />
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
                <QuestMarker icon={icon} completed={card.completed} />
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
            const grant = completed ? grantByKey.get(quest.id) : undefined;
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
                balanceBucket:
                    "balanceBucket" in quest &&
                    typeof quest.balanceBucket === "string"
                        ? quest.balanceBucket
                        : "tier",
                completed,
                earnedAmount: completed
                    ? (grant?.pollenCredited ?? quest.rewardAmount)
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

    const questsDone = state.grants.length;

    return (
        <div className="flex flex-col gap-6">
            <Surface variant="panel">
                <div className="grid gap-3 sm:grid-cols-2">
                    <SummaryMetricCard
                        icon={TargetIcon}
                        label="Completed quests"
                        value={
                            <span className="tabular-nums">{questsDone}</span>
                        }
                    />
                    <SummaryMetricCard
                        icon={SproutIcon}
                        label="Pollen earned"
                        value={
                            <span className="tabular-nums">
                                {formatGrantAmount(state.totalPollen)}
                            </span>
                        }
                    />
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
