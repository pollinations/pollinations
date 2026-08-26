import { useEffect, useState } from "react";
import { COMMUNITY_PAGE } from "../../copy/content/community";
import { LINKS } from "../../copy/content/socialLinks";
import { usePageCopy } from "../../hooks/usePageCopy";
import { ExternalLinkIcon } from "../assets/ExternalLinkIcon";
import { Divider } from "./ui/divider";
import { Body, Heading } from "./ui/typography";

interface LeaderboardEntry {
    githubUsername: string;
    totalPollen: number;
    questCount: number;
}

interface LeaderboardResponse {
    leaderboard: LeaderboardEntry[];
}

export function QuestLeaderboard() {
    const { copy } = usePageCopy(COMMUNITY_PAGE);

    const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const CACHE_KEY = "quest_leaderboard_v1";
        const today = new Date().toISOString().slice(0, 10);

        try {
            const cached = localStorage.getItem(CACHE_KEY);
            if (cached) {
                const { data, day } = JSON.parse(cached);
                if (day === today) {
                    setLeaderboard(data);
                    setLoading(false);
                    return;
                }
            }
        } catch {
            // corrupted cache — continue to fetch
        }

        const fetchLeaderboard = async () => {
            try {
                const res = await fetch(
                    `${LINKS.enter}/api/quests/leaderboard`,
                    {
                        headers: {
                            Accept: "application/json",
                        },
                    },
                );
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const payload = (await res.json()) as LeaderboardResponse;
                setLeaderboard(payload.leaderboard ?? []);

                try {
                    localStorage.setItem(
                        CACHE_KEY,
                        JSON.stringify({
                            data: payload.leaderboard ?? [],
                            day: today,
                        }),
                    );
                } catch {
                    // localStorage full — skip
                }
            } catch (err) {
                console.error("Quest leaderboard fetch failed:", err);
            } finally {
                setLoading(false);
            }
        };

        fetchLeaderboard();
    }, []);

    if (loading && leaderboard.length === 0) {
        return null;
    }

    if (!loading && leaderboard.length === 0) {
        return null;
    }

    const topThree = leaderboard.slice(0, 3);
    const rest = leaderboard.slice(3);

    const renderEntry = (entry: LeaderboardEntry, rank: number) => {
        const rankColors = [
            "border-primary-strong",
            "border-secondary-strong",
            "border-tertiary-strong",
        ];
        const colorClass = rankColors[rank % rankColors.length];
        return (
            <a
                key={entry.githubUsername}
                href={`https://github.com/${entry.githubUsername}`}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center gap-3 p-2 rounded-sub-card border-r-2 border-b-2 bg-white/60 transition hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none"
            >
                <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 ${colorClass} font-headline text-[10px] font-black text-dark`}
                >
                    #{rank + 1}
                </span>
                <span className="font-mono text-xs font-medium text-dark truncate">
                    @{entry.githubUsername}
                </span>
                <span className="ml-auto flex items-center gap-2 text-xs text-subtle">
                    <span className="font-headline font-black">
                        {entry.totalPollen}
                    </span>
                    <span>{copy.questLeaderboardPollenLabel}</span>
                    <span className="text-border-subtle">·</span>
                    <span>
                        {entry.questCount} {copy.questLeaderboardCountLabel}
                    </span>
                </span>
            </a>
        );
    };

    return (
        <>
            <div className="mb-12">
                <Heading variant="section">
                    {copy.questLeaderboardTitle}
                </Heading>
                <Body size="sm" spacing="comfortable">
                    {copy.questLeaderboardDescription}
                    <br />
                    {copy.questLeaderboardCta}{" "}
                    <a
                        href={LINKS.enterQuests}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-headline text-xs font-black hover:underline inline-flex items-center gap-1 text-dark bg-accent-strong px-2 py-0.5"
                    >
                        {copy.questLeaderboardLink}
                        <ExternalLinkIcon className="w-3 h-3" strokeWidth="4" />
                    </a>
                </Body>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
                    {topThree.map(renderEntry)}
                </div>
                {rest.length > 0 && (
                    <>
                        <div className="mt-3 grid grid-cols-1 gap-1 sm:grid-cols-2">
                            {rest.map(renderEntry)}
                        </div>
                    </>
                )}
            </div>
            <Divider />
        </>
    );
}
