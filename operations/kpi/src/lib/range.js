export const DEFAULT_WEEKS = 12;
export const WEEK_RANGES = [12, 20];

export function weeksFromSearch(search) {
    const weeks = Number(new URLSearchParams(search).get("weeks"));
    return WEEK_RANGES.includes(weeks) ? weeks : DEFAULT_WEEKS;
}
