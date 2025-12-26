import { useEffect, useState } from "react";
import { Divider } from "./ui/divider";
import { Body, Heading } from "./ui/typography";

interface Contributor {
    login: string;
    avatar_url: string;
    profile_url: string;
    contributions: number;
}

export function TopContributors() {
    const [contributors, setContributors] = useState<Contributor[]>([]);
    const [loadingContributors, setLoadingContributors] = useState(true);

    useEffect(() => {
        const fetchTopContributors365 = async () => {
            try {
                const since = new Date(
                    Date.now() - 365 * 24 * 60 * 60 * 1000,
                ).toISOString();

                const perPage = 100;
                let page = 1;
                const contributorMap = new Map<string, any>();

                while (page <= 5) {
                    const res = await fetch(
                        `https://api.github.com/repos/pollinations/pollinations/commits?since=${since}&per_page=${perPage}&page=${page}`,
                        {
                            headers: {
                                Accept: "application/vnd.github+json",
                            },
                        },
                    );

                    const commits = await res.json();
                    if (!Array.isArray(commits) || commits.length === 0) break;

                    for (const c of commits) {
                        if (!c.author || !c.author.login) continue;

                        const login = c.author.login;
                        if (
                            login.includes("[bot]") ||
                            login.endsWith("-bot") ||
                            login.includes("Copilot")
                        )
                            continue;

                        if (!contributorMap.has(login)) {
                            contributorMap.set(login, {
                                login,
                                avatar_url: c.author.avatar_url,
                                profile_url: c.author.html_url,
                                contributions: 0,
                            });
                        }

                        contributorMap.get(login).contributions += 1;
                    }

                    page++;
                }

                const topContributors = Array.from(contributorMap.values())
                    .sort((a, b) => b.contributions - a.contributions)
                    .slice(0, 12);

                setContributors(topContributors);
            } catch (err) {
                console.error("Contributor aggregation failed:", err);
            } finally {
                setLoadingContributors(false);
            }
        };

        fetchTopContributors365();
    }, []);

    if (loadingContributors && contributors.length === 0) {
        return null;
    }

    if (!loadingContributors && contributors.length === 0) {
        return null;
    }

    return (
        <>
            <style>{`
                @keyframes glow {
                    0%, 100% {
                        box-shadow: 0 0 10px rgba(250, 204, 21, 0.4);
                    }
                    50% {
                        box-shadow: 0 0 20px rgba(250, 204, 21, 0.8);
                    }
                }
                @keyframes bounce-subtle {
                    0%, 100% {
                        transform: translateY(0);
                    }
                    50% {
                        transform: translateY(-4px);
                    }
                }
                @keyframes shine {
                    0% {
                        background-position: -1000px 0;
                    }
                    100% {
                        background-position: 1000px 0;
                    }
                }
                .top-contributor {
                    animation: glow 2s ease-in-out infinite, bounce-subtle 2s ease-in-out infinite;
                }
                .medal-badge {
                    animation: bounce-subtle 1.5s ease-in-out infinite;
                }
            `}</style>
            <div className="mb-12">
                <Heading variant="section">Most Active Contributors</Heading>
                <Body size="sm" spacing="comfortable">
                    Meet the most active contributors to the pollinations.ai{" "}
                    <a
                        href="https://github.com/pollinations/pollinations"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline hover:opacity-80"
                    >
                        GitHub repository
                    </a>{" "}
                    over the past year.
                </Body>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                    {contributors.map((contributor, index) => {
                        const isTopThree = index < 3;
                        return (
                            <a
                                key={contributor.login}
                                href={contributor.profile_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`group flex flex-col items-center text-center ${
                                    isTopThree ? "relative" : ""
                                } hover:opacity-70 transition-opacity`}
                            >
                                <div
                                    className={`w-16 h-16 mb-2 overflow-hidden rounded-full border-2 ${
                                        isTopThree
                                            ? "border-yellow-400 top-contributor"
                                            : "border-border-brand group-hover:border-border-highlight"
                                    } transition-colors`}
                                >
                                    <img
                                        src={contributor.avatar_url}
                                        alt={contributor.login}
                                        className="w-full h-full object-cover"
                                    />
                                </div>
                                <p
                                    className={`font-headline text-xs font-black ${
                                        isTopThree
                                            ? "text-text-body-main"
                                            : "text-text-body-main"
                                    } mb-1`}
                                >
                                    {contributor.login}
                                </p>
                                <p className="font-body text-[10px] text-text-body-tertiary">
                                    {contributor.contributions}{" "}
                                    {contributor.contributions === 1
                                        ? "commit"
                                        : "commits"}
                                </p>
                            </a>
                        );
                    })}
                </div>
            </div>
            <Divider />
        </>
    );
}
