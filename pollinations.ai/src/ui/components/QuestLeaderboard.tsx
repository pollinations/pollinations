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
                <div className="mt-4 flex flex-col gap-2">
                    {entries.map((entry) => (
                        <a
                            key={entry.githubUsername}
                            href={`https://github.com/${entry.githubUsername}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/40 transition"
                        >
                            <span className="w-6 text-center font-headline text-xs font-black text-muted">
                                {entry.rank}
                            </span>
                            <img
                                src={`https://github.com/${entry.githubUsername}.png?size=64`}
                                alt={entry.githubUsername}
                                className="w-8 h-8 rounded-full"
                                width={32}
                                height={32}
                                loading="lazy"
                                decoding="async"
                            />
                            <span className="font-headline text-sm font-black text-dark flex-1 truncate">
                                {entry.githubUsername}
                            </span>
                            <span className="text-xs text-muted">
                                {entry.completedQuests}{" "}
                                {entry.completedQuests === 1
                                    ? copy.questLabel
                                    : copy.questsLabel}
                            </span>
                            <span className="font-headline text-xs font-black text-primary">
                                {entry.totalPollen} {copy.pollenLabel}
                            </span>
                        </a>
                    ))}
                </div>
                <Body size="sm" spacing="comfortable" className="text-muted">
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
