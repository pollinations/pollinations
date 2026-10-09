import { CardIcon, Section, Surface, TargetIcon, Text } from "@pollinations/ui";
import { formatPollen } from "@pollinations/ui/wallet";
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
    const gap = above.totalPollen - you.totalPollen;
    const pass = byReward.find((quest) => quest.reward > gap);
    // A tie still needs the smallest quest reward to pass, not 0.
    const target = `${formatPollen(Math.max(gap, 0.25))} Pollen to pass @${above.githubLogin}`;
    return pass
        ? `${target} — “${pass.title}” is +${formatPollen(pass.reward)}.`
        : `${target}.`;
}

const MEDALS = ["🥇", "🥈", "🥉"];

/** Places moved since the start of today (UTC): ↑3, ↓1, or "new". */
function Movement({
    movement,
    isYou,
}: {
    movement: number | null;
    isYou: boolean;
}) {
    if (movement === 0) return null;
    const [label, text, className] =
        movement === null
            ? ["New on the board today", "new", "text-theme-text-muted"]
            : movement > 0
              ? [
                    `Up ${movement} since yesterday`,
                    `↑${movement}`,
                    "text-outcome-positive-text",
                ]
              : [
                    `Down ${-movement} since yesterday`,
                    `↓${-movement}`,
                    "text-outcome-negative-text",
                ];
    return (
        <span
            title={label}
            // The viewer row sits on the accent fill, where tone colours fade.
            className={`shrink-0 text-xs font-semibold tabular-nums ${
                isYou ? "text-theme-text-strong" : className
            }`}
        >
            <span aria-hidden="true">{text}</span>
            <span className="sr-only">{label}</span>
        </span>
    );
}

function StandingRowView({
    row,
    isYou,
    gap,
}: {
    row: StandingRow;
    isYou: boolean;
    gap?: { aboveLogin: string; to: number; of: number } | null;
}) {
    const medal = MEDALS[row.rank - 1];
    return (
        <li
            className={`rounded-xl px-3 py-2 ${
                isYou ? "bg-theme-bg-active" : ""
            }`}
        >
            <div className="flex items-center gap-3">
                <span className="w-6 shrink-0 text-right text-sm font-semibold tabular-nums text-theme-text-muted">
                    {medal ? (
                        <span
                            role="img"
                            aria-label={`Rank ${row.rank}`}
                            className="text-base leading-none"
                        >
                            {medal}
                        </span>
                    ) : (
                        row.rank
                    )}
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
                <span className="ml-auto flex shrink-0 items-center gap-2">
                    <Movement movement={row.movement} isYou={isYou} />
                    <Text
                        as="span"
                        weight="semibold"
                        tone="strong"
                        className="tabular-nums"
                    >
                        {formatPollen(row.totalPollen)}
                    </Text>
                </span>
            </div>
            {gap && (
                <div
                    role="img"
                    aria-label={`${formatPollen(gap.to - gap.of)} Pollen behind @${gap.aboveLogin}`}
                    title={`${formatPollen(gap.to - gap.of)} Pollen behind @${gap.aboveLogin}`}
                    className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-theme-bg-inset"
                >
                    <div
                        className="h-full rounded-full bg-theme-text-muted/60"
                        style={{
                            width: `${Math.min(100, Math.round((gap.of / gap.to) * 100))}%`,
                        }}
                    />
                </div>
            )}
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
    // The viewer's distance to the row directly above, shown as a slim bar.
    const youGap =
        youRank === null
            ? null
            : (() => {
                  const you = standings.rows.find(
                      (row) => row.rank === youRank,
                  );
                  const above = standings.rows.find(
                      (row) => row.rank === youRank - 1,
                  );
                  return you && above && you.totalPollen < above.totalPollen
                      ? {
                            aboveLogin: above.githubLogin,
                            to: above.totalPollen,
                            of: you.totalPollen,
                        }
                      : null;
              })();

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
                                        gap={
                                            row.rank === youRank ? youGap : null
                                        }
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
