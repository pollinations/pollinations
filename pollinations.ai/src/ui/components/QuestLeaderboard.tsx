import { useEffect, useState } from "react";
import { LINKS, SOCIAL_LINKS } from "../../copy/content/socialLinks";
import { usePageCopy } from "../../hooks/usePageCopy";
import { ExternalLinkIcon } from "../assets/ExternalLinkIcon";
import { Divider } from "./ui/divider";
import { Body, Heading } from "./ui/typography";

const ENTER_API = "https://enter.pollinations.ai";

interface LeaderboardEntry {
    githubUsername: string;
    githubId: number;
    questCount: number;
    totalPollen: number;
}

interface LeaderboardResponse {
    entries: LeaderboardEntry[];
}

const LEADERBOARD_COPY = {
    title: "Quest Leaderboard",
    subtitle:
        "Top contributors ranked by Quest Pollen earned from completing community quests.",
    cta: "Complete quests to earn Pollen — see",
    ctaLink: "open quests",
    noData: "No quest completions yet. Be the first!",
    quests: "quests",
};

export function QuestLeaderboard() {
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

        const fetchLeaderboard = async () => {
            try {
                const res = await fetch(`${ENTER_API}/api/quests/leaderboard`);
                if (!res.ok) return;
                const data: LeaderboardResponse = await res.json();
                setEntries(data.entries);

                try {
                    localStorage.setItem(
                        CACHE_KEY,
                        JSON.stringify({ data: data.entries, day: today }),
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

    if (loading && entries.length === 0) return null;
    if (!loading && entries.length === 0) return null;

    return (
        <>
            <div className="mb-12">
                <Heading variant="section">{LEADERBOARD_COPY.title}</Heading>
                <Body size="sm" spacing="comfortable">
                    {LEADERBOARD_COPY.subtitle}
                    <br />
                    {LEADERBOARD_COPY.cta}{" "}
                    <a
                        href={LINKS.enter}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-headline text-xs font-black hover:underline inline-flex items-center gap-1 text-dark bg-accent-strong px-2 py-0.5"
                    >
                        {LEADERBOARD_COPY.ctaLink}
                        <ExternalLinkIcon className="w-3 h-3" strokeWidth={4} />
                    </a>
                </Body>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {entries.slice(0, 9).map((entry, i) => {
                        const colors = [
                            "border-primary-strong shadow-[1px_1px_0_rgb(var(--primary-strong)_/_0.3)]",
                            "border-secondary-strong shadow-[1px_1px_0_rgb(var(--secondary-strong)_/_0.3)]",
                            "border-tertiary-strong shadow-[1px_1px_0_rgb(var(--tertiary-strong)_/_0.3)]",
                        ];
                        const rankBadge =
                            i === 0
                                ? "🏆"
                                : i === 1
                                  ? "🥈"
                                  : i === 2
                                    ? "🥉"
                                    : `#${i + 1}`;
                        return (
                            <a
                                key={entry.githubUsername}
                                href={`https://github.com/${entry.githubUsername}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`block bg-white/60 p-4 rounded-sub-card border-r-2 border-b-2 ${colors[i % colors.length]} transition hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none active:translate-x-[2px] active:translate-y-[2px] active:shadow-none`}
                            >
                                <div className="flex items-center gap-3">
                                    <img
                                        src={`https://github.com/${entry.githubUsername}.png?size=64`}
                                        alt={entry.githubUsername}
                                        className="w-10 h-10 rounded-full border border-border-subtle"
                                        loading="lazy"
                                        decoding="async"
                                    />
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                            <span className="text-lg">
                                                {rankBadge}
                                            </span>
                                            <span className="font-headline text-xs font-black text-dark truncate">
                                                {entry.githubUsername}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className="font-mono text-xs text-subtle">
                                                {entry.questCount}{" "}
                                                {LEADERBOARD_COPY.quests}
                                            </span>
                                            <span className="text-border-subtle">
                                                ·
                                            </span>
                                            <span className="font-mono text-xs font-bold text-dark">
                                                {entry.totalPollen} Pollen
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </a>
                        );
                    })}
                </div>
            </div>
            <Divider />
        </>
    );
}
