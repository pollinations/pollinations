import { ContentHeader, InlineLink, LinkCard } from "@pollinations/ui";
import { useEffect, useState } from "react";
import { COMMUNITY_PAGE } from "../../copy/content/community";
import { usePageCopy } from "../../hooks/usePageCopy";

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
            }
        };

        fetchTopContributors365();
    }, []);

    if (contributors.length === 0) {
        return null;
    }

    return (
        <section className="flex flex-col gap-5">
            <ContentHeader
                eyebrow={null}
                title={copy.topContributorsTitle}
                subtitle={
                    <>
                        {copy.topContributorsDescription}
                        <br />
                        {copy.topContributorsCta}{" "}
                        <InlineLink href="https://github.com/pollinations/pollinations">
                            {copy.githubRepositoryLink}
                        </InlineLink>{" "}
                        {copy.overThePastYear}
                    </>
                }
            />
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(190px,100%),1fr))] gap-3.5">
                {contributors.map((contributor) => (
                    <LinkCard
                        key={contributor.login}
                        href={contributor.profile_url}
                        showIcon={false}
                        surfaceClassName="flex-row items-center gap-3.5 rounded-2xl p-4"
                    >
                        <img
                            src={contributor.avatar_url}
                            alt=""
                            aria-hidden="true"
                            loading="lazy"
                            decoding="async"
                            width={40}
                            height={40}
                            className="size-10 shrink-0 rounded-[10px] bg-theme-bg-subtle"
                        />
                        <span className="truncate font-semibold text-sm text-theme-text-strong">
                            {contributor.login}
                        </span>
                    </LinkCard>
                ))}
            </div>
        </section>
    );
}
