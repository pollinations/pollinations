import {
    CheckIcon,
    Chip,
    ClockIcon,
    GitBranchIcon,
    GraduationCapIcon,
    Heading,
    InlineLink,
    RocketIcon,
    SproutIcon,
    StatCard,
    Surface,
    TargetIcon,
    Text,
    TrendUpIcon,
} from "@pollinations/ui";
import {
    formatPollen,
    PaidChip,
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

// One-off team-welcome easter egg — rendered as a celebratory hero card rather
// than a normal quest, and kept out of the category lists below.
const INTERN_QUEST_ID = "easteregg:elixpo_intern";

// Gold accent for icons — the wallet "paid" deep tone. Theme-aware (dark bronze
// in light mode, light gold in dark), so it keeps contrast on the pale tile in
// both modes — same token the wallet's paid icon/text uses.
const GOLD = "text-[color:var(--polli-color-paid-deep)]";

// ── Category model ──────────────────────────────────────────────────────────
// Four lanes, mapped from the backend's quest.category. Set up · Grow · Dev are
// finite (everyone can clear them) and feed the "Quest progress" summary;
// Contribute is an open bounty pool (issues + PRs) and feeds "Contribute score".
// The Dev lane has no category mapped to it yet — it renders empty / hidden by
// the existing empty-section handling until the backend ships dev quests.
type CategoryKey = "setup" | "grow" | "dev" | "contribute";

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
        icon: TrendUpIcon,
    },
    {
        key: "dev",
        label: "Dev",
        blurb: "Your standing as a developer on GitHub.",
        icon: GraduationCapIcon,
    },
    {
        key: "contribute",
        label: "Contribute",
        blurb: "Help build Pollinations — issues and PRs.",
        icon: GitBranchIcon,
    },
];

// Map the backend's quest.category onto a visual lane. "dev" is intentionally
// unmapped for now — nothing routes there yet (see the Category model note).
function categoryKeyFor(category: QuestCatalogItem["category"]): CategoryKey {
    switch (category) {
        case "plant":
            return "setup";
        case "community":
            return "contribute";
        default:
            return "grow";
    }
}

// Grants don't carry an iconId, so split on the only axis the summaries need:
// is this a Contribute (GitHub issue) reward, or a normal quest reward?
function isContributeGrant(grant: QuestGrant): boolean {
    return grant.questId?.startsWith("github:") ?? false;
}

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

function formatTimestamp(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
    });
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

