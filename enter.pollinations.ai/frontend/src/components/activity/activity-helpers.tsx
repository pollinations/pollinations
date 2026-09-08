import {
    Button,
    CardIcon,
    DownloadIcon,
    MultiSelect,
    SproutIcon,
    Tooltip,
} from "@pollinations/ui";
import { PaidChip, TierChip } from "@pollinations/ui/wallet";
import type { FC } from "react";
import { formatActivityPollen } from "./format-activity-pollen";

type ActivityFilterProps = {
    label: string;
    options: Array<{ value: string; label: string }>;
    selected: string[];
    onChange: (selected: string[]) => void;
    emptyMessage: string;
};

export const ActivityFilter: FC<ActivityFilterProps> = ({
    label,
    options,
    selected,
    onChange,
    emptyMessage,
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
                            .map((id) => ({ value: id, label: id })),
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
    paidPollen: number;
    tierPollen: number;
    paidRequests: number;
    tierRequests: number;
}) {
    return (
        <div className="grid min-w-80 grid-cols-2 gap-2">
            <PaidChip
                size="sm"
                className="grid grid-cols-2 gap-0 whitespace-nowrap tabular-nums"
                title="Paid Pollen and requests"
                aria-label={`${formatActivityPollen(usage.paidPollen)} Paid Pollen, ${usage.paidRequests.toLocaleString()} requests`}
            >
                <span className="inline-flex items-center gap-1 pr-2">
                    <CardIcon
                        className="h-3.5 w-3.5 shrink-0"
                        aria-hidden="true"
                    />
                    {formatActivityPollen(usage.paidPollen)}
                </span>
                <span className="inline-flex items-center justify-end gap-1 border-l border-current/20 pl-2">
                    <span aria-hidden="true" className="opacity-60">
                        #
                    </span>
                    {usage.paidRequests.toLocaleString()}
                </span>
            </PaidChip>
            <TierChip
                size="sm"
                className="grid grid-cols-2 gap-0 whitespace-nowrap tabular-nums"
                title="Quest Pollen and requests"
                aria-label={`${formatActivityPollen(usage.tierPollen)} Quest Pollen, ${usage.tierRequests.toLocaleString()} requests`}
            >
                <span className="inline-flex items-center gap-1 pr-2">
                    <SproutIcon
                        className="h-3.5 w-3.5 shrink-0"
                        aria-hidden="true"
                    />
                    {formatActivityPollen(usage.tierPollen)}
                </span>
                <span className="inline-flex items-center justify-end gap-1 border-l border-current/20 pl-2">
                    <span aria-hidden="true" className="opacity-60">
                        #
                    </span>
                    {usage.tierRequests.toLocaleString()}
                </span>
            </TierChip>
        </div>
    );
}
