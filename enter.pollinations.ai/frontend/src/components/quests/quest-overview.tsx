import {
    AppIcon,
    CheckIcon,
    Chip,
    ClockIcon,
    GitHubIcon,
    InlineLink,
    KeyIcon,
    SproutIcon,
    Surface,
    TabButton,
    Text,
    WalletIcon,
} from "@pollinations/ui";
import {
    formatPollen,
    PaidChip,
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
    source: string;
    questId: string | null;
    pollenCredited: number;
    balanceBucket: string;
    sourceRef: string | null;
    metadata: Record<string, unknown> | null;
    createdAt: string;
};

type QuestTab = "available" | "completed";

type QuestOverviewProps = {
    githubUsername?: string | null;
};

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

// Category metadata decoded from the quest id prefix (onboarding: / spend: /
// grow: / github:). Drives section grouping, ordering, and the icon medallion.
// Pure display logic — no new backend data.
type CategoryKey = "plant" | "grow" | "community";

type CategoryMeta = {
    key: CategoryKey;
    label: string;
    blurb: string;
    icon: IconComponent;
    order: number;
    tint: string;
};

const CATEGORY_PLANT: CategoryMeta = {
    key: "plant",
    label: "Set up",
    blurb: "Get started",
    icon: SproutIcon,
    order: 0,
    tint: "text-intent-success-text",
};
const CATEGORY_GROW: CategoryMeta = {
    key: "grow",
    label: "Grow",
    blurb: "Use more, earn more",
    icon: WalletIcon,
    order: 1,
    tint: "text-intent-news-text",
};
const CATEGORY_COMMUNITY: CategoryMeta = {
    key: "community",
    label: "Community",
    blurb: "Build for the community",
    icon: GitHubIcon,
    order: 2,
    tint: "text-theme-text-soft",
};

const CATEGORY_ORDER: CategoryMeta[] = [
    CATEGORY_PLANT,
    CATEGORY_GROW,
    CATEGORY_COMMUNITY,
];

function categoryForQuest(quest: QuestCatalogItem): CategoryMeta {
    const id = quest.id;
    if (id.startsWith("github:") || quest.kind === "github_issue") {
        return CATEGORY_COMMUNITY;
    }
    if (id.startsWith("onboarding:")) return CATEGORY_PLANT;
    // spend: + grow: + anything else product-y maps to the middle "Grow" lane.
    return CATEGORY_GROW;
}

// Per-quest icon medallion. More specific than the category icon where the id
// makes the intent obvious.
function iconForQuest(quest: QuestCatalogItem): IconComponent {
    const id = quest.id;
    if (id.startsWith("github:") || quest.kind === "github_issue") {
        return GitHubIcon;
    }
    if (id.includes("api_key") || id.includes("first_api_key")) return KeyIcon;
    if (id.startsWith("spend:") || id.includes("top_up")) return WalletIcon;
    if (id.includes("github_account")) return GitHubIcon;
    if (id.startsWith("grow:") || id.includes("list_app")) return AppIcon;
    return SproutIcon;
}

function formatGrantAmount(value: number | null): string {
    if (value == null) return "TBD";
    const formatted = formatPollen(value);
    if (value > 0 && formatted === "0") return "<0.0001";
    return formatted;
}

