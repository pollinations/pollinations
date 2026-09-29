import { currentWeekStart } from "./format";

const DAY_MS = 86_400_000;

/** Net changes between observed Monday totals, not reconstructed star events. */
export function buildStarWeeks(snapshots, currentMonday = currentWeekStart()) {
    const byDate = new Map(snapshots.map((row) => [row.date, row]));
    const latest = snapshots.at(-1);
    return snapshots
        .filter((row) => new Date(`${row.date}T00:00:00Z`).getUTCDay() === 1)
        .map((start) => {
            const nextMonday = new Date(
                Date.parse(`${start.date}T00:00:00Z`) + 7 * DAY_MS,
            )
                .toISOString()
                .slice(0, 10);
            const end =
                start.date === currentMonday ? latest : byDate.get(nextMonday);
            return {
                week: start.date,
                githubStars: end?.stars,
                githubStarGrowth: end ? end.stars - start.stars : null,
            };
        });
}
