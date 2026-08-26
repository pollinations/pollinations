import { useEffect, useState } from "react";
import { LINKS } from "../../copy/content/socialLinks";
import { ExternalLinkIcon } from "../assets/ExternalLinkIcon";
import { Divider } from "./ui/divider";
import { Body, Heading } from "./ui/typography";

type LeaderboardEntry = {
    githubLogin: string;
    completedQuests: number;
    totalPollen: number;
};

type QuestLeaderboardData = {
    leaderboard: LeaderboardEntry[];
    totals: {
        contributors: number;
        completedQuests: number;
        totalPollen: number;
    };
};

const LEADERBOARD_API = `${LINKS.enter}/api/quests/leaderboard`;
const QUESTS_PAGE_URL = `${LINKS.enter}/quests`;

/** Compact leaderboard of Pollen earned from public GitHub POLLEN-QUEST issues. */
export function QuestLeaderboard() {
    const [data, setData] = useState<QuestLeaderboardData | null>(null);

    useEffect(() => {
        let cancelled = false;
        fetch(LEADERBOARD_API)
            .then((res) => (res.ok ? res.json() : null))
            .then((body: QuestLeaderboardData | null) => {
                if (!cancelled && body && body.leaderboard.length > 0) {
                    setData(body);
                }
            })
            .catch(() => {
                // The section simply stays hidden without data.
            });
        return () => {
            cancelled = true;
        };
    }, []);

    if (!data) return null;

    return (
        <>
            <div className="mb-12">
                <Heading variant="section">Quest leaderboard</Heading>
                <Body size="sm" spacing="comfortable">
                    Community members who completed public GitHub{" "}
                    <strong>POLLEN-QUEST</strong> issues, ranked by quest Pollen
                    earned — {data.totals.completedQuests} quests solved for{" "}
                    {Math.round(data.totals.totalPollen)} Pollen across{" "}
                    {data.totals.contributors} contributors.
                </Body>
                <div className="overflow-hidden rounded-sub-card border border-border-subtle bg-white/60">
                    <table className="w-full text-left font-body text-sm">
                        <thead>
                            <tr className="border-b border-border-subtle">
                                <th className="px-4 py-2 font-headline text-[10px] font-black uppercase text-muted">
                                    #
                                </th>
                                <th className="px-4 py-2 font-headline text-[10px] font-black uppercase text-muted">
                                    Contributor
                                </th>
                                <th className="px-4 py-2 text-right font-headline text-[10px] font-black uppercase text-muted">
                                    Quests
                                </th>
                                <th className="px-4 py-2 text-right font-headline text-[10px] font-black uppercase text-muted">
                                    Pollen
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.leaderboard.map((entry, index) => (
                                <tr
                                    key={entry.githubLogin}
                                    className="border-b border-border-subtle last:border-b-0"
                                >
                                    <td className="px-4 py-2 font-mono text-xs text-subtle">
                                        {index + 1}
                                    </td>
                                    <td className="px-4 py-2">
                                        <a
                                            href={`https://github.com/${entry.githubLogin}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="font-bold text-dark hover:underline"
                                        >
                                            {entry.githubLogin}
                                        </a>
                                    </td>
                                    <td className="px-4 py-2 text-right tabular-nums">
                                        {entry.completedQuests}
                                    </td>
                                    <td className="px-4 py-2 text-right font-bold tabular-nums">
                                        {entry.totalPollen % 1 === 0
                                            ? entry.totalPollen
                                            : entry.totalPollen.toFixed(2)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <Body size="sm" spacing="comfortable" className="mt-3">
                    Want on the board?{" "}
                    <a
                        href={QUESTS_PAGE_URL}
                        className="font-headline text-xs font-black hover:underline inline-flex items-center gap-1 text-dark bg-accent-strong px-2 py-0.5"
                    >
                        Pick a Quest
                        <ExternalLinkIcon className="w-3 h-3" strokeWidth="4" />
                    </a>{" "}
                    and ship a merged PR.
                </Body>
            </div>
            <Divider />
        </>
    );
}
