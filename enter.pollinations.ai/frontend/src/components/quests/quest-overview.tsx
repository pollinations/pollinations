import { Button, Chip, Section, Surface, TabButton } from "@pollinations/ui";
import { PaidChip } from "@pollinations/ui/wallet";
import { useEffect, useMemo, useState } from "react";
import { apiClient } from "../../api.ts";
import type {
    QuestOverviewItem,
    QuestOverviewResponse,
} from "../../backend-types.ts";

type QuestOverviewProps = {
    initialData?: QuestOverviewResponse | null;
};

type QuestFilter = "available" | "claimed" | "completed";

const theme = "coral" as const;

export function QuestOverview({ initialData = null }: QuestOverviewProps = {}) {
    const [filter, setFilter] = useState<QuestFilter>("available");
    const [data, setData] = useState<QuestOverviewResponse | null>(initialData);
    const [isLoading, setIsLoading] = useState(!initialData);
    const [error, setError] = useState<string | null>(null);
    const quests = data?.quests ?? [];
    const visibleQuests = useMemo(
        () =>
            quests.filter((quest) => {
                if (filter === "completed") return quest.state === "closed";
                if (quest.state !== "open") return false;
                const isClaimed = quest.assignees.length > 0;
                return filter === "claimed" ? isClaimed : !isClaimed;
            }),
        [filter, quests],
    );

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
        <div className="flex flex-col gap-6">
            <Section title="Quests" theme={theme} framed>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap gap-1.5">
                        {(["available", "claimed", "completed"] as const).map(
                            (tab) => (
                                <TabButton
                                    key={tab}
                                    active={filter === tab}
                                    onClick={() => setFilter(tab)}
                                >
                                    <span className="font-bold">
                                        {titleCase(tab)}
                                    </span>
                                </TabButton>
                            ),
                        )}
                    </div>
                    {data?.generatedAt ? (
                        <span className="text-xs font-medium text-theme-text-soft">
                            Synced {formatDate(data.generatedAt)}
                        </span>
                    ) : (
                        <span />
                    )}
                </div>
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
            </Section>
        </div>
    );
}

function QuestCard({ quest }: { quest: QuestOverviewItem }) {
    const pullRequests =
        quest.state === "closed"
            ? quest.linkedPullRequests.filter((pr) => pr.mergedAt)
            : quest.linkedPullRequests.filter((pr) => pr.state === "open");
    const isClaimed = quest.state === "open" && quest.assignees.length > 0;
    const pullRequestLabel = quest.state === "closed" ? "Merged PR" : "PR";

    return (
        <Surface theme={theme} className="space-y-3">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                    <a
                        href={quest.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold text-theme-text-strong underline decoration-theme-border underline-offset-2 hover:text-theme-text-base"
                    >
                        #{quest.number} {quest.title}
                    </a>
                    {quest.description && (
                        <p className="mt-2 text-sm leading-6 text-theme-text-base">
                            {quest.description}
                        </p>
                    )}
                </div>
                <div className="flex shrink-0 flex-wrap justify-end gap-2">
                    {isClaimed && (
                        <Chip theme={theme} size="sm">
                            Claimed
                        </Chip>
                    )}
                    <PaidChip
                        theme={theme}
                        size="sm"
                        className="whitespace-nowrap"
                    >
                        {formatReward(quest)}
                    </PaidChip>
                </div>
            </div>

            {pullRequests.length > 0 && (
                <div className="flex flex-wrap gap-2">
                    {pullRequests.map((pr) => (
                        <Button
                            as="a"
                            key={pr.number}
                            href={pr.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            theme={theme}
                            size="sm"
                            className="whitespace-nowrap"
                            title={pr.title}
                            aria-label={`${pullRequestLabel} #${pr.number}: ${pr.title}`}
                        >
                            {pullRequestLabel} #{pr.number}
                        </Button>
                    ))}
                </div>
            )}
        </Surface>
    );
}

function formatReward(quest: QuestOverviewItem): string {
    if (quest.rewardPollen != null)
        return `${quest.rewardPollen} pollen budget`;
    return quest.rewardText ? "Budget listed" : "Budget TBD";
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
