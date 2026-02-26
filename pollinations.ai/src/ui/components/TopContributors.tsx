import { useEffect, useState } from "react";
import { COMMUNITY_PAGE } from "../../copy/content/community";
import { usePageCopy } from "../../hooks/usePageCopy";
import { Divider } from "./ui/divider";
import { Body, Heading } from "./ui/typography";

interface Contributor {
    login: string;
    avatar_url: string;
    profile_url: string;
    contributions: number;
}

export function TopContributors() {
    // Get translated copy
    const { copy } = usePageCopy(COMMUNITY_PAGE);

    const [contributors, setContributors] = useState<Contributor[]>([]);
    const [loadingContributors, setLoadingContributors] = useState(true);

    useEffect(() => {
        const CACHE_KEY = "top_contributors_v1";
        const today = new Date().toISOString().slice(0, 10);

        // Check localStorage cache (expires at start of new UTC day)
        try {
            const cached = localStorage.getItem(CACHE_KEY);
            if (cached) {
                const { data, day } = JSON.parse(cached);
                if (day === today) {
                    setContributors(data);
                    setLoadingContributors(false);
                    return;
                }
            }
        } catch {
            // corrupted cache — continue to fetch
        }

        const fetchTopContributors365 = async () => {
            try {
                const since = new Date(
                    Date.now() - 365 * 24 * 60 * 60 * 1000,
                ).toISOString();

                const perPage = 100;
                let page = 1;
                const contributorMap = new Map<string, Contributor>();

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

                        const contributor = contributorMap.get(login);
                        if (contributor) contributor.contributions += 1;
                    }

                    page++;
                }

                const topContributors = Array.from(contributorMap.values())
                    .sort((a, b) => b.contributions - a.contributions)
                    .slice(0, 16);

                setContributors(topContributors);

                // Cache the results
                try {
                    localStorage.setItem(
                        CACHE_KEY,
                        JSON.stringify({
                            data: topContributors,
                            day: today,
                        }),
                    );
                } catch {
                    // localStorage full — skip
                }
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
            <div className="mb-12">
                <Heading variant="section">{copy.topContributorsTitle}</Heading>
                <Body size="sm" spacing="comfortable">
                    {copy.topContributorsDescription}{" "}
                    <a
                        href="https://github.com/pollinations/pollinations"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline hover:opacity-80"
                    >
                        {copy.githubRepositoryLink}
                    </a>{" "}
                    {copy.overThePastYear}
                </Body>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                    {contributors.map((contributor) => (
                        <a
                            key={contributor.login}
                            href={contributor.profile_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="group flex flex-col items-center text-center hover:opacity-70 transition-opacity"
                        >
                            <div className="w-16 h-16 mb-2 overflow-hidden rounded-full border-2 border-border-brand group-hover:border-border-highlight transition-colors">
                                <img
                                    src={contributor.avatar_url}
                                    alt={contributor.login}
                                    className="w-full h-full object-cover"
                                />
                            </div>
                            <p className="font-headline text-sm font-black text-text-body-main mb-1">
                                {contributor.login}
                            </p>
                        </a>
                    ))}
                </div>
            </div>
            <Divider />
        </>
    );
}
