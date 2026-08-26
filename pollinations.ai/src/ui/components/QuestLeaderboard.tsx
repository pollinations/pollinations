import { useEffect, useState } from "react";
import { COMMUNITY_PAGE } from "../../copy/content/community";
import { usePageCopy } from "../../hooks/usePageCopy";
import { Divider } from "./ui/divider";
import { Body, Heading } from "./ui/typography";

interface LeaderboardEntry {
    login: string;
    avatarUrl: string;
    profileUrl: string;
    questCount: number;
    totalPollen: number;
}

export function QuestLeaderboard() {
    const { copy } = usePageCopy(COMMUNITY_PAGE);
    const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const CACHE_KEY = "quest_leaderboard_v1";
        const today = new Date().toISOString().slice(0, 10);

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

        fetch("/api/quests/leaderboard")
            .then((r) => r.json())
            .then((data) => {
                const top: LeaderboardEntry[] = (data.leaderboard ?? [])
                    .map((e: Record<string, unknown>) => ({
                        login: e.login as string,
                        avatarUrl: e.avatarUrl as string,
                        profileUrl: e.profileUrl as string,
                        questCount: e.questCount as number,
                        totalPollen: e.totalPollen as number,
                    }))
                    .slice(0, 20);
                setEntries(top);
                try {
                    localStorage.setItem(
                        CACHE_KEY,
                        JSON.stringify({ data: top, day: today }),
                    );
                } catch {
                    // localStorage full — skip
                }
            })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    if (loading && entries.length === 0) {
        return null;
    }

    if (!loading && entries.length === 0) {
        return null;
    }

    return (
        <>
            <div className="mb-12">
                <Heading variant="section">
                    {copy.questLeaderboardTitle}
                </Heading>
                <Body size="sm" spacing="comfortable">
                    {copy.questLeaderboardDescription}{" "}
                    <a
                        href="https://github.com/pollinations/pollinations/issues?q=label%3APOLLEN-QUEST+is%3Aclosed"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-headline text-xs font-black hover:underline inline-flex items-center gap-1 text-dark bg-accent-strong px-2 py-0.5"
                    >
                        {copy.questLeaderboardCta}
                    </a>
                </Body>
                <div className="mt-4 space-y-2">
                    {entries.map((entry, i) => (
                        <a
                            key={entry.login}
                            href={entry.profileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/40 transition"
                        >
                            <span className="w-6 text-center font-headline text-xs font-black text-muted">
                                #{i + 1}
                            </span>
                            <img
                                src={entry.avatarUrl}
                                alt={entry.login}
                                className="w-8 h-8 rounded-full"
                                width={32}
                                height={32}
                                loading="lazy"
                                decoding="async"
                            />
                            <span className="font-headline text-sm font-black text-dark flex-1">
                                {entry.login}
                            </span>
                            <span className="text-xs text-muted">
                                {entry.questCount}{" "}
                                {entry.questCount === 1
                                    ? copy.questLabel
                                    : copy.questCountLabel}
                            </span>
                            <span className="text-xs font-headline font-black text-primary">
                                {entry.totalPollen} {copy.pollenLabel}
                            </span>
                        </a>
                    ))}
                </div>
            </div>
            <Divider />
        </>
    );
}
