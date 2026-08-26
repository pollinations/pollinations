import { useEffect, useState } from "react";
import { LINKS } from "../../copy/content/socialLinks";

type QuestLeaderboardEntry = {
    githubUsername: string;
    completedQuests: number;
    totalPollen: number;
};

const CACHE_KEY = "quest_leaderboard_v1";
const CACHE_TTL_MS = 15 * 60 * 1000;
const LEADERBOARD_LIMIT = 10;

function readCachedLeaderboard(): QuestLeaderboardEntry[] | null {
    try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (!cached) return null;
        const { data, cachedAt } = JSON.parse(cached) as {
            data: QuestLeaderboardEntry[];
            cachedAt: number;
        };
        if (Date.now() - cachedAt > CACHE_TTL_MS) return null;
        return Array.isArray(data) ? data : null;
    } catch {
        return null;
    }
}

/**
 * Compact Quest leaderboard for the Community page: the public GitHub
 * identities with the most completed POLLEN-QUEST bounties and total quest
 * pollen earned. Data comes from the aggregate-only /quests/leaderboard
 * endpoint backed by the existing reward ledger.
 */
export function QuestLeaderboard() {
    const [entries, setEntries] = useState<QuestLeaderboardEntry[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;

        const cached = readCachedLeaderboard();
        if (cached) {
            setEntries(cached);
            setLoading(false);
            return;
        }

        fetch("https://enter.pollinations.ai/api/quests/leaderboard", {
            headers: { Accept: "application/json" },
        })
            .then((res) => {
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return res.json() as Promise<{
                    leaderboard: QuestLeaderboardEntry[];
                }>;
            })
            .then(({ leaderboard }) => {
                if (cancelled) return;
                const top = leaderboard.slice(0, LEADERBOARD_LIMIT);
                setEntries(top);
                try {
                    localStorage.setItem(
                        CACHE_KEY,
                        JSON.stringify({ data: top, cachedAt: Date.now() }),
                    );
                } catch {
                    // localStorage full — skip caching
                }
            })
            .catch(() => {
                // Endpoint unavailable — render nothing rather than a broken list.
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, []);

    if (!loading && entries.length === 0) return null;

    return (
        <div className="mb-12">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <Heading variant="section">Quest leaderboard</Heading>
                <a
                    href={LINKS.enter}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-headline text-xs font-black hover:underline inline-flex items-center gap-1 text-dark bg-accent-strong px-2 py-0.5"
                >
                    Join the quests
                </a>
            </div>
            <Body size="sm" spacing="comfortable">
                Top quest contributors by completed bounty issues and total
                Quest Pollen earned.
            </Body>
            <div className="overflow-hidden rounded-sub-card border-r-2 border-b-2 border-border-subtle">
                <table className="w-full text-left font-body text-sm">
                    <thead>
                        <tr className="bg-white/60 font-headline text-[10px] font-black uppercase tracking-wide text-muted">
                            <th scope="col" className="px-3 py-2">
                                #
                            </th>
                            <th scope="col" className="px-3 py-2">
                                Contributor
                            </th>
                            <th scope="col" className="px-3 py-2 text-right">
                                Quests
                            </th>
                            <th scope="col" className="px-3 py-2 text-right">
                                Quest Pollen
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {(loading ? [null, null, null] : entries).map(
                            (entry, index) =>
                                entry ? (
                                    <tr
                                        key={entry.githubUsername}
                                        className="border-t border-border-subtle"
                                    >
                                        <td className="px-3 py-1.5 font-mono text-xs text-subtle">
                                            {index + 1}
                                        </td>
                                        <td className="px-3 py-1.5">
                                            <a
                                                href={`https://github.com/${entry.githubUsername}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="font-headline text-xs font-black text-dark hover:underline"
                                            >
                                                {entry.githubUsername}
                                            </a>
                                        </td>
                                        <td className="px-3 py-1.5 text-right tabular-nums">
                                            {entry.completedQuests}
                                        </td>
                                        <td className="px-3 py-1.5 text-right tabular-nums">
                                            {entry.totalPollen.toLocaleString(
                                                "en",
                                            )}
                                        </td>
                                    </tr>
                                ) : (
                                    <tr key="leaderboard-loading">
                                        <td colSpan={4} className="px-3 py-2">
                                            <div className="h-4 w-full animate-pulse bg-border opacity-40" />
                                        </td>
                                    </tr>
                                ),
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
