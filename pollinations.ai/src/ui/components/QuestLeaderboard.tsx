import { useEffect, useState } from "react";
import { COMMUNITY_PAGE } from "../../copy/content/community";
import { usePageCopy } from "../../hooks/usePageCopy";

export type QuestLeaderboardEntry = {
    githubLogin: string;
    completedQuests: number;
    totalPollen: number;
};

export type QuestLeaderboardData = {
    leaderboard: QuestLeaderboardEntry[];
    totals: {
        contributors: number;
        completedQuests: number;
        totalPollen: number;
    };
};

const LEADERBOARD_API = "https://enter.pollinations.ai/api/quests/leaderboard";
const QUESTS_PAGE_URL = "https://enter.pollinations.ai/quests";
const VISIBLE_CONTRIBUTORS = 8;

/** Pure view exported so the rendered leaderboard can be tested without fetch. */
export function QuestLeaderboardContent({
    data,
}: {
    data: QuestLeaderboardData;
}) {
    const { copy } = usePageCopy(COMMUNITY_PAGE);
    const visible = data.leaderboard.slice(0, VISIBLE_CONTRIBUTORS);

    return (
        <section className="mb-12" aria-labelledby="quest-leaderboard-heading">
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <h2
                        id="quest-leaderboard-heading"
                        className="mb-3 border-l-4 border-dark pl-4 font-headline text-2xl font-black uppercase tracking-widest text-dark md:text-3xl"
                    >
                        {copy.questLeaderboardTitle}
                    </h2>
                    <p className="font-body text-sm leading-relaxed text-dark">
                        {copy.questLeaderboardDescription}
                    </p>
                </div>
                <a
                    href={QUESTS_PAGE_URL}
                    className="w-fit bg-accent-strong px-2 py-1 font-headline text-xs font-black text-dark hover:underline"
                >
                    {copy.questLeaderboardCta}
                </a>
            </div>

            <dl
                className="mb-4 grid grid-cols-3 gap-2"
                aria-label={copy.questLeaderboardTotalsLabel}
            >
                <div className="rounded-sub-card border border-border-subtle bg-white/60 p-3">
                    <dd className="font-headline text-lg font-black text-dark">
                        {data.totals.contributors}
                    </dd>
                    <dt className="font-body text-xs text-subtle">
                        {copy.questLeaderboardBuildersLabel}
                    </dt>
                </div>
                <div className="rounded-sub-card border border-border-subtle bg-white/60 p-3">
                    <dd className="font-headline text-lg font-black text-dark">
                        {data.totals.completedQuests}
                    </dd>
                    <dt className="font-body text-xs text-subtle">
                        {copy.questLeaderboardCompletedLabel}
                    </dt>
                </div>
                <div className="rounded-sub-card border border-border-subtle bg-white/60 p-3">
                    <dd className="font-headline text-lg font-black text-dark">
                        {data.totals.totalPollen}
                    </dd>
                    <dt className="font-body text-xs text-subtle">
                        {copy.questLeaderboardPollenLabel}
                    </dt>
                </div>
            </dl>

            <ol className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {visible.map((entry, index) => (
                    <li key={entry.githubLogin}>
                        <a
                            href={`https://github.com/${encodeURIComponent(entry.githubLogin)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-3 rounded-sub-card border border-border-subtle bg-white/60 px-3 py-3 transition hover:translate-x-[1px] hover:translate-y-[1px]"
                        >
                            <span
                                aria-hidden="true"
                                className="w-6 shrink-0 text-center font-headline text-xs font-black text-muted"
                            >
                                {index + 1}
                            </span>
                            <img
                                src={`https://github.com/${encodeURIComponent(entry.githubLogin)}.png?size=64`}
                                alt=""
                                className="h-8 w-8 shrink-0 rounded-full"
                                loading="lazy"
                                decoding="async"
                                width={32}
                                height={32}
                            />
                            <span className="min-w-0 flex-1">
                                <span className="block truncate font-headline text-xs font-black text-dark">
                                    @{entry.githubLogin}
                                </span>
                                <span className="block font-body text-xs text-subtle">
                                    {entry.completedQuests}{" "}
                                    {copy.questLeaderboardRowCompletedLabel}
                                </span>
                            </span>
                            <strong className="shrink-0 font-headline text-xs font-black text-dark">
                                {entry.totalPollen}{" "}
                                {copy.questLeaderboardRowPollenLabel}
                            </strong>
                        </a>
                    </li>
                ))}
            </ol>
        </section>
    );
}

/** Fetches the small public aggregate; failure keeps the optional section hidden. */
export function QuestLeaderboard() {
    const [data, setData] = useState<QuestLeaderboardData | null>(null);

    useEffect(() => {
        let cancelled = false;

        fetch(LEADERBOARD_API, { headers: { Accept: "application/json" } })
            .then(async (response) => {
                if (!response.ok) return null;
                return (await response.json()) as QuestLeaderboardData;
            })
            .then((body) => {
                if (
                    !cancelled &&
                    body &&
                    Array.isArray(body.leaderboard) &&
                    body.leaderboard.length > 0
                ) {
                    setData(body);
                }
            })
            .catch(() => {
                // Optional community section: leave it hidden on network failure.
            });

        return () => {
            cancelled = true;
        };
    }, []);

    if (!data) return null;

    return (
        <>
            <QuestLeaderboardContent data={data} />
            <hr className="my-12 border-t-2 border-white" />
        </>
    );
}
