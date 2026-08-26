import { useEffect, useState } from "react";
import { LINKS } from "../../copy/content/socialLinks";
import { ExternalLinkIcon } from "../assets/ExternalLinkIcon";
import { Divider } from "./ui/divider";
import { Body, Heading } from "./ui/typography";

interface LeaderboardEntry {
    githubUsername: string;
    avatarUrl: string | null;
    completedQuests: number;
    totalPollen: number;
}

export function QuestLeaderboard() {
    const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;

        const fetchLeaderboard = async () => {
            try {
                const res = await fetch(
                    "https://enter.pollinations.ai/api/quests/leaderboard",
                );
                if (!res.ok) return;
                const data = await res.json();
                if (!cancelled && Array.isArray(data.leaderboard)) {
                    setEntries(data.leaderboard);
                }
            } catch {
                // Leaderboard is decorative; stay hidden on failure.
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        fetchLeaderboard();
        return () => {
            cancelled = true;
        };
    }, []);

    if (loading && entries.length === 0) return null;
    if (entries.length === 0) return null;

    return (
        <>
            <div className="mb-12">
                <Heading variant="section">Quest leaderboard</Heading>
                <Body size="sm" spacing="comfortable">
                    Top quest hunters ranked by Quest Pollen earned from
                    completed GitHub quest issues.{" "}
                    <a
                        href={LINKS.enterQuests}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-headline text-xs font-black hover:underline inline-flex items-center gap-1 text-dark bg-accent-strong px-2 py-0.5"
                    >
                        Join the quests
                        <ExternalLinkIcon className="w-3 h-3" strokeWidth="4" />
                    </a>
                </Body>
                <div className="overflow-hidden rounded-sub-card border-2 border-dark border-r-4 border-b-4">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-primary-light">
                                <th
                                    scope="col"
                                    className="px-4 py-2 font-headline text-[10px] font-black uppercase text-dark"
                                >
                                    #
                                </th>
                                <th
                                    scope="col"
                                    className="px-4 py-2 font-headline text-[10px] font-black uppercase text-dark"
                                >
                                    Contributor
                                </th>
                                <th
                                    scope="col"
                                    className="px-4 py-2 text-right font-headline text-[10px] font-black uppercase text-dark"
                                >
                                    Quests
                                </th>
                                <th
                                    scope="col"
                                    className="px-4 py-2 text-right font-headline text-[10px] font-black uppercase text-dark"
                                >
                                    Quest Pollen
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {entries.map((entry, index) => (
                                <tr
                                    key={entry.githubUsername}
                                    className="border-t border-border-subtle bg-white/60"
                                >
                                    <td className="px-4 py-2 font-mono text-xs text-subtle">
                                        {index + 1}
                                    </td>
                                    <td className="px-4 py-2">
                                        <a
                                            href={`https://github.com/${entry.githubUsername}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-2 font-headline text-xs font-black text-dark hover:underline"
                                        >
                                            {entry.avatarUrl && (
                                                <img
                                                    src={entry.avatarUrl}
                                                    alt=""
                                                    className="h-6 w-6 rounded-full"
                                                    loading="lazy"
                                                    decoding="async"
                                                    width={24}
                                                    height={24}
                                                />
                                            )}
                                            {entry.githubUsername}
                                        </a>
                                    </td>
                                    <td className="px-4 py-2 text-right font-mono text-xs text-dark">
                                        {entry.completedQuests}
                                    </td>
                                    <td className="px-4 py-2 text-right font-mono text-xs font-bold text-dark">
                                        {entry.totalPollen}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
            <Divider />
        </>
    );
}
