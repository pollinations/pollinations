import {
    Chip,
    ClockIcon,
    GitHubIcon,
    InlineLink,
    SproutIcon,
    StatCard,
    Surface,
    TabButton,
    Text,
} from "@pollinations/ui";
import { formatPollen, PaidChip, TierChip } from "@pollinations/ui/wallet";
import { type FC, useEffect, useMemo, useState } from "react";
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
    generatedAt: string | null;
    loading: boolean;
    error: string | null;
};

const INITIAL_STATE: FetchState = {
    catalog: [],
    grants: [],
    totalPollen: 0,
    generatedAt: null,
    loading: true,
    error: null,
};

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

function formatSyncedTimestamp(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
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

function CatalogQuestCard({
    quest,
    completed,
}: {
    quest: QuestCatalogItem;
    completed: boolean;
}) {
    const assignees = quest.assignees ?? [];

    return (
        <Surface className="space-y-3">
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
                            Assigned to{" "}
                            {assignees.map((name) => `@${name}`).join(", ")}
                        </Text>
                    )}
                </div>
                <div className="shrink-0">
                    <PaidChip size="sm">
                        {formatRewardLabel(quest.rewardAmount)}
                    </PaidChip>
                </div>
            </div>
            {quest.url && (
                <InlineLink href={quest.url} className="text-sm">
                    View details
                </InlineLink>
            )}
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
            <Chip size="sm" intent="neutral">
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
        <Surface className="space-y-3">
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
                        className="tabular-nums"
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
        </Surface>
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
                    generatedAt: catalog.generatedAt ?? null,
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
    const visibleCatalog = useMemo(
        () =>
            state.catalog.filter((quest) => {
                if (completedCatalogIds.has(quest.id)) return false;
                if (activeTab === "available") {
                    return (
                        quest.availability === "available" ||
                        (quest.availability === "claimed" &&
                            claimedByUser(quest, normalizedGithubUsername))
                    );
                }
                return false;
            }),
        [
            activeTab,
            completedCatalogIds,
            normalizedGithubUsername,
            state.catalog,
        ],
    );

    const availableCount = state.catalog.filter(
        (quest) =>
            !completedCatalogIds.has(quest.id) &&
            (quest.availability === "available" ||
                (quest.availability === "claimed" &&
                    claimedByUser(quest, normalizedGithubUsername))),
    ).length;
    const currentItems =
        activeTab === "completed" ? state.grants.length : visibleCatalog.length;

    return (
        <div className="flex flex-col gap-4">
            <div className="grid gap-2 sm:grid-cols-3">
                <Surface>
                    <StatCard
                        label="Available"
                        value={availableCount.toLocaleString()}
                    />
                </Surface>
                <Surface>
                    <StatCard
                        label="Completed"
                        value={state.grants.length.toLocaleString()}
                    />
                </Surface>
                <Surface>
                    <StatCard
                        label="Earned"
                        value={formatGrantAmount(state.totalPollen)}
                    />
                </Surface>
            </div>

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
                                : `Completed (${state.grants.length})`}
                        </TabButton>
                    ))}
                </div>
                {state.generatedAt && (
                    <span className="text-xs text-ink-500">
                        Synced {formatSyncedTimestamp(state.generatedAt)}
                    </span>
                )}
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
                            No {activeTab} quests
                        </p>
                    </div>
                </Surface>
            )}

            <div className="flex flex-col gap-3">
                {activeTab === "completed"
                    ? state.grants.map((grant, index) => (
                          <CompletedGrantCard
                              key={`${grant.source}-${grant.questId ?? grant.sourceRef ?? "grant"}-${grant.createdAt}-${index}`}
                              grant={grant}
                              catalogById={catalogById}
                          />
                      ))
                    : visibleCatalog.map((quest) => (
                          <CatalogQuestCard
                              key={quest.id}
                              quest={quest}
                              completed={completedCatalogIds.has(quest.id)}
                          />
                      ))}
            </div>
        </div>
    );
};