function formatRewardLabel(value: number | null): string {
    return value == null ? "Reward TBD" : `${formatGrantAmount(value)} Pollen`;
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

function metadataString(
    metadata: Record<string, unknown> | null,
    key: string,
): string | null {
    const value = metadata?.[key];
    return typeof value === "string" && value.length > 0 ? value : null;
}

function metadataNumber(
    metadata: Record<string, unknown> | null,
    key: string,
): number | null {
    const value = metadata?.[key];
    return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function humanizeSlug(slug: string): string {
    const tail = slug.includes(":")
        ? slug.slice(slug.lastIndexOf(":") + 1)
        : slug;
    const words = tail.replace(/[_-]+/g, " ").trim();
    if (!words) return slug;
    return words.charAt(0).toUpperCase() + words.slice(1);
}

function catalogKeyForGrant(grant: QuestGrant): string | null {
    const issueNumber = metadataNumber(grant.metadata, "issueNumber");
    if (
        grant.questId === "github:community_issue_quest" &&
        issueNumber != null
    ) {
        return `github:issue:${issueNumber}`;
    }
    return grant.questId;
}

function grantTitle(
    grant: QuestGrant,
    catalogById: Map<string, QuestCatalogItem>,
): string {
    const catalogKey = catalogKeyForGrant(grant);
    const catalogItem = catalogKey ? catalogById.get(catalogKey) : null;
    if (catalogItem) return catalogItem.title;
    return (
        metadataString(grant.metadata, "issueTitle") ??
        metadataString(grant.metadata, "title") ??
        metadataString(grant.metadata, "appName") ??
        (grant.questId
            ? humanizeSlug(grant.questId)
            : humanizeSlug(grant.source))
    );
}

function grantUrl(
    grant: QuestGrant,
    catalogById: Map<string, QuestCatalogItem>,
): string | null {
    const catalogKey = catalogKeyForGrant(grant);
    const catalogItem = catalogKey ? catalogById.get(catalogKey) : null;
    return (
        metadataString(grant.metadata, "appUrl") ??
        catalogItem?.url ??
        metadataString(grant.metadata, "issueUrl")
    );
}

function grantLinkLabel(grant: QuestGrant): string {
    if (metadataString(grant.metadata, "appUrl")) return "Open app";
    if (metadataString(grant.metadata, "issueUrl")) return "View on GitHub";
    return "View details";
}

function grantLinkIsGitHub(grant: QuestGrant): boolean {
    return (
        !metadataString(grant.metadata, "appUrl") &&
        Boolean(metadataString(grant.metadata, "issueUrl"))
    );
}

function grantContext(grant: QuestGrant): string | null {
    const appName = metadataString(grant.metadata, "appName");
    const issueNumber = metadataNumber(grant.metadata, "issueNumber");
    const prNumber = metadataNumber(grant.metadata, "prNumber");
    const githubUsername = metadataString(grant.metadata, "githubUsername");
    const parts: string[] = [];
    if (appName) parts.push(`App: ${appName}`);
    if (issueNumber != null) parts.push(`Issue #${issueNumber}`);
    if (prNumber != null) parts.push(`PR #${prNumber}`);
    if (githubUsername) parts.push(`@${githubUsername}`);
    return parts.length ? parts.join(" · ") : null;
}

function BalanceBucketChip({ bucket }: { bucket: string }) {
    if (bucket === "tier") return <TierChip size="sm">tier</TierChip>;
    if (bucket === "pack") return <PaidChip size="sm">pack</PaidChip>;
    return (
        <Chip size="sm" intent="neutral">
            {bucket}
        </Chip>
    );
}

// Tinted circular icon holder left of each quest. The single biggest visual
// delta from the old flat-row look.
function IconMedallion({
    icon: Icon,
    tint,
    completed = false,
}: {
    icon: IconComponent;
    tint: string;
    completed?: boolean;
}) {
    return (
        <span
            className={[
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
                completed
                    ? "bg-intent-success-bg-light text-intent-success-text"
                    : `bg-theme-bg-active ${tint}`,
            ].join(" ")}
        >
            {completed ? (
                <CheckIcon className="h-5 w-5" />
            ) : (
                <Icon className="h-5 w-5" />
            )}
        </span>
    );
}

// Reward chip: the canonical wallet "paid" chip with its Pollen marker.
// Uses @pollinations/ui's PaidChip + WalletKindIcon so the reward reads in the
// same visual language as balances elsewhere in the dashboard.
function RewardChip({ amount }: { amount: number | null }) {
    return (
        <PaidChip size="sm" className="tabular-nums">
            <WalletKindIcon kind="paid" />
            {formatRewardLabel(amount)}
        </PaidChip>
    );
}

function CatalogQuestCard({
    quest,
    completed,
}: {
    quest: QuestCatalogItem;
    completed: boolean;
}) {
    const assignees = quest.assignees ?? [];
    const category = categoryForQuest(quest);

    return (
        <Surface className="flex items-start gap-3">
            <IconMedallion
                icon={iconForQuest(quest)}
                tint={category.tint}
                completed={completed}
            />
            <div className="min-w-0 flex-1 space-y-3">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                            <Text as="span" weight="semibold" tone="strong">
                                {quest.title}
                            </Text>
                            <StatusChip quest={quest} completed={completed} />
                        </div>
                        {quest.description && (
                            <Text size="sm" tone="soft" className="mt-2">
                                {quest.description}
                            </Text>
                        )}
                        {assignees.length > 0 && (
                            <Text size="xs" tone="muted" className="mt-1">
                                {assignees.length === 1
                                    ? `Claimed by @${assignees[0]}`
                                    : `${assignees.length} builders on this`}
                            </Text>
                        )}
                    </div>
                    <div className="shrink-0">
                        <RewardChip amount={quest.rewardAmount} />
                    </div>
                </div>
                {quest.url && (
                    <InlineLink href={quest.url} className="text-sm">
                        View details
                    </InlineLink>
                )}
            </div>
        </Surface>
    );
}

function claimedByUser(
    quest: QuestCatalogItem,
    githubUsername: string | null,
): boolean {
    if (!githubUsername) return false;
    const normalizedUsername = githubUsername.toLowerCase();
    return (quest.assignees ?? []).some(
        (assignee) => assignee.toLowerCase() === normalizedUsername,
    );
}

function StatusChip({
    quest,
    completed,
}: {
    quest: QuestCatalogItem;
    completed: boolean;
}) {
    if (completed) {
        return (
            <Chip size="sm" intent="success">
                Completed
            </Chip>
        );
    }
    if (quest.availability === "claimed") {
        return (
            <Chip size="sm" intent="news">
                Claimed
            </Chip>
        );
    }
    return null;
}

function CompletedGrantCard({
    grant,
    catalogById,
}: {
    grant: QuestGrant;
    catalogById: Map<string, QuestCatalogItem>;
}) {
    const url = grantUrl(grant, catalogById);
    const context = grantContext(grant);
    const showGitHubIcon = grantLinkIsGitHub(grant);

    return (
        <Surface className="flex items-start gap-3 opacity-80">
            <IconMedallion icon={CheckIcon} tint="" completed />
            <div className="min-w-0 flex-1 space-y-3">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                            <Text as="span" weight="semibold" tone="strong">
                                {grantTitle(grant, catalogById)}
                            </Text>
                            <BalanceBucketChip bucket={grant.balanceBucket} />
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                            <Text as="span" size="xs" tone="muted">
                                {formatTimestamp(grant.createdAt)}
                            </Text>
                            {context && (
                                <Text as="span" size="xs" tone="muted">
                                    {context}
                                </Text>
                            )}
                        </div>
                    </div>
                    <div className="shrink-0">
                        <Text
                            as="span"
                            weight="semibold"
                            tone="strong"
                            className="tabular-nums text-intent-success-text"
                        >
                            +{formatGrantAmount(grant.pollenCredited)}
                        </Text>
                    </div>
                </div>
                {url && (
                    <InlineLink href={url} className="text-sm">
                        {showGitHubIcon && (
                            <GitHubIcon className="h-3.5 w-3.5 shrink-0" />
                        )}
                        {grantLinkLabel(grant)}
                    </InlineLink>
                )}
            </div>
        </Surface>
    );
}

// On-brand "endowed progress" header: the sprout grows through discrete stages
// as completion rises, wrapped in a thin SVG progress ring. Replaces the three
// redundant stat cards. Pure derived data.
function QuestProgress({
    completed,
    total,
    totalPollen,
}: {
    completed: number;
    total: number;
    totalPollen: number;
}) {
    const safeTotal = Math.max(total, 1);
    const ratio = Math.min(1, completed / safeTotal);
    const radius = 34;
    const circumference = 2 * Math.PI * radius;
    const dash = circumference * ratio;
    const stage = ratio >= 1 ? 4 : ratio >= 0.66 ? 3 : ratio >= 0.33 ? 2 : 1;
    const allDone = total > 0 && completed >= total;

    return (
        <Surface
            variant="card-themed"
            className="flex items-center gap-5 sm:gap-6"
        >
            <div className="relative h-20 w-20 shrink-0">
                <svg
                    aria-hidden="true"
                    viewBox="0 0 80 80"
                    className="h-20 w-20 -rotate-90"
                >
                    <circle
                        cx="40"
                        cy="40"
                        r={radius}
                        fill="none"
                        strokeWidth="5"
                        className="stroke-theme-bg-active"
                    />
                    <circle
                        cx="40"
                        cy="40"
                        r={radius}
                        fill="none"
                        strokeWidth="5"
                        strokeLinecap="round"
                        strokeDasharray={`${dash} ${circumference}`}
                        className="stroke-intent-success-text transition-[stroke-dasharray] duration-700 ease-out"
                    />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center">
                    <SproutIcon
                        className={[
                            "text-intent-success-text transition-all duration-500",
                            stage === 1
                                ? "h-5 w-5 opacity-70"
                                : stage === 2
                                  ? "h-7 w-7 opacity-85"
                                  : "h-9 w-9 opacity-100",
                        ].join(" ")}
                    />
                </span>
            </div>
            <div className="min-w-0 flex-1">
                <Text
                    as="div"
                    size="micro"
                    tone="soft"
                    weight="bold"
                    className="uppercase tracking-wide"
                >
                    Your progress
                </Text>
                <Text
                    as="div"
                    weight="semibold"
                    tone="strong"
                    className="mt-1 text-lg"
                >
                    {allDone
                        ? "All caught up"
                        : `${completed} of ${total} quests`}
                </Text>
                <Text as="div" size="sm" tone="soft" className="mt-0.5">
                    {formatGrantAmount(totalPollen)} Pollen earned
                </Text>
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
    const Icon = category.icon;
    return (
        <div className="mt-1 flex items-center gap-2">
            <Icon className={`h-4 w-4 shrink-0 ${category.tint}`} />
            <Text
                as="span"
                size="micro"
                tone="soft"
                weight="bold"
                className="uppercase tracking-wide"
            >
                {category.label}
            </Text>
            <Text as="span" size="xs" tone="muted">
                — {category.blurb}
            </Text>
            <Chip size="sm" intent="neutral" className="ml-auto tabular-nums">
                {done} / {total}
            </Chip>
        </div>
    );
}

export const QuestOverview: FC<QuestOverviewProps> = ({ githubUsername }) => {
    const [activeTab, setActiveTab] = useState<QuestTab>("available");
    const [state, setState] = useState<FetchState>(INITIAL_STATE);
    const normalizedGithubUsername = githubUsername?.trim() || null;

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
    const completedCatalogIds = useMemo(
        () =>
            new Set(
                state.grants
                    .map(catalogKeyForGrant)
                    .filter((key): key is string => key != null),
            ),
        [state.grants],
    );

    // Visible available quests, ordered so an easy win (cheapest reward) is
    // always near the top, then grouped by category for the journey framing.
    const visibleCatalog = useMemo(
        () =>
            state.catalog.filter((quest) => {
                if (completedCatalogIds.has(quest.id)) return false;
                if (activeTab !== "available") return false;
                return (
                    quest.availability === "available" ||
                    (quest.availability === "claimed" &&
                        claimedByUser(quest, normalizedGithubUsername))
                );
            }),
        [
            activeTab,
            completedCatalogIds,
            normalizedGithubUsername,
            state.catalog,
        ],
    );

    // Group available quests into the journey sections.
    const grouped = useMemo(() => {
        const map = new Map<CategoryKey, QuestCatalogItem[]>();
        for (const quest of visibleCatalog) {
            const key = categoryForQuest(quest).key;
            const list = map.get(key) ?? [];
            list.push(quest);
            map.set(key, list);
        }
        // Cheapest reward first within each lane (the always-visible easy win).
        for (const list of map.values()) {
            list.sort(
                (a, b) =>
                    (a.rewardAmount ?? Number.POSITIVE_INFINITY) -
                    (b.rewardAmount ?? Number.POSITIVE_INFINITY),
            );
        }
        return map;
    }, [visibleCatalog]);

    // Per-category totals (available + already-completed) for the section count
    // chips — gives the "2 / 3" goal-gradient cue.
    const categoryTotals = useMemo(() => {
        const totals = new Map<CategoryKey, { done: number; total: number }>();
        for (const quest of state.catalog) {
            const key = categoryForQuest(quest).key;
            const entry = totals.get(key) ?? { done: 0, total: 0 };
            entry.total += 1;
            if (completedCatalogIds.has(quest.id)) entry.done += 1;
            totals.set(key, entry);
        }
        return totals;
    }, [state.catalog, completedCatalogIds]);

    const availableCount = visibleCatalog.length;
    const completedCount = state.grants.length;
    const totalQuests = state.catalog.length;
    const currentItems =
        activeTab === "completed" ? completedCount : availableCount;

    return (
        <div className="flex flex-col gap-5">
            <QuestProgress
                completed={completedCount}
                total={Math.max(totalQuests, completedCount)}
                totalPollen={state.totalPollen}
            />

            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-1.5">
                    {(["available", "completed"] as const).map((tab) => (
                        <TabButton
                            key={tab}
                            active={activeTab === tab}
                            onClick={() => setActiveTab(tab)}
                        >
                            {tab === "available"
                                ? `Available (${availableCount})`
                                : `Completed (${completedCount})`}
                        </TabButton>
                    ))}
                </div>
            </div>

            {state.error && (
                <p className="text-sm text-intent-danger-500">{state.error}</p>
            )}

            {state.loading && currentItems === 0 && (
                <Surface className="flex items-center gap-2 text-sm text-theme-text-muted">
                    <ClockIcon className="h-4 w-4 shrink-0" />
                    Loading quests...
                </Surface>
            )}

            {!state.loading && !state.error && currentItems === 0 && (
                <Surface className="flex items-start gap-3">
                    <SproutIcon className="mt-0.5 h-5 w-5 shrink-0 text-theme-text-muted" />
                    <div className="min-w-0">
                        <p className="font-semibold text-ink-900">
                            {activeTab === "available"
                                ? "You're all caught up"
                                : "No completed quests yet"}
                        </p>
                        <Text size="sm" tone="soft" className="mt-1">
                            {activeTab === "available"
                                ? "You've cleared every available quest. Nice work."
                                : "Complete a quest to get started."}
                        </Text>
                    </div>
                </Surface>
            )}

            {activeTab === "completed" ? (
                <div className="flex flex-col gap-3">
                    {state.grants.map((grant, index) => (
                        <CompletedGrantCard
                            key={`${grant.source}-${grant.questId ?? grant.sourceRef ?? "grant"}-${grant.createdAt}-${index}`}
                            grant={grant}
                            catalogById={catalogById}
                        />
                    ))}
                </div>
            ) : (
                <div className="flex flex-col gap-5">
                    {CATEGORY_ORDER.map((category) => {
                        const quests = grouped.get(category.key) ?? [];
                        if (quests.length === 0) return null;
                        const totals = categoryTotals.get(category.key) ?? {
                            done: 0,
                            total: quests.length,
                        };
                        return (
                            <div
                                key={category.key}
                                className="flex flex-col gap-3"
                            >
                                <SectionHeader
                                    category={category}
                                    done={totals.done}
                                    total={totals.total}
                                />
                                {quests.map((quest) => (
                                    <CatalogQuestCard
                                        key={quest.id}
                                        quest={quest}
                                        completed={completedCatalogIds.has(
                                            quest.id,
                                        )}
                                    />
                                ))}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};
