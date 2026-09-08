import {
    Button,
    CardIcon,
    DownloadIcon,
    MultiSelect,
    SproutIcon,
    Tooltip,
} from "@pollinations/ui";
import { PaidChip, TierChip } from "@pollinations/ui/wallet";
import type { FC, KeyboardEvent } from "react";
import { formatActivityPollen } from "./format-activity-pollen";
import type { Metric } from "./types";

type ActivityFilterProps = {
    label: string;
    options: Array<{ value: string; label: string }>;
    selected: string[];
    onChange: (selected: string[]) => void;
    emptyMessage: string;
    missingLabel?: string;
};

export const ActivityFilter: FC<ActivityFilterProps> = ({
    label,
    options,
    selected,
    onChange,
    emptyMessage,
    missingLabel,
}) => (
    <div className="flex min-w-0 flex-col gap-1.5">
        <span className="px-1 text-xs font-medium text-theme-text-muted">
            {label}
        </span>
        <div
            data-theme={selected.length ? undefined : "neutral"}
            className="min-w-0 [&_button]:w-full [&_button]:min-w-0!"
        >
            {options.length === 0 && selected.length === 0 ? (
                <span className="inline-flex min-h-8 items-center text-xs text-theme-text-muted">
                    {emptyMessage}
                </span>
            ) : (
                <MultiSelect
                    options={[
                        ...options,
                        ...selected
                            .filter(
                                (id) =>
                                    !options.some(
                                        (option) => option.value === id,
                                    ),
                            )
                            .map((id) => ({
                                value: id,
                                label: missingLabel ?? id,
                            })),
                    ]}
                    selected={selected}
                    onChange={onChange}
                    placeholder="All"
                    align="start"
                />
            )}
        </div>
    </div>
);

export function clearActivitySelectionOnEscape(
    event: KeyboardEvent<HTMLElement>,
    clear: () => void,
): void {
    // Let an open calendar/filter handle Escape without clearing the chart behind it.
    if (
        event.key !== "Escape" ||
        event.defaultPrevented ||
        !(event.target instanceof Element) ||
        event.target.closest('[data-scope="popover"][data-part="content"]')
    )
        return;
    event.preventDefault();
    clear();
    if (event.target instanceof SVGElement) event.target.blur();
}

type CsvDownloadButtonProps = {
    label?: string;
    disabled: boolean;
    disabledReason: string;
    onClick: () => void;
};

export const CsvDownloadButton: FC<CsvDownloadButtonProps> = ({
    label = "CSV",
    disabled,
    disabledReason,
    onClick,
}) => {
    const button = (
        <Button
            as="button"
            onClick={onClick}
            disabled={disabled}
            size="lg"
            className="gap-2 whitespace-nowrap"
        >
            <DownloadIcon className="h-4 w-4 shrink-0" />
            {label}
        </Button>
    );

    return disabled ? (
        <Tooltip
            triggerAs="span"
            content={disabledReason}
            align="center"
            className="inline-flex"
        >
            {button}
        </Tooltip>
    ) : (
        button
    );
};

export function downloadFile(url: string): void {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
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
        : usage.paidRequests.toLocaleString();
    const quest = isPollen
        ? formatActivityPollen(usage.tierPollen)
        : usage.tierRequests.toLocaleString();
    const unit = isPollen ? "Pollen" : "requests";
    return (
        <div className="grid min-w-44 grid-cols-2 gap-2">
            <PaidChip
                size="sm"
                className="flex items-center justify-between gap-2 whitespace-nowrap tabular-nums"
                title={`Paid ${unit}`}
                aria-label={`${paid} Paid ${unit}`}
            >
                <CardIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {paid}
            </PaidChip>
            <TierChip
                size="sm"
                className="flex items-center justify-between gap-2 whitespace-nowrap tabular-nums"
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
