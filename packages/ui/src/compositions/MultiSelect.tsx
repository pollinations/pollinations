import type { FC } from "react";
import { cn } from "../lib/cn.ts";
import { ChevronIcon } from "../primitives/ChevronIcon.tsx";
import { Dropdown } from "../primitives/Dropdown.tsx";
import { ScrollArea } from "../primitives/ScrollArea.tsx";
import { Tooltip } from "../primitives/Tooltip.tsx";

export type MultiSelectOption = {
    value: string;
    label: string;
};

export type MultiSelectProps = {
    options: MultiSelectOption[];
    selected: string[];
    onChange: (selected: string[]) => void;
    placeholder: string;
    disabled?: boolean;
    disabledText?: string;
    disabledTooltip?: string;
    align?: "start" | "end";
    label?: string;
    /** Accessible name when the visible label is supplied by the caller. */
    ariaLabel?: string;
    /** Fill the available width, allowing the trigger label to truncate. */
    fullWidth?: boolean;
};

const TRIGGER_BASE =
    "polli-control polli:inline-flex polli:min-h-8 polli:min-w-[140px] polli:items-center polli:gap-2 polli:rounded-full polli:px-3 polli:py-1.5 polli:text-xs polli:font-medium polli:transition-all polli:duration-200";

const ROW_BASE =
    "polli-control polli:flex polli:w-full polli:items-center polli:gap-3 polli:px-3 polli:py-2 polli:text-left polli:text-xs polli:transition-colors";

// Selection shows by fill, never a border: an empty box is a quiet tint, a
// ticked box on its honey row a darker tint with the tick.
const CHECK_BASE =
    "polli:flex polli:h-4 polli:w-4 polli:flex-shrink-0 polli:items-center polli:justify-center polli:rounded polli:bg-theme-text-strong/10 polli:text-xs";

export const MultiSelect: FC<MultiSelectProps> = ({
    options,
    selected,
    onChange,
    placeholder,
    disabled,
    disabledText,
    disabledTooltip,
    align = "start",
    label,
    ariaLabel,
    fullWidth = false,
}) => {
    const isAllSelected = selected.length === 0;

    const toggleItem = (itemId: string) => {
        if (selected.includes(itemId)) {
            onChange(selected.filter((m) => m !== itemId));
        } else {
            onChange([...selected, itemId]);
        }
    };

    const selectAll = () => onChange([]);

    const displayText = disabled
        ? disabledText
        : isAllSelected
          ? placeholder
          : selected.length === 1
            ? (options.find((option) => option.value === selected[0])?.label ??
              "1 selected")
            : `${selected.length} selected`;

    const labelNode = label ? (
        <span className="polli:text-xs polli:font-medium polli:text-theme-text-soft">
            {label}
        </span>
    ) : null;

    if (disabled) {
        return (
            <div
                className={cn(
                    "polli:flex polli:items-center polli:gap-2",
                    fullWidth && "polli:w-full polli:min-w-0",
                )}
            >
                {labelNode}
                <Tooltip
                    triggerAs="span"
                    content={disabledTooltip || "No items available"}
                    align="center"
                    className={cn(
                        "polli:inline-flex polli:cursor-not-allowed",
                        fullWidth && "polli:min-w-0 polli:flex-1",
                    )}
                >
                    <button
                        type="button"
                        disabled
                        aria-label={ariaLabel || label || placeholder}
                        className={cn(
                            TRIGGER_BASE,
                            fullWidth && "polli:w-full polli:min-w-0",
                            "polli:cursor-not-allowed polli:bg-theme-fill polli:text-theme-on-fill polli:opacity-50",
                        )}
                    >
                        <span className="polli:flex-1 polli:truncate polli:text-left">
                            {displayText}
                        </span>
                        <ChevronIcon
                            expanded={false}
                            className="polli:h-3 polli:w-3"
                        />
                    </button>
                </Tooltip>
            </div>
        );
    }

    return (
        <div
            className={cn(
                "polli:flex polli:items-center polli:gap-2",
                fullWidth && "polli:w-full polli:min-w-0",
            )}
        >
            {labelNode}
            <Dropdown
                align={align}
                className="polli:w-[min(20rem,calc(100vw-2rem))]"
                trigger={(open) => (
                    <button
                        type="button"
                        aria-label={ariaLabel || label || placeholder}
                        className={cn(
                            TRIGGER_BASE,
                            fullWidth && "polli:w-full polli:min-w-0",
                            open
                                ? "polli:bg-theme-fill-hover polli:text-theme-on-fill"
                                : "polli:bg-theme-fill polli:text-theme-on-fill polli:hover:bg-theme-fill-hover",
                        )}
                    >
                        <span className="polli:flex-1 polli:truncate polli:text-left">
                            {displayText}
                        </span>
                        <ChevronIcon
                            expanded={open}
                            className="polli:h-3 polli:w-3 polli:transition-transform"
                        />
                    </button>
                )}
            >
                <ScrollArea className="polli:max-h-64">
                    <button
                        type="button"
                        onClick={selectAll}
                        aria-pressed={isAllSelected}
                        className={cn(
                            ROW_BASE,
                            isAllSelected
                                ? "polli:bg-theme-fill polli:font-medium polli:text-theme-on-fill"
                                : "polli:text-theme-text-base polli:hover:bg-theme-fill-wash",
                        )}
                    >
                        <span
                            aria-hidden="true"
                            className={cn(
                                CHECK_BASE,
                                isAllSelected &&
                                    "polli:bg-theme-on-fill/15 polli:text-theme-on-fill",
                            )}
                        >
                            {isAllSelected && "✓"}
                        </span>
                        {placeholder}
                    </button>
                    {options.map((opt) => {
                        const isChecked = selected.includes(opt.value);
                        return (
                            <button
                                type="button"
                                key={opt.value}
                                onClick={() => toggleItem(opt.value)}
                                aria-pressed={isChecked}
                                className={cn(
                                    ROW_BASE,
                                    isChecked
                                        ? "polli:bg-theme-fill polli:text-theme-on-fill"
                                        : "polli:text-theme-text-base polli:hover:bg-theme-fill-wash",
                                )}
                            >
                                <span
                                    aria-hidden="true"
                                    className={cn(
                                        CHECK_BASE,
                                        isChecked &&
                                            "polli:bg-theme-on-fill/15 polli:text-theme-on-fill",
                                    )}
                                >
                                    {isChecked && "✓"}
                                </span>
                                <span className="polli:min-w-0 polli:[overflow-wrap:anywhere]">
                                    {opt.label}
                                </span>
                            </button>
                        );
                    })}
                </ScrollArea>
            </Dropdown>
        </div>
    );
};
