import { useEffect, useState } from "react";
import { COMMUNITY_PAGE } from "../../copy/content/community";
import { LINKS } from "../../copy/content/socialLinks";
import { usePageCopy } from "../../hooks/usePageCopy";
import { Body, Heading } from "./ui/typography";

export type QuestLeaderboardEntry = {
    githubUsername: string;
    completedQuests: number;
    totalPollen: number;
};

export type QuestLeaderboardData = {
    leaderboard: QuestLeaderboardEntry[];
};

const LEADERBOARD_API = "https://enter.pollinations.ai/api/quests/leaderboard";

export function parseQuestLeaderboardEntries(
    value: unknown,
): QuestLeaderboardEntry[] {
    if (!Array.isArray(value)) return [];

    return value.flatMap((entry) => {
        if (typeof entry !== "object" || entry === null) return [];
        const candidate = entry as Record<string, unknown>;
        const githubUsername = candidate.githubUsername;
        const completedQuests = candidate.completedQuests;
        const totalPollen = candidate.totalPollen;

        if (
            typeof githubUsername !== "string" ||
            githubUsername.trim() === "" ||
            typeof completedQuests !== "number" ||
            !Number.isFinite(completedQuests) ||
            !Number.isInteger(completedQuests) ||
            completedQuests < 0 ||
            typeof totalPollen !== "number" ||
            !Number.isFinite(totalPollen) ||
            totalPollen < 0
        )
            return [];

        return [
            {
                githubUsername: githubUsername.trim(),
                completedQuests,
                totalPollen,
            },
        ];
    });
}

export function QuestLeaderboardContent({
    data,
    copy,
}: {
    data: QuestLeaderboardData;
    copy: typeof COMMUNITY_PAGE;
}) {
    return (
        <section className="mb-12" aria-labelledby="quest-leaderboard-heading">
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <Heading id="quest-leaderboard-heading" spacing="tight">
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

            <ol className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {data.leaderboard.map((entry, index) => (
                    <li key={entry.githubUsername}>
                        <a
                            href={`https://github.com/${encodeURIComponent(entry.githubUsername)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-3 rounded-sub-card border border-border-subtle bg-white/60 px-3 py-3 transition hover:translate-x-[1px] hover:translate-y-[1px]"
                        >
                            <span
                                aria-hidden="true"
                                className="w-6 shrink-0 text-center font-headline text-xs font-black text-muted"
                            >
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
    );
}

export function QuestLeaderboard() {
    const [data, setData] = useState<QuestLeaderboardData | null>(null);
    const { copy } = usePageCopy(COMMUNITY_PAGE);

    useEffect(() => {
        let active = true;
        fetch(LEADERBOARD_API)
            .then((response) => {
                if (!response.ok) throw new Error("Leaderboard request failed");
                return response.json() as Promise<unknown>;
            })
            .then((result) => {
                const leaderboard =
                    typeof result === "object" && result !== null
                        ? parseQuestLeaderboardEntries(
                              (result as { leaderboard?: unknown }).leaderboard,
                          )
                        : [];
                if (active && leaderboard.length > 0) setData({ leaderboard });
            })
            .catch(() => {
                // The community page remains useful if the optional board is unavailable.
            });

        return () => {
            active = false;
        };
    }, []);

    return data ? <QuestLeaderboardContent data={data} copy={copy} /> : null;
}
