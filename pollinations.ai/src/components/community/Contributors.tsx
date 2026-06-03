import { InlineLink, Section } from "@pollinations/ui";
import { useEffect, useState } from "react";
import { CONTRIBUTORS } from "./copy.ts";

type Contributor = {
    login: string;
    avatarUrl: string;
    profileUrl: string;
    contributions: number;
};

const CACHE_KEY = "community_top_contributors_v1";
const REPO = "pollinations/pollinations";
const MAX_PAGES = 5;
const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

// Aggregate the most active commit authors over the past year from the public
// GitHub API. No auth needed; results are cached in localStorage for the day.
async function fetchTopContributors(): Promise<Contributor[]> {
    const since = new Date(Date.now() - YEAR_MS).toISOString();
    const byLogin = new Map<string, Contributor>();

    for (let page = 1; page <= MAX_PAGES; page++) {
        const res = await fetch(
            `https://api.github.com/repos/${REPO}/commits?since=${since}&per_page=100&page=${page}`,
            { headers: { Accept: "application/vnd.github+json" } },
        );
        if (!res.ok) break;
        const commits = await res.json();
        if (!Array.isArray(commits) || commits.length === 0) break;

        for (const commit of commits) {
            const login = commit.author?.login;
            if (!login) continue;
            if (
                login.includes("[bot]") ||
                login.endsWith("-bot") ||
                login.includes("Copilot")
            )
                continue;

            const existing = byLogin.get(login);
            if (existing) {
                existing.contributions += 1;
            } else {
                byLogin.set(login, {
                    login,
                    avatarUrl: commit.author.avatar_url,
                    profileUrl: commit.author.html_url,
                    contributions: 1,
                });
            }
        }
    }

    return Array.from(byLogin.values())
        .sort((a, b) => b.contributions - a.contributions)
        .slice(0, 16);
}

export function Contributors() {
    const [contributors, setContributors] = useState<Contributor[]>([]);

    useEffect(() => {
        const today = new Date().toISOString().slice(0, 10);

        try {
            const cached = localStorage.getItem(CACHE_KEY);
            if (cached) {
                const { data, day } = JSON.parse(cached);
                if (day === today && Array.isArray(data)) {
                    setContributors(data);
                    return;
                }
            }
        } catch {
            // corrupted cache — fall through to fetch
        }

        let active = true;
        fetchTopContributors()
            .then((data) => {
                if (!active) return;
                setContributors(data);
                try {
                    localStorage.setItem(
                        CACHE_KEY,
                        JSON.stringify({ data, day: today }),
                    );
                } catch {
                    // localStorage unavailable — skip caching
                }
            })
            .catch(() => {
                // GitHub rate limit / offline — section stays hidden
            });

        return () => {
            active = false;
        };
    }, []);

    if (contributors.length === 0) return null;

    return (
        <Section title={CONTRIBUTORS.title} theme="pink" framed>
            <p className="max-w-2xl text-theme-text-base">
                {CONTRIBUTORS.description} {CONTRIBUTORS.ctaPre}
                <InlineLink href={CONTRIBUTORS.ctaHref} className="text-sm">
                    {CONTRIBUTORS.ctaLink}
                </InlineLink>
                {CONTRIBUTORS.ctaPost}
            </p>
            <div className="grid grid-cols-3 gap-5 sm:grid-cols-4 md:grid-cols-6">
                {contributors.map((contributor) => (
                    <a
                        key={contributor.login}
                        href={contributor.profileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={`${contributor.contributions} ${
                            contributor.contributions === 1
                                ? CONTRIBUTORS.commitLabel
                                : CONTRIBUTORS.commitsLabel
                        }`}
                        className="group flex flex-col items-center gap-2 text-center"
                    >
                        <img
                            src={contributor.avatarUrl}
                            alt={contributor.login}
                            width={56}
                            height={56}
                            loading="lazy"
                            decoding="async"
                            className="h-14 w-14 rounded-full bg-surface-white object-cover ring-2 ring-theme-border transition group-hover:ring-theme-bg-hover"
                        />
                        <span className="min-w-0 max-w-full truncate text-xs font-medium text-theme-text-soft">
                            {contributor.login}
                        </span>
                    </a>
                ))}
            </div>
        </Section>
    );
}
