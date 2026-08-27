import { useEffect, useState } from "react";
import { COMMUNITY_PAGE } from "../../copy/content/community";
import { LINKS } from "../../copy/content/socialLinks";
import { usePageCopy } from "../../hooks/usePageCopy";
import { Divider } from "./ui/divider";
import { Body, Heading } from "./ui/typography";

export type QuestLeaderboardEntry = {
    githubUsername: string;
    completedQuests: number;
    totalPollen: number;
};

export type QuestLeaderboardData = {
    leaderboard: QuestLeaderboardEntry[];
    totals: {
        contributors: number;
        completedQuests: number;
        totalPollen: number;
    };
};

const LEADERBOARD_API = "https://enter.pollinations.ai/api/quests/leaderboard";

export function QuestLeaderboardContent({
    data,
    copy,
}: {
    data: QuestLeaderboardData;
    copy: typeof COMMUNITY_PAGE;
}) {
    return (
        <>
            <section
                className="mb-12"
                aria-labelledby="quest-leaderboard-heading"
            >
                <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <Heading
                            id="quest-leaderboard-heading"
                            variant="section"
                            spacing="tight"
                        >
                            {copy.questLeaderboardTitle}
                        </Heading>
                        <Body size="sm" spacing="none">
                            {copy.questLeaderboardDescription}
                        </Body>
                    </div>
                    <a
                        href={`${LINKS.enter}/quests`}
                        className="w-fit bg-accent-strong px-2 py-1 font-headline text-xs font-black text-dark hover:underline"
                    >
                        {copy.questLeaderboardCta}
                    </a>
                </div>

                <div className="mb-4 font-body text-xs text-subtle">
                    <strong className="text-dark">
                        {data.totals.contributors}
                    </strong>{" "}
                    {copy.questLeaderboardBuildersLabel}
                    <span className="mx-2">·</span>
                    <strong className="text-dark">
                        {data.totals.completedQuests}
                    </strong>{" "}
                    {copy.questLeaderboardCompletedLabel}
                    <span className="mx-2">·</span>
                    <strong className="text-dark">
                        {data.totals.totalPollen}
                    </strong>{" "}
                    {copy.questLeaderboardPollenLabel}
                </div>

                <ol className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {data.leaderboard.map((entry, index) => (
                        <li key={entry.githubUsername}>
                            <a
                                href={`https://github.com/${encodeURIComponent(entry.githubUsername)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-3 rounded-sub-card border border-border-subtle bg-white/60 px-3 py-3 transition hover:translate-x-[1px] hover:translate-y-[1px]"
                            >
                                <span className="w-6 shrink-0 text-center font-headline text-xs font-black text-muted">
                                    {index + 1}
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate font-headline text-xs font-black text-dark">
                                        @{entry.githubUsername}
                                    </span>
                                    <span className="block font-body text-xs text-subtle">
                                        {entry.completedQuests}{" "}
                                        {entry.completedQuests === 1
                                            ? copy.questLeaderboardQuestLabel
                                            : copy.questLeaderboardQuestsLabel}
                                    </span>
                                </span>
                                <strong className="shrink-0 font-headline text-xs font-black text-dark">
                                    {entry.totalPollen}{" "}
                                    {copy.questLeaderboardPollenLabel}
                                </strong>
                            </a>
                        </li>
                    ))}
                </ol>
            </section>
            <Divider />
        </>
    );
}

export function QuestLeaderboard() {
    const { copy } = usePageCopy(COMMUNITY_PAGE);
    const [data, setData] = useState<QuestLeaderboardData | null>(null);

    useEffect(() => {
        let active = true;

        fetch(LEADERBOARD_API)
            .then((response) => {
                if (!response.ok) throw new Error("Leaderboard request failed");
                return response.json() as Promise<QuestLeaderboardData>;
            })
            .then((result) => {
                if (active && result.leaderboard.length > 0) setData(result);
            })
            .catch(() => {
                // Keep the Community page useful if the optional board is unavailable.
            });

        return () => {
            active = false;
        };
    }, []);

    return data ? <QuestLeaderboardContent data={data} copy={copy} /> : null;
}
