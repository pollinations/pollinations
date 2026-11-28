import { cn } from "@pollinations/ui";
import { POLLEN_BILLING_PRECISION } from "@shared/billing/precision.ts";
import { type FormatDistanceToken, formatDistanceToNowStrict } from "date-fns";
import type { FC } from "react";
import { formatUsd } from "../pollen/format-usd.ts";

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
                <span className="text-theme-text-muted">Expires: </span>
                <span className="text-theme-text-muted">{expiryStr}</span>
            </span>
            <span>
                <span className="text-theme-text-muted">Budget left: </span>
                <span
                    className={cn(
                        "text-theme-text-muted",
                        isExhausted && "text-intent-danger-text font-medium",
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

    const expiry = new Date(expiresAt);
    if (expiry.getTime() <= Date.now()) return "expired";

    return formatDistanceToNowStrict(expiry, { locale: shortLocale });
}

function formatBudget(pollenBudget: number | null | undefined): string {
    if (pollenBudget == null) return "Unlimited";
    if (pollenBudget > 0 && pollenBudget < 0.0001) {
        if (pollenBudget < 10 ** -POLLEN_BILLING_PRECISION)
            return "<$0.00000001";
        return pollenBudget.toLocaleString("en-US", {
            style: "currency",
            currency: "USD",
            maximumFractionDigits: POLLEN_BILLING_PRECISION,
            roundingMode: "trunc",
        });
    }
    return formatUsd(Math.max(0, pollenBudget));
}
