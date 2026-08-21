import { Button, DownloadIcon, MultiSelect, Tooltip } from "@pollinations/ui";
import type { FC } from "react";

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
    <div className="flex w-full items-center gap-3">
        <span className="w-20 shrink-0 text-xs font-medium text-theme-text-soft">
            {label}
        </span>
        <div className="min-w-0 flex-1 max-w-60 [&_button]:w-full">
            {options.length === 0 ? (
                <span className="inline-flex min-h-8 items-center text-xs text-theme-text-muted">
                    {emptyMessage}
                </span>
            ) : (
                <MultiSelect
                    options={options}
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
            className="flex items-center gap-1.5"
        >
            <DownloadIcon className="h-3.5 w-3.5 shrink-0" />
            CSV
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
    // No `timeZone` override on any of these — each bucket boundary is a
    // fixed instant in time, and formatting it without a timezone renders
    // it in the browser's local timezone.
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