// Tinted circular icon holder (gold) for the Contribute summary card.
function IconMedallion({ icon: Icon }: { icon: IconComponent }) {
    return (
        <span
            className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-theme-bg-active ${GOLD}`}
        >
            <Icon className="h-6 w-6" />
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
    openCount,
}: {
    category: CategoryMeta;
    done: number;
    total: number;
    // Open bounty pools (Contribute) show "N open" instead of a done/total
    // ratio that would recede as the pool grows.
    openCount?: number;
}) {
    return (
        <div className="flex items-center justify-between gap-4 px-1">
            <Heading as="h2" size="section">
                {category.label}
            </Heading>
            <PaidChip size="sm" className="tabular-nums">
                {openCount != null ? `${openCount} open` : `${done} / ${total}`}
            </PaidChip>
        </div>
    );
}

function SectionFooter({ category }: { category: CategoryMeta }) {
    const Icon = category.icon;
    if (category.key === "contribute") {
        return (
            <div className="mt-4 flex items-center gap-2 border-t border-divider pt-4 text-theme-text-muted">
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <Text as="p" size="sm" tone="muted">
                    Want to help build Pollinations? Comment on a Contribute
                    issue if you'd like to work on it.
                </Text>
            </div>
        );
    }

    return (
        <div className="mt-4 flex items-center gap-1.5 border-t border-divider pt-4 text-theme-text-muted">
            <Icon className="h-3.5 w-3.5 shrink-0" />
            <Text as="span" size="sm" tone="muted">
                {category.blurb}
            </Text>
        </div>
    );
}

// Leading marker for a quest row, wearing its section's icon (Set up · Grow ·
// Dev · Contribute). Paid gold while open; shifts to the success tint once
// completed — the icon inherits the color via currentColor. Set inline so it
// beats the icon's own polli:-prefixed classes without a specificity fight.
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
                    : "var(--polli-color-paid-pale)",
                color: completed
                    ? "var(--color-intent-success-text)"
                    : "var(--polli-color-paid-deep)",
            }}
        >
            <Icon className="h-5 w-5" />
        </span>
    );
}

function QuestRow({ card, icon }: { card: QuestCard; icon: IconComponent }) {
    // Per-row accent matches the marker: paid gold while open, success green once
    // completed. Applied inline (like InternHeroCard below) so it overrides the
    // primitives' own polli:-prefixed color classes without a specificity fight.
    const accent = card.completed
        ? "var(--color-intent-success-text)"
        : "var(--polli-color-paid-deep)";
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
                    <PaidChip size="sm" className="tabular-nums">
                        <WalletKindIcon kind="paid" />
                        {formatRewardLabel(card.reward)}
                    </PaidChip>
                )}
            </div>
        </Surface>
    );
}

// Celebratory hero card for the one-off intern easter egg. Uses the wallet
// "paid" gold palette so the gradient stays on-brand and theme-aware.
function InternHeroCard({ grant }: { grant: QuestGrant }) {
    const title = grant.title;
    const message = "Welcome to the Pollinations crew.";
    const deep = "var(--polli-color-paid-deep)";

    return (
        <div
            className="relative overflow-hidden rounded-xl p-5 shadow-well"
            style={{
                background:
                    "linear-gradient(135deg, var(--polli-color-paid-pale), color-mix(in oklch, var(--polli-color-paid-soft) 35%, var(--polli-color-paid-pale)))",
                boxShadow:
                    "inset 0 0 0 1px color-mix(in oklch, var(--polli-color-paid-soft) 45%, transparent)",
                color: deep,
            }}
        >
            <div className="relative flex items-start gap-3">
                <span
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
                    style={{
                        backgroundColor:
                            "color-mix(in oklch, var(--polli-color-paid-soft) 30%, transparent)",
                        color: deep,
                    }}
                >
                    <SproutIcon className="h-6 w-6" />
                </span>
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <PaidChip size="sm" className="uppercase tracking-wide">
                            <WalletKindIcon kind="paid" />
                            Intern
                        </PaidChip>
                        <Text as="span" size="xs" style={{ color: deep }}>
                            {formatTimestamp(grant.createdAt)}
                        </Text>
                    </div>
                    <Text
                        as="div"
                        weight="bold"
                        className="mt-2 text-lg"
                        style={{ color: deep }}
                    >
                        {title}
                    </Text>
                    <Text
                        as="div"
                        size="sm"
                        className="mt-0.5"
                        style={{ color: deep }}
                    >
                        {message}
                    </Text>
                </div>
                <Text
                    as="span"
                    weight="bold"
                    className="shrink-0 text-lg tabular-nums"
                    style={{ color: deep }}
                >
                    +{formatGrantAmount(grant.pollenCredited)}
                </Text>
            </div>
        </div>
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

    const catalogById = useMemo(
        () => new Map(state.catalog.map((quest) => [quest.id, quest])),
        [state.catalog],
    );
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

    // Build the per-category quest rows. Finite categories come straight from
    // the catalog (open or completed). Contribute mixes open catalog issues
    // with the user's own completed issue grants.
    const sections = useMemo(() => {
        const byCat: Record<CategoryKey, QuestCard[]> = {
            setup: [],
            grow: [],
            dev: [],
            contribute: [],
        };

        // TODO(quests): the "Dev" lane has no backend data source yet — the
        // backend's quest.category only emits plant/grow/community. Until a
        // real Dev category ships, seed it with OBVIOUSLY-FAKE placeholder
        // cards so the lane renders during design. Delete this whole block the
        // moment real Dev quests exist.
        byCat.dev.push(
            {
                key: "dummy:dev:1",
                title: "🚧 DUMMY — Dev quest placeholder",
                description: "Fake card. No backend data wired yet.",
                reward: 0,
                completed: false,
            },
            {
                key: "dummy:dev:2",
                title: "🚧 DUMMY — another fake Dev quest",
                description: "Placeholder only — remove before launch.",
                reward: 0,
                completed: true,
                earnedAmount: 0,
            },
        );

        for (const quest of state.catalog) {
            if (quest.id.startsWith("easteregg:")) continue;
            const key = categoryKeyFor(quest.category);
            if (key === "contribute") {
                // Three states, kept deliberately simple:
                //   available — open bounty, anyone can take it → SHOW
                //   claimed   — someone is working it (not paid to you) → HIDE
                //   completed — surfaces below via YOUR own grant → skip here
                // So an issue you don't have a grant for only appears while it's
                // still unclaimed; once claimed it leaves the board, and it
                // returns (as completed) only if you were the one paid.
                if (quest.availability !== "available") continue;
                byCat.contribute.push({
                    key: quest.id,
                    title: quest.title,
                    description: quest.description || undefined,
                    url: quest.url || undefined,
                    issueNumber: issueNumberFromId(quest.id) ?? undefined,
                    reward: quest.rewardAmount,
                    completed: false,
                });
                continue;
            }
            const completed = completedCatalogIds.has(quest.id);
            byCat[key].push({
                key: quest.id,
                title: quest.title,
                description: quest.description || undefined,
                url: quest.url || undefined,
                reward: quest.rewardAmount,
                completed,
                earnedAmount: completed
                    ? (grantByKey.get(quest.id)?.pollenCredited ??
                      quest.rewardAmount)
                    : undefined,
            });
        }

        for (const grant of state.grants) {
            if (grant.questId === INTERN_QUEST_ID) continue;
            if (!isContributeGrant(grant)) continue;
            const issueNumber = issueNumberFromId(grant.questId ?? "");
            byCat.contribute.push({
                key: `grant-${grant.questId ?? "quest"}-${grant.createdAt}`,
                title: grant.title,
                url: catalogById.get(grant.questId ?? "")?.url || undefined,
                issueNumber: issueNumber ?? undefined,
                reward: grant.pollenCredited,
                completed: true,
                earnedAmount: grant.pollenCredited,
            });
        }

        // Finite lanes: banked wins first (the progress cue). Contribute: open
        // bounties first (the actionable pool), completed at the bottom.
        for (const key of Object.keys(byCat) as CategoryKey[]) {
            const completedFirst = key !== "contribute";
            byCat[key].sort((a, b) => {
                if (a.completed !== b.completed) {
                    const aRank = a.completed ? 0 : 1;
                    const bRank = b.completed ? 0 : 1;
                    return completedFirst ? aRank - bRank : bRank - aRank;
                }
                return (
                    (a.reward ?? Number.POSITIVE_INFINITY) -
                    (b.reward ?? Number.POSITIVE_INFINITY)
                );
            });
        }
        return byCat;
    }, [
        state.catalog,
        state.grants,
        completedCatalogIds,
        grantByKey,
        catalogById,
    ]);

    const internGrants = useMemo(
        () => state.grants.filter((grant) => grant.questId === INTERN_QUEST_ID),
        [state.grants],
    );

    // Summary stats. "Quest progress" = the three finite lanes; "Contribute
    // score" = the open bounty pool. Pollen is split on the same axis.
    const finiteCards = [...sections.setup, ...sections.grow, ...sections.dev];
    const finiteDone = finiteCards.filter((card) => card.completed).length;
    const finiteTotal = finiteCards.length;
    const progressPercent =
        finiteTotal > 0 ? Math.round((finiteDone / finiteTotal) * 100) : 0;

    const questPollen = state.grants
        .filter((grant) => !isContributeGrant(grant))
        .reduce((sum, grant) => sum + grant.pollenCredited, 0);
    const contributePollen = state.grants
        .filter(isContributeGrant)
        .reduce((sum, grant) => sum + grant.pollenCredited, 0);
    const contributeDone = sections.contribute.filter(
        (card) => card.completed,
    ).length;
    const contributeOpen = sections.contribute.length - contributeDone;

    return (
        <div className="flex flex-col gap-6">
            <div className="grid gap-3 sm:grid-cols-2">
                <SummaryCard
                    ring={
                        <ProgressRing
                            percent={progressPercent}
                            icon={TargetIcon}
                        />
                    }
                    label="Quest progress"
                    value={
                        <span className="tabular-nums">
                            {finiteDone} of {finiteTotal}
                        </span>
                    }
                    detail={`${formatGrantAmount(questPollen)} pollen earned`}
                />
                <SummaryCard
                    ring={<IconMedallion icon={GitBranchIcon} />}
                    label="Contribute score"
                    value={
                        <span className="tabular-nums">
                            {formatGrantAmount(contributePollen)} pollen
                        </span>
                    }
                    detail={`${contributeDone} completed · ${contributeOpen} open`}
                />
            </div>

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

            {internGrants.map((grant, index) => (
                <InternHeroCard
                    key={`intern-${grant.createdAt}-${index}`}
                    grant={grant}
                />
            ))}

            {CATEGORIES.map((category) => {
                const cards = sections[category.key];
                if (cards.length === 0) return null;
                const isContribute = category.key === "contribute";
                const done = cards.filter((card) => card.completed).length;
                return (
                    <section key={category.key} className="flex flex-col gap-3">
                        <SectionHeader
                            category={category}
                            done={done}
                            total={cards.length}
                            openCount={
                                isContribute ? cards.length - done : undefined
                            }
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
