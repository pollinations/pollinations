import {
    Button,
    CardIcon,
    DownloadIcon,
    formatCount,
    SproutIcon,
    Tooltip,
} from "@pollinations/ui";
import { PaidChip, TierChip } from "@pollinations/ui/wallet";
import type { FC, KeyboardEvent, ReactNode } from "react";
import { saveBlob } from "./activity-csv";
import { formatActivityPollen } from "./format-activity-pollen";
import type { Metric } from "./types";

export function clearActivitySelectionOnEscape(
    event: KeyboardEvent<HTMLElement>,
    clear: () => void,
): void {
    // Portalled calendars/filters own Escape; React still bubbles their events here.
    if (
        event.key !== "Escape" ||
        event.defaultPrevented ||
        !(event.target instanceof Element) ||
        !event.currentTarget.contains(event.target)
    )
        return;
    event.preventDefault();
    clear();
    if (event.target instanceof SVGElement) event.target.blur();
}

type CsvDownloadButtonProps = {
    disabled: boolean;
    disabledReason: string;
    onClick: () => void;
};

export const CsvDownloadButton: FC<CsvDownloadButtonProps> = ({
    disabled,
    disabledReason,
    onClick,
}) => {
    const button = (
        <Button
            as="button"
            onClick={onClick}
            disabled={disabled}
            size="sm"
            className="gap-2 whitespace-nowrap"
        >
            <DownloadIcon className="h-4 w-4 shrink-0" />
            CSV
        </Button>
    );

    return disabled ? (
        <Tooltip
            triggerAs="span"
            content={disabledReason}
            align="center"
            className="inline-flex polli:cursor-not-allowed"
        >
            {button}
        </Tooltip>
    ) : (
        button
    );
};

/** Same height as the chart so the card never jumps. */
export const ActivityEmptyState: FC<{ children: ReactNode }> = ({
    children,
}) => (
    <div className="flex h-[180px] items-center justify-center text-center">
        <p className="max-w-md text-sm text-theme-text-muted">{children}</p>
    </div>
);

/**
 * Saves a fetched attachment under the server's file name. The account API
 * takes a bearer token, which a plain link navigation can't send.
 */
export async function downloadFile(response: Response): Promise<void> {
    if (!response.ok) throw new Error(`Download failed (${response.status})`);
    const filename =
        response.headers
            .get("Content-Disposition")
            ?.match(/filename="([^"]+)"/)?.[1] ?? "download.csv";
    saveBlob(await response.blob(), filename);
}

export function formatActivityChartDate(
    date: Date,
    isHourly: boolean,
): { label: string; fullDate: string } {
    return {
        label: isHourly
            ? date.toLocaleTimeString("en-US", {
                  timeZone: "UTC",
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false,
              })
            : date.toLocaleDateString("en-US", {
                  timeZone: "UTC",
                  month: "short",
                  day: "numeric",
              }),
        fullDate: date.toLocaleDateString("en-US", {
            timeZone: "UTC",
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

export function PollenUsageBadges(usage: {
    metric: Metric;
    paidPollen: number;
    tierPollen: number;
    paidRequests: number;
    tierRequests: number;
}) {
    const isPollen = usage.metric === "pollen";
    const paid = isPollen
        ? formatActivityPollen(usage.paidPollen)
        : formatCount(usage.paidRequests);
    const quest = isPollen
        ? formatActivityPollen(usage.tierPollen)
        : formatCount(usage.tierRequests);
    const unit = isPollen ? "Pollen" : "requests";
    return (
        <div className="ml-auto grid min-w-40 grid-cols-2 items-center justify-items-end gap-1">
            <PaidChip
                size="sm"
                className="cursor-help gap-2 whitespace-nowrap tabular-nums"
                title={`Paid ${unit}`}
                aria-label={`${paid} Paid ${unit}`}
            >
                <CardIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {paid}
            </PaidChip>
            <TierChip
                size="sm"
                className="cursor-help gap-2 whitespace-nowrap tabular-nums"
                title={`Quest ${unit}`}
                aria-label={`${quest} Quest ${unit}`}
            >
                <SproutIcon
                    className="h-3.5 w-3.5 shrink-0"
                    aria-hidden="true"
                />
                {quest}
            </TierChip>
        </div>
    );
}
