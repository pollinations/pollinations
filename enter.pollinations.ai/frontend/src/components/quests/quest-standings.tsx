import {
    CardIcon,
    InlineLink,
    SproutIcon,
    Surface,
    Text,
} from "@pollinations/ui";
import { formatPollen } from "@pollinations/ui/wallet";
import { Fragment, type ReactNode } from "react";
import type { QuestStandingsResponse } from "../../backend-types.ts";

type StandingRow = QuestStandingsResponse["rows"][number];

/** An open quest the viewer could complete next, and where to do it. */
export type NextQuest = { title: string; reward: number; href?: string };

/** The quest's name, linked to where it is done when the quest says where. */
function questName({ title, href }: NextQuest): ReactNode {
    return href ? (
        <InlineLink href={href} tone="quiet">
            {title}
        </InlineLink>
    ) : (
        `“${title}”`
    );
}

/** A Quest reward: the sprout and a dollar amount, in Quest green. */
function Amount({ value }: { value: number }) {
    return (
        <span className="polli-wallet-text-tier inline-flex items-baseline gap-0.5 font-semibold tabular-nums">
            <SproutIcon
                aria-hidden="true"
                className="h-3.5 w-3.5 self-center"
            />
            ${formatPollen(value)}
            <span className="sr-only"> in Quest rewards</span>
        </span>
    );
}

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
): ReactNode {
    const { you, rows } = standings;
    if (!you) return "Sign in to join this month's race.";
    const byReward = [...openQuests].sort((a, b) => a.reward - b.reward);
    const rank = you.rank;
    if (rank === null) {
        const first = byReward[0];
        return first ? (
            <>
                Complete a quest to join the race. {questName(first)} earns{" "}
                <Amount value={first.reward} />.
            </>
        ) : (
            "Complete a quest to join the race."
        );
    }
    if (rank === 1) return `You're leading ${monthName(standings.month)}.`;
    const above = rows.find((row) => row.rank === rank - 1);
    if (!above) return null;
    const gap = above.totalPollen - you.totalPollen;
    const pass = byReward.find((quest) => quest.reward > gap);
    // A tie still needs the smallest quest reward to pass, not 0.
    const target = (
        <>
            <Amount value={Math.max(gap, 0.25)} /> to pass @{above.githubLogin}
        </>
    );
    return pass ? (
        <>
            {target}. {questName(pass)} earns <Amount value={pass.reward} />.
        </>
    ) : (
        <>{target}.</>
    );
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

function StandingRowView({ row, isYou }: { row: StandingRow; isYou: boolean }) {
    const medal = MEDALS[row.rank - 1];
    return (
        <li
            className={`flex items-center gap-3 rounded-xl px-3 py-2 ${
                isYou ? "bg-theme-bg-active" : ""
            }`}
        >
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
                    title="Supporter"
                    className="polli-wallet-chip-paid inline-flex size-5 shrink-0 items-center justify-center rounded-full"
                >
                    <CardIcon className="h-3 w-3" aria-hidden="true" />
                    <span className="sr-only">Supporter</span>
                </span>
            )}
            <span className="ml-auto flex shrink-0 items-center gap-2">
                <Movement movement={row.movement} isYou={isYou} />
                <Amount value={row.totalPollen} />
            </span>
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
    // How much of the month has passed, for the bar beside its name.
    const monthStart = Date.parse(`${standings.month}-01T00:00:00Z`);
    const elapsed = Math.min(
        100,
        Math.max(
            0,
            ((now - monthStart) / (Date.parse(standings.endsAt) - monthStart)) *
                100,
        ),
    );

    return (
        <Surface variant="card" className="flex flex-col gap-2">
            {/* The month's race: its name, the share of it gone, the days
                    left. */}
            <div className="flex items-center gap-3 px-3 pb-2">
                <Text as="span" weight="semibold" tone="strong">
                    {monthName(standings.month)}
                </Text>
                <span
                    aria-hidden="true"
                    className="h-1.5 flex-1 overflow-hidden rounded-full bg-theme-bg-active"
                >
                    <span
                        className="block h-full rounded-full bg-tier-soft"
                        style={{ width: `${elapsed}%` }}
                    />
                </span>
                <span className="text-sm tabular-nums text-theme-text-muted">
                    {days} {days === 1 ? "day" : "days"} left
                </span>
            </div>
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
            {/* The next step in the race, quietly under the rows. */}
            {line && (
                <p className="mt-1 border-t border-theme-text-strong/10 px-3 pt-3 text-sm leading-snug text-theme-text-muted">
                    {line}
                </p>
            )}
        </Surface>
    );
}
