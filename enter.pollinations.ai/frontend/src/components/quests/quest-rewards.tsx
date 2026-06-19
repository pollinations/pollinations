import { Chip, ClockIcon, SproutIcon, Surface } from "@pollinations/ui";
import { formatPollen, PaidChip, TierChip } from "@pollinations/ui/wallet";
import { getQuestDefinition } from "@shared/quests/definitions.ts";
import { type FC, useEffect, useState } from "react";
import { apiClient } from "../../api.ts";

type QuestGrant = {
    source: string;
    questId: string | null;
    pollenCredited: number;
    balanceBucket: string;
    sourceRef: string | null;
    metadata: Record<string, unknown> | null;
    createdAt: string;
};

type FetchState = {
    grants: QuestGrant[];
    totalPollen: number;
    loading: boolean;
    error: string | null;
};

const INITIAL_STATE: FetchState = {
    grants: [],
    totalPollen: 0,
    loading: true,
    error: null,
};

function formatGrantAmount(value: number): string {
    const formatted = formatPollen(value);
    if (value > 0 && formatted === "0") return "<0.0001";
    return formatted;
}

function formatTimestamp(value: string): string {
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

function formatDateOnly(value: string): string {
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
    const tail = slug.includes(":") ? slug.slice(slug.indexOf(":") + 1) : slug;
    const words = tail.replace(/[_-]+/g, " ").trim();
    if (!words) return slug;
    return words.charAt(0).toUpperCase() + words.slice(1);
}

function questTitle(grant: QuestGrant): string {
    const fromMetadata =
        metadataString(grant.metadata, "title") ??
        metadataString(grant.metadata, "issueTitle");
    if (fromMetadata) return fromMetadata;
    if (grant.questId) {
        const definition = getQuestDefinition(grant.questId);
        if (definition) return definition.title;
        return humanizeSlug(grant.questId);
    }
    const questTypeId = metadataString(grant.metadata, "questTypeId");
    if (questTypeId) return humanizeSlug(questTypeId);
    return humanizeSlug(grant.source);
}

function questCategory(grant: QuestGrant): string | null {
    const category = metadataString(grant.metadata, "category");
    if (category) return humanizeSlug(category);
    if (!grant.questId) return null;
    const definition = getQuestDefinition(grant.questId);
    return definition ? humanizeSlug(definition.category) : null;
}

function questEventLabel(grant: QuestGrant): string | null {
    const eventType = metadataString(grant.metadata, "eventType");
    if (eventType) return humanizeSlug(eventType);
    if (!grant.questId) return null;
    const definition = getQuestDefinition(grant.questId);
    return definition ? humanizeSlug(definition.eventType) : null;
}

function questSourceLabel(grant: QuestGrant): string {
    if (grant.source === "product_quest") return "Product quest";
    if (grant.source === "code_quest") return "GitHub quest";
    return humanizeSlug(grant.source);
}

function questContext(grant: QuestGrant): string | null {
    const issueNumber = metadataNumber(grant.metadata, "issueNumber");
    const prNumber = metadataNumber(grant.metadata, "prNumber");
    const githubUsername = metadataString(grant.metadata, "githubUsername");
    const parts: string[] = [];
    if (issueNumber != null) parts.push(`Issue #${issueNumber}`);
    if (prNumber != null) parts.push(`PR #${prNumber}`);
    if (githubUsername) parts.push(`@${githubUsername}`);
    return parts.length > 0 ? parts.join(" · ") : null;
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

function grantKey(grant: QuestGrant, index: number): string {
    return `${grant.source}-${grant.questId ?? grant.sourceRef ?? "grant"}-${
        grant.createdAt
    }-${index}`;
}

function RewardStat({ label, value }: { label: string; value: string }) {
    return (
        <Surface className="flex flex-col gap-1">
            <span className="text-xs font-medium uppercase tracking-wide text-theme-text-muted">
                {label}
            </span>
            <span className="text-lg font-semibold tabular-nums text-ink-900">
                {value}
            </span>
        </Surface>
    );
}

export const QuestRewards: FC = () => {
    const [state, setState] = useState<FetchState>(INITIAL_STATE);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const response = await apiClient.account.quests.$get();
                if (cancelled) return;
                if (!response.ok) {
                    setState({
                        grants: [],
                        totalPollen: 0,
                        loading: false,
                        error: `Failed to load quest rewards (${response.status})`,
                    });
                    return;
                }
                const data = (await response.json()) as {
                    totalPollen: number;
                    grants: QuestGrant[];
                };
                if (cancelled) return;
                setState({
                    grants: data.grants ?? [],
                    totalPollen: data.totalPollen ?? 0,
                    loading: false,
                    error: null,
                });
            } catch (error) {
                if (cancelled) return;
                setState({
                    grants: [],
                    totalPollen: 0,
                    loading: false,
                    error:
                        error instanceof Error
                            ? error.message
                            : "Failed to load quest rewards",
                });
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    const showEmpty =
        state.grants.length === 0 && !state.loading && !state.error;
    const latestGrant = state.grants[0] ?? null;

    return (
        <div className="flex flex-col gap-4">
            {state.grants.length > 0 && (
                <div className="grid gap-2 sm:grid-cols-3">
                    <RewardStat
                        label="Total earned"
                        value={formatGrantAmount(state.totalPollen)}
                    />
                    <RewardStat
                        label="Completed"
                        value={state.grants.length.toLocaleString()}
                    />
                    <RewardStat
                        label="Latest"
                        value={
                            latestGrant
                                ? formatDateOnly(latestGrant.createdAt)
                                : "-"
                        }
                    />
                </div>
            )}

            {state.error && (
                <p className="text-sm text-intent-danger-500">{state.error}</p>
            )}

            {state.loading && state.grants.length === 0 && (
                <Surface className="flex items-center gap-2 text-sm text-theme-text-muted">
                    <ClockIcon className="h-4 w-4 shrink-0" />
                    Loading quest rewards...
                </Surface>
            )}

            {showEmpty && (
                <Surface className="flex items-start gap-3">
                    <SproutIcon className="mt-0.5 h-5 w-5 shrink-0 text-theme-text-muted" />
                    <div className="min-w-0">
                        <p className="font-semibold text-ink-900">
                            No completed quests yet
                        </p>
                        <p className="mt-1 text-sm text-ink-600">
                            Completed quest rewards will appear here after
                            Pollen is credited.
                        </p>
                    </div>
                </Surface>
            )}

            {state.grants.length > 0 && (
                <>
                    <ul className="flex flex-col gap-2 sm:hidden">
                        {state.grants.map((grant, index) => {
                            const context = questContext(grant);
                            const category = questCategory(grant);
                            return (
                                <li
                                    key={grantKey(grant, index)}
                                    className="flex flex-col gap-1.5 rounded-lg border border-theme-border p-3"
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="truncate font-semibold text-ink-900">
                                            {questTitle(grant)}
                                        </span>
                                        <span className="shrink-0 font-semibold tabular-nums text-ink-900">
                                            +
                                            {formatGrantAmount(
                                                grant.pollenCredited,
                                            )}
                                        </span>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-1.5 text-xs">
                                        {category && (
                                            <Chip size="sm" intent="neutral">
                                                {category}
                                            </Chip>
                                        )}
                                        <BalanceBucketChip
                                            bucket={grant.balanceBucket}
                                        />
                                        <span className="tabular-nums text-ink-600">
                                            {formatTimestamp(grant.createdAt)}
                                        </span>
                                    </div>
                                    {context && (
                                        <div className="truncate text-xs text-ink-500">
                                            {context}
                                        </div>
                                    )}
                                </li>
                            );
                        })}
                    </ul>

                    <div className="hidden overflow-x-auto rounded-lg border border-theme-border sm:block">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-ink-50 text-xs uppercase tracking-wide text-ink-700">
                                <tr>
                                    <th className="px-3 py-2 font-semibold">
                                        Quest
                                    </th>
                                    <th className="px-3 py-2 font-semibold">
                                        Type
                                    </th>
                                    <th className="px-3 py-2 font-semibold">
                                        Earned
                                    </th>
                                    <th className="px-3 py-2 text-right font-semibold">
                                        Reward
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-theme-border">
                                {state.grants.map((grant, index) => {
                                    const context = questContext(grant);
                                    const eventLabel = questEventLabel(grant);
                                    return (
                                        <tr
                                            key={grantKey(grant, index)}
                                            className="hover:bg-ink-50"
                                        >
                                            <td className="px-3 py-2 text-ink-900">
                                                <span className="block font-medium">
                                                    {questTitle(grant)}
                                                </span>
                                                {context && (
                                                    <span className="block text-xs text-ink-500">
                                                        {context}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-3 py-2">
                                                <div className="flex flex-wrap items-center gap-1.5">
                                                    <Chip
                                                        size="sm"
                                                        intent="neutral"
                                                    >
                                                        {questSourceLabel(
                                                            grant,
                                                        )}
                                                    </Chip>
                                                    {eventLabel && (
                                                        <span className="text-xs text-ink-500">
                                                            {eventLabel}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="whitespace-nowrap px-3 py-2 tabular-nums text-ink-800">
                                                {formatTimestamp(
                                                    grant.createdAt,
                                                )}
                                            </td>
                                            <td className="px-3 py-2 text-right font-semibold tabular-nums text-ink-900">
                                                +
                                                {formatGrantAmount(
                                                    grant.pollenCredited,
                                                )}
                                                <span className="ml-2 inline-flex align-middle">
                                                    <BalanceBucketChip
                                                        bucket={
                                                            grant.balanceBucket
                                                        }
                                                    />
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </>
            )}

            <div className="flex items-center justify-between pt-1">
                <span className="text-xs text-ink-500">
                    {state.grants.length > 0
                        ? `Showing ${state.grants.length} ${
                              state.grants.length === 1 ? "reward" : "rewards"
                          }`
                        : state.loading
                          ? "Loading..."
                          : ""}
                </span>
            </div>
        </div>
    );
};
