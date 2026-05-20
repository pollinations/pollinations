import { useEffect, useMemo, useState } from "react";
import type {
    QuestOverviewItem,
    QuestOverviewResponse,
} from "../../../routes/quests.ts";
import { apiClient } from "../../api.ts";
import { DashboardSection } from "../layout/dashboard-section.tsx";
import { Chip } from "../ui/chip.tsx";
import { Surface } from "../ui/surface.tsx";
import { TabButton } from "../ui/tab-button.tsx";

type QuestOverviewProps = {
    initialData?: QuestOverviewResponse | null;
};

type QuestFilter = "open" | "closed" | "all";

const theme = "green" as const;

export function QuestOverview({ initialData = null }: QuestOverviewProps = {}) {
    const [filter, setFilter] = useState<QuestFilter>("open");
    const [data, setData] = useState<QuestOverviewResponse | null>(initialData);
    const [isLoading, setIsLoading] = useState(!initialData);
    const [error, setError] = useState<string | null>(null);
    const quests = data?.quests ?? [];
    const visibleQuests = useMemo(
        () =>
            quests.filter((quest) =>
                filter === "all" ? true : quest.state === filter,
            ),
        [filter, quests],
    );
    const stats = useMemo(() => buildStats(quests), [quests]);

    useEffect(() => {
        let cancelled = false;

        async function loadQuests(): Promise<void> {
            setIsLoading(true);
            setError(null);
            try {
                const response = await apiClient.quests.$get();
                if (!response.ok) {
                    throw new Error(`Quest request failed: ${response.status}`);
                }
                const nextData = await response.json();
                if (!cancelled) setData(nextData);
            } catch (nextError) {
                if (!cancelled) {
                    setError(
                        nextError instanceof Error
                            ? nextError.message
                            : "Quest request failed",
                    );
                }
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        }

        if (!initialData) void loadQuests();

        return () => {
            cancelled = true;
        };
    }, [initialData]);

    return (
        <div data-theme={theme} className="flex flex-col gap-6">
            <DashboardSection
                title="Quests"
                theme={theme}
                action={
                    <div className="flex flex-wrap gap-2">
                        {(["open", "closed", "all"] as const).map((tab) => (
                            <TabButton
                                key={tab}
                                active={filter === tab}
                                theme={theme}
                                onClick={() => setFilter(tab)}
                                className="px-3 py-1 text-sm capitalize"
                            >
                                {tab}
                            </TabButton>
                        ))}
                    </div>
                }
            >
                <div className="grid gap-3 sm:grid-cols-4">
                    <StatCard label="Open" value={stats.open} />
                    <StatCard label="Claimed" value={stats.claimed} />
                    <StatCard label="Closed" value={stats.closed} />
                    <StatCard
                        label="Known rewards"
                        value={stats.knownRewards}
                    />
                </div>
            </DashboardSection>

            <DashboardSection
                title={
                    filter === "all"
                        ? "All quests"
                        : `${titleCase(filter)} quests`
                }
                theme={theme}
                action={
                    data?.generatedAt ? (
                        <span className="text-xs font-medium text-theme-text-soft">
                            Synced {formatDate(data.generatedAt)}
                        </span>
                    ) : null
                }
            >
                <div className="flex flex-col gap-3">
                    {isLoading && visibleQuests.length === 0 ? (
                        <Surface
                            theme={theme}
                            variant="card-themed"
                            className="text-sm text-theme-text-strong"
                        >
                            Loading quests from GitHub...
                        </Surface>
                    ) : error && visibleQuests.length === 0 ? (
                        <Surface
                            theme={theme}
                            variant="card-themed"
                            className="text-sm text-theme-text-strong"
                        >
                            Could not load quests: {error}
                        </Surface>
                    ) : visibleQuests.length === 0 ? (
                        <Surface
                            theme={theme}
                            variant="card-themed"
                            className="text-sm text-theme-text-strong"
                        >
                            No quests found for this view.
                        </Surface>
                    ) : (
                        visibleQuests.map((quest) => (
                            <QuestCard key={quest.number} quest={quest} />
                        ))
                    )}
                </div>
            </DashboardSection>
        </div>
    );
}

function QuestCard({ quest }: { quest: QuestOverviewItem }) {
    const status =
        quest.state === "open" && quest.assignees.length > 0
            ? "Claimed"
            : titleCase(quest.state);

    return (
        <Surface theme={theme} className="space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <a
                            href={quest.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-semibold text-theme-text-strong underline decoration-theme-border underline-offset-2 hover:text-theme-text-base"
                        >
                            #{quest.number} {quest.title}
                        </a>
                    </div>
                    {quest.description && (
                        <p className="mt-2 text-sm leading-6 text-theme-text-base">
                            {quest.description}
                        </p>
                    )}
                </div>
                <Chip
                    theme={theme}
                    intent={status === "Closed" ? "neutral" : undefined}
                    size="sm"
                >
                    {status}
                </Chip>
            </div>

            <div className="grid gap-2 text-sm text-theme-text-strong sm:grid-cols-2">
                <Meta label="Author" value={formatUser(quest.author)} />
                <Meta
                    label="Assignee"
                    value={
                        quest.assignees.length
                            ? quest.assignees.map(formatUser).join(", ")
                            : "Unassigned"
                    }
                />
                <Meta
                    label="Reward"
                    value={
                        quest.rewardPollen != null
                            ? `${quest.rewardPollen} Pollen`
                            : (quest.rewardText ?? "Not specified")
                    }
                />
                <Meta label="Payout" value="Unknown" />
            </div>

            {quest.linkedPullRequests.length > 0 && (
                <div className="border-t border-theme-border pt-3">
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-theme-text-soft">
                        Linked PRs
                    </div>
                    <div className="flex flex-col gap-2">
                        {quest.linkedPullRequests.map((pr) => (
                            <a
                                key={pr.number}
                                href={pr.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center justify-between gap-3 rounded-lg border border-theme-border bg-theme-bg-pale px-3 py-2 text-sm hover:bg-theme-bg-active"
                            >
                                <span className="min-w-0 truncate text-theme-text-strong">
                                    #{pr.number} {pr.title}
                                </span>
                                <span className="shrink-0 text-xs font-medium capitalize text-theme-text-soft">
                                    {pr.state}
                                </span>
                            </a>
                        ))}
                    </div>
                </div>
            )}
        </Surface>
    );
}

function StatCard({ label, value }: { label: string; value: number }) {
    return (
        <Surface theme={theme} variant="card-themed">
            <div className="text-xs font-semibold uppercase tracking-wide text-theme-text-soft">
                {label}
            </div>
            <div className="mt-2 text-3xl font-semibold text-theme-text-strong">
                {value}
            </div>
        </Surface>
    );
}

function Meta({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-lg bg-theme-bg-pale px-3 py-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-theme-text-soft">
                {label}
            </div>
            <div className="mt-1 break-words font-medium">{value}</div>
        </div>
    );
}

function buildStats(quests: QuestOverviewItem[]) {
    return quests.reduce(
        (acc, quest) => {
            if (quest.state === "open") acc.open += 1;
            if (quest.state === "closed") acc.closed += 1;
            if (quest.state === "open" && quest.assignees.length > 0) {
                acc.claimed += 1;
            }
            if (quest.rewardPollen != null) acc.knownRewards += 1;
            return acc;
        },
        { open: 0, claimed: 0, closed: 0, knownRewards: 0 },
    );
}

function formatUser(user: string | null): string {
    return user ? `@${user}` : "Unknown";
}

function formatDate(value: string): string {
    return new Intl.DateTimeFormat("en", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
    }).format(new Date(value));
}

function titleCase(value: string): string {
    return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}
