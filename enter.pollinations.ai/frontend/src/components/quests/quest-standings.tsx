import { CardIcon, Section, Surface, TargetIcon, Text } from "@pollinations/ui";
import { formatPollen } from "@pollinations/ui/wallet";
import { roundPollenLedgerAmount } from "@shared/billing/precision.ts";
import { Fragment } from "react";
import type { QuestStandingsResponse } from "../../backend-types.ts";

type StandingRow = QuestStandingsResponse["rows"][number];

/** An open quest the viewer could complete next. */
export type NextQuest = { title: string; reward: number };

const DAY_MS = 24 * 60 * 60 * 1000;

function daysLeft(endsAt: string, now: number): number {
    return Math.max(1, Math.ceil((Date.parse(endsAt) - now) / DAY_MS));
}

function monthName(month: string): string {
    return new Date(`${month}-01T00:00:00Z`).toLocaleString("en", {
        month: "long",
        timeZone: "UTC",
    });
}

/**
 * The one line that turns the board into a next step: how far the viewer is
 * from the row above, and the cheapest open quest that closes that gap.
 */
function nudge(
    standings: QuestStandingsResponse,
    openQuests: NextQuest[],
): string | null {
    const { you, rows } = standings;
    if (!you) return "Sign in to join this month's race.";
    const byReward = [...openQuests].sort((a, b) => a.reward - b.reward);
    const rank = you.rank;
    if (rank === null) {
        const first = byReward[0];
        return first
            ? `Earn any quest to join the race — “${first.title}” is +${formatPollen(first.reward)}.`
            : "Earn any quest to join the race.";
    }
    if (rank === 1) return `You're leading ${monthName(standings.month)}.`;
    const above = rows.find((row) => row.rank === rank - 1);
    if (!above) return null;
    // Round away float noise (0.3 - 0.2) so the gap and quest pick stay exact.
    const gap = roundPollenLedgerAmount(above.totalPollen - you.totalPollen);
    const pass = byReward.find((quest) => quest.reward > gap);
    // A tie still ranks the viewer below, so passing takes the cheapest reward.
    const needed = gap > 0 ? gap : pass?.reward;
    if (needed === undefined) return `Tied with @${above.githubLogin}.`;
    const target = `${formatPollen(needed)} Pollen to pass @${above.githubLogin}`;
    return pass
        ? `${target} — “${pass.title}” is +${formatPollen(pass.reward)}.`
        : `${target}.`;
}

function StandingRowView({ row, isYou }: { row: StandingRow; isYou: boolean }) {
    return (
        <li
            className={`flex items-center gap-3 rounded-xl px-3 py-2 ${
                isYou ? "bg-theme-bg-active" : ""
            }`}
        >
            <span className="w-6 shrink-0 text-right text-sm font-semibold tabular-nums text-theme-text-muted">
                {row.rank}
            </span>
            <img
                src={`https://github.com/${encodeURIComponent(row.githubLogin)}.png?size=64`}
                alt=""
                aria-hidden="true"
                className="size-7 shrink-0 rounded-full bg-theme-bg-subtle"
                loading="lazy"
                width={28}
                height={28}
            />
            <Text
                as="span"
                weight={isYou ? "bold" : "semibold"}
                tone="strong"
                className="min-w-0 truncate"
            >
                {isYou ? "You" : `@${row.githubLogin}`}
            </Text>
            {row.supporter && (
                <span
                    title="Pollen supporter"
                    className="polli-wallet-chip-paid inline-flex size-5 shrink-0 items-center justify-center rounded-full"
                >
                    <CardIcon className="h-3 w-3" aria-hidden="true" />
                    <span className="sr-only">Pollen supporter</span>
                </span>
            )}
            <Text
                as="span"
                weight="semibold"
                tone="strong"
                className="ml-auto shrink-0 tabular-nums"
            >
                {formatPollen(row.totalPollen)}
            </Text>
        </li>
    );
}

/** Pure view so the rendered standings can be tested without fetch. */
export function QuestStandings({
    standings,
    openQuests,
    now = Date.now(),
}: {
    standings: QuestStandingsResponse;
    openQuests: NextQuest[];
    now?: number;
}) {
    const youRank = standings.you?.rank ?? null;
    const line = nudge(standings, openQuests);
    const days = daysLeft(standings.endsAt, now);

    return (
        <Section
            title={`${monthName(standings.month)} leaderboard`}
            action={
                <span className="text-xs font-medium tabular-nums text-theme-text-strong">
                    {days} {days === 1 ? "day" : "days"} left
                </span>
            }
        >
            <Surface variant="card" className="flex flex-col gap-2">
                {standings.rows.length === 0 ? (
                    <Text size="sm" tone="muted">
                        Nobody has earned a quest this month yet.
                    </Text>
                ) : (
                    <ol className="flex flex-col">
                        {standings.rows.map((row, index) => {
                            const previous = standings.rows[index - 1];
                            const skipped =
                                previous && row.rank > previous.rank + 1;
                            return (
                                <Fragment key={row.githubLogin}>
                                    {skipped && (
                                        <li
                                            aria-hidden="true"
                                            className="px-3 text-sm leading-none text-theme-text-muted"
                                        >
                                            ⋮
                                        </li>
                                    )}
                                    <StandingRowView
                                        row={row}
                                        isYou={row.rank === youRank}
                                    />
                                </Fragment>
                            );
                        })}
                    </ol>
                )}
                {line && (
                    <p className="flex items-start gap-1.5 border-theme-border border-t px-3 pt-3 font-medium text-sm leading-snug text-theme-text-strong">
                        <TargetIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span>{line}</span>
                    </p>
                )}
            </Surface>
        </Section>
    );
}
