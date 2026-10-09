import {
    Chip,
    ContentHeader,
    ExternalLinkButton,
    Heading,
    StatCard,
    Surface,
    Text,
} from "@pollinations/ui";
import { useQuestLeaderboard } from "../../data/community";

const QUESTS_PAGE_URL = "https://enter.pollinations.ai/quests";
const VISIBLE_CONTRIBUTORS = 8;

function formatNumber(value: number) {
    return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

/** Global Quest totals and the top earners, with loading and failure states. */
export function QuestLeaderboard() {
    const { data, loading } = useQuestLeaderboard();

    return (
        <section className="flex flex-col gap-5">
            <ContentHeader
                eyebrow={null}
                title="Quest leaderboard"
                subtitle="pollen earned by completing Quests and contributing to Pollinations."
                action={
                    <ExternalLinkButton
                        href={QUESTS_PAGE_URL}
                        size="md"
                        intent="brand"
                    >
                        Explore Quests
                    </ExternalLinkButton>
                }
            />
            {data ? (
                <>
                    <dl
                        className="grid grid-cols-1 gap-3 min-[440px]:grid-cols-3"
                        aria-label="Quest leaderboard totals"
                    >
                        {(
                            [
                                ["Participants", data.totals.contributors],
                                ["Rewards earned", data.totals.completedQuests],
                                ["pollen earned", data.totals.totalPollen],
                            ] as const
                        ).map(([label, value]) => (
                            <Surface key={label} as="div" variant="card">
                                <StatCard
                                    label={label}
                                    value={formatNumber(value)}
                                    className="flex flex-col"
                                    labelClassName="order-2 font-normal text-xs normal-case tracking-normal"
                                    valueClassName="order-1 mt-0 font-heading font-normal text-3xl text-theme-text-soft"
                                />
                            </Surface>
                        ))}
                    </dl>

                    <ol className="grid grid-cols-1 gap-3 min-[900px]:grid-cols-2">
                        {data.leaderboard
                            .slice(0, VISIBLE_CONTRIBUTORS)
                            .map((entry, index) => (
                                <li key={entry.githubLogin}>
                                    <Surface
                                        as="a"
                                        variant="card"
                                        href={`https://github.com/${encodeURIComponent(entry.githubLogin)}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex h-full items-center gap-3 transition-colors hover:bg-theme-bg-subtle"
                                    >
                                        {/* The top three take the amber accent: a small podium. */}
                                        <Chip
                                            intent={
                                                index < 3
                                                    ? undefined
                                                    : "neutral"
                                            }
                                            size="sm"
                                            aria-label={`Rank ${index + 1}`}
                                            className="w-8"
                                        >
                                            {index + 1}
                                        </Chip>
                                        <img
                                            src={`https://github.com/${encodeURIComponent(entry.githubLogin)}.png?size=64`}
                                            alt=""
                                            aria-hidden="true"
                                            className="size-9 shrink-0 rounded-full bg-theme-bg-subtle"
                                            loading="lazy"
                                            decoding="async"
                                            width={36}
                                            height={36}
                                        />
                                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                                            <Heading
                                                as="span"
                                                size="card"
                                                className="truncate"
                                            >
                                                @{entry.githubLogin}
                                            </Heading>
                                            <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                                                <Text
                                                    as="span"
                                                    size="xs"
                                                    tone="muted"
                                                    className="whitespace-nowrap"
                                                >
                                                    {formatNumber(
                                                        entry.completedQuests,
                                                    )}{" "}
                                                    {entry.completedQuests === 1
                                                        ? "reward"
                                                        : "rewards"}
                                                </Text>
                                                {/* Quest payouts, in the wallet's Quest green. */}
                                                <Text
                                                    as="strong"
                                                    size="xs"
                                                    weight="bold"
                                                    className="polli-wallet-text-tier whitespace-nowrap tabular-nums"
                                                >
                                                    {formatNumber(
                                                        entry.totalPollen,
                                                    )}{" "}
                                                    pollen earned
                                                </Text>
                                            </span>
                                        </span>
                                    </Surface>
                                </li>
                            ))}
                    </ol>
                </>
            ) : loading ? (
                <div
                    aria-busy="true"
                    className="h-40 animate-pulse rounded-xl bg-theme-bg-subtle"
                />
            ) : (
                <Text size="sm" tone="muted">
                    The Quest leaderboard couldn’t be loaded right now.
                </Text>
            )}
        </section>
    );
}
