/**
 * Pure formatting utility for activity chart date labels.
 * Kept dependency-free so it can be unit-tested without the UI package.
 */
export function formatActivityChartDate(
    date: Date,
    isHourly: boolean,
): { label: string; fullDate: string } {
    return {
        label: isHourly
            ? date.toLocaleTimeString("en-US", {
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false,
              })
            : date.toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
              }),
        fullDate: date.toLocaleDateString("en-US", {
            weekday: "short",
            year: "numeric",
            month: "short",
            day: "numeric",
            ...(isHourly && {
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
            }),
        }),
    };
}
