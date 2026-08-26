import { useEffect, useState } from "react";
import { COMMUNITY_PAGE } from "../../copy/content/community";
import { LINKS } from "../../copy/content/socialLinks";
import { usePageCopy } from "../../hooks/usePageCopy";
import { ExternalLinkIcon } from "../assets/ExternalLinkIcon";
import { Divider } from "./ui/divider";
import { Body, Heading } from "./ui/typography";

interface LeaderboardEntry {
    rank: number;
    githubUsername: string;
    totalPollen: number;
    completedQuests: number;
}

const LEADERBOARD_ENDPOINT =
    "https://enter.pollinations.ai/api/quests/leaderboard";

const MEDALS = ["🥇", "🥈", "🥉"];

const COLOR_CLASSES = [
    "border-primary-strong shadow-[2px_2px_0_rgb(var(--primary-strong)_/_0.3)]",
    "border-secondary-strong shadow-[2px_2px_0_rgb(var(--secondary-strong)_/_0.3)]",
    "border-tertiary-strong shadow-[2px_2px_0_rgb(var(--tertiary-strong)_/_0.3)]",
];

export function QuestLeaderboard() {
    const { copy } = usePageCopy(COMMUNITY_PAGE);

    const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const CACHE_KEY = "quest_leaderboard_v1";
        const today = new Date().toISOString().slice(0, 10);

        // Check localStorage cache (expires at start of new UTC day)
        try {
            const cached = localStorage.getItem(CACHE_KEY);
            if (cached) {
                const { data, day } = JSON.parse(cached);
                if (day === today) {
                    setEntries(data);
                    setLoading(false);
                    return;
                }
            }
        } catch {
            // corrupted cache — continue to fetch
        }

        const loadLeaderboard = async () => {
            try {
                const res = await fetch(LEADERBOARD_ENDPOINT);
                if (!res.ok) return;
                const data = (await res.json()) as {
                    leaderboard?: LeaderboardEntry[];
                };
                const leaderboard = data.leaderboard ?? [];

                setEntries(leaderboard);

                // Cache the results
                try {
                    localStorage.setItem(
                        CACHE_KEY,
                        JSON.stringify({ data: leaderboard, day: today }),
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

        loadLeaderboard();
    }, []);

    if (loading || entries.length === 0) {
        return null;
    }

    return (
        <>
            <div className="mb-12">
                <Heading variant="section">
                    {copy.questLeaderboardTitle}
                </Heading>
                <Body size="sm" spacing="comfortable">
                    {copy.questLeaderboardDescription}
                </Body>
                <div className="mt-4 flex flex-col gap-3">
                    {entries.map((entry) => {
                        const isTop3 = entry.rank <= 3;
                        const colorClass =
                            COLOR_CLASSES[
                                (entry.githubUsername.charCodeAt(0) +
                                    entry.githubUsername.charCodeAt(1)) %
                                    COLOR_CLASSES.length
                            ];
                        const medal = isTop3 ? MEDALS[entry.rank - 1] : null;

                        return (
                            <a
                                key={entry.githubUsername}
                                href={`https://github.com/${entry.githubUsername}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`group flex items-center gap-4 p-3 bg-white/60 rounded-sub-card border-r-2 border-b-2 ${colorClass} transition hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none`}
                            >
                                {medal ? (
                                    <span className="w-8 text-center text-lg">
                                        {medal}
                                    </span>
                                ) : (
                                    <span className="w-8 text-center font-headline text-xs font-black text-muted">
                                        #{entry.rank}
                                    </span>
                                )}
                                <div
                                    className={`w-12 h-12 overflow-hidden rounded-full border-2 border-r-4 border-b-4 ${colorClass} shadow-[3px_3px_0_rgb(17_5_24_/_0.15)] group-hover:shadow-none transition`}
                                >
                                    <img
                                        src={`https://github.com/${entry.githubUsername}.png?size=96`}
                                        alt={entry.githubUsername}
                                        className="w-full h-full object-cover"
                                        width={48}
                                        height={48}
                                        loading="lazy"
                                        decoding="async"
                                    />
                                </div>
                                <span className="font-headline text-sm font-black text-dark flex-1 truncate">
                                    {entry.githubUsername}
                                </span>
                                <span className="text-xs text-muted hidden sm:inline">
                                    {entry.completedQuests}{" "}
                                    {entry.completedQuests === 1
                                        ? copy.questLabel
                                        : copy.questsLabel}
                                </span>
                                <span className="font-headline text-sm font-black text-primary bg-accent-light px-2 py-0.5 rounded-sub-card">
                                    {entry.totalPollen} {copy.pollenLabel}
                                </span>
                            </a>
                        );
                    })}
                </div>
                <Body
                    size="sm"
                    spacing="comfortable"
                    className="text-muted mt-4"
                >
                    {copy.questLeaderboardCta}{" "}
                    <a
                        href={LINKS.enterQuests}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-headline text-xs font-black hover:underline inline-flex items-center gap-1 text-dark bg-accent-strong px-2 py-0.5"
                    >
                        {copy.questsPageLink}
                        <ExternalLinkIcon className="w-3 h-3" strokeWidth="4" />
                    </a>
                </Body>
            </div>
            <Divider />
        </>
    );
}
