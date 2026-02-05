import { type FormatDistanceToken, formatDistanceToNowStrict } from "date-fns";
import type { FC } from "react";
import { cn } from "@/util.ts";

const shortFormatDistance: Record<FormatDistanceToken, string> = {
    lessThanXSeconds: "{{count}}s",
    xSeconds: "{{count}}s",
    halfAMinute: "30s",
    lessThanXMinutes: "{{count}}m",
    xMinutes: "{{count}}m",
    aboutXHours: "{{count}}h",
    xHours: "{{count}}h",
    xDays: "{{count}}d",
    aboutXWeeks: "{{count}}w",
    xWeeks: "{{count}}w",
    aboutXMonths: "{{count}}mo",
    xMonths: "{{count}}mo",
    aboutXYears: "{{count}}y",
    xYears: "{{count}}y",
    overXYears: "{{count}}y",
    almostXYears: "{{count}}y",
};

export const shortLocale = {
    formatDistance: (token: FormatDistanceToken, count: number) =>
        shortFormatDistance[token].replace("{{count}}", String(count)),
};

export const LimitsBadge: FC<{
    expiresAt: Date | null | undefined;
    pollenBudget: number | null | undefined;
}> = ({ expiresAt, pollenBudget }) => {
    const expiryStr = formatExpiry(expiresAt);
    const budgetStr = formatBudget(pollenBudget);
    const isExhausted = pollenBudget != null && pollenBudget <= 0;

    return (
        <>
            <span>
                <span className="text-gray-400">Expires: </span>
                <span className="text-gray-500">{expiryStr}</span>
            </span>
            <span>
                <span className="text-gray-400">Budget: </span>
                <span
                    className={cn(
                        "text-gray-500",
                        isExhausted && "text-red-500 font-medium",
                    )}
                >
                    {budgetStr}
                </span>
            </span>
        </>
    );
};

function formatExpiry(expiresAt: Date | null | undefined): string {
    if (!expiresAt) return "∞";

    const expiresDate = new Date(expiresAt);
    const daysLeft = Math.ceil(
        (expiresDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
    );

    if (daysLeft <= 0) return "expired";

    return formatDistanceToNowStrict(expiresDate, {
        addSuffix: false,
        locale: shortLocale,
    });
}

function formatBudget(pollenBudget: number | null | undefined): string {
    if (pollenBudget == null) return "∞";
    if (pollenBudget <= 0) return "empty";

    return Number.isInteger(pollenBudget)
        ? `${pollenBudget}p`
        : `${pollenBudget.toFixed(2)}p`;
}
