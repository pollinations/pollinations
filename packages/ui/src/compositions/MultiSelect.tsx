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
    align?: "start" | "end";
    label?: string;
};

const TRIGGER_BASE =
    "polli-control polli:inline-flex polli:min-h-8 polli:min-w-[140px] polli:items-center polli:gap-2 polli:rounded-full polli:px-3 polli:py-1.5 polli:text-xs polli:font-medium polli:transition-all polli:duration-200";

const ROW_BASE =
    "polli-control polli:flex polli:w-full polli:items-center polli:gap-3 polli:px-3 polli:py-2 polli:text-left polli:text-xs polli:transition-colors";

const CHECK_BASE =
    "polli:flex polli:h-4 polli:w-4 polli:flex-shrink-0 polli:items-center polli:justify-center polli:rounded polli:border polli:border-theme-border polli:text-xs";

export const MultiSelect: FC<MultiSelectProps> = ({
    options,
    selected,
    onChange,
    placeholder,
    disabled,
    disabledText,
    align = "start",
    label,
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
          ? "All"
          : `${selected.length} selected`;

    const labelNode = label ? (
        <span className="polli:text-xs polli:font-medium polli:text-theme-text-soft">
            {label}
        </span>
    ) : null;

    if (disabled) {
        return (
            <div className="polli:flex polli:items-center polli:gap-2">
                {labelNode}
                <Tooltip
                    triggerAs="span"
                    content="No items available"
                    align="center"
                    className="polli:inline-flex"
                >
                    <button
                        type="button"
                        disabled
                        className={cn(
                            TRIGGER_BASE,
                            "polli:cursor-not-allowed polli:bg-theme-bg-subtle polli:opacity-60",
                        )}
                    >
                        <span className="polli:flex-1 polli:truncate polli:text-left polli:text-theme-text-soft/60">
                            {displayText}
                        </span>
                        <ChevronIcon
                            expanded={false}
                            className="polli:h-3 polli:w-3 polli:text-theme-text-soft"
                        />
                    </button>
                </Tooltip>
            </div>
        );
    }

    return (
        <div className="polli:flex polli:items-center polli:gap-2">
            {labelNode}
            <Dropdown
                align={align}
                className="polli:min-w-[320px]"
                trigger={(open) => (
                    <button
                        type="button"
                        className={cn(
                            TRIGGER_BASE,
                            open
                                ? "polli:bg-theme-bg-hover"
                                : "polli:bg-theme-bg-active polli:hover:bg-theme-bg-hover",
                        )}
                    >
                        <span
                            className={cn(
                                "polli:flex-1 polli:truncate polli:text-left",
                                open
                                    ? "polli:text-theme-text-strong"
                                    : "polli:text-theme-text-base",
                            )}
                        >
                            {displayText}
                        </span>
                        <ChevronIcon
                            expanded={open}
                            className={cn(
                                "polli:h-3 polli:w-3 polli:transition-transform",
                                open
                                    ? "polli:text-theme-text-strong"
                                    : "polli:text-theme-text-soft",
                            )}
                        />
                    </button>
                )}
            >
                <ScrollArea className="polli:max-h-64">
                    <button
                        type="button"
                        onClick={selectAll}
                        className={cn(
                            ROW_BASE,
                            isAllSelected
                                ? "polli:bg-theme-bg-active polli:font-medium polli:text-theme-text-strong"
                                : "polli:text-theme-text-base polli:hover:bg-theme-bg-subtle",
                        )}
                    >
                        <span
                            className={cn(
                                CHECK_BASE,
                                isAllSelected &&
                                    "polli:bg-theme-bg-active polli:text-theme-text-strong",
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
                                className={cn(
                                    ROW_BASE,
                                    isChecked
                                        ? "polli:bg-theme-bg-active polli:text-theme-text-strong"
                                        : "polli:text-theme-text-base polli:hover:bg-theme-bg-subtle",
                                )}
                            >
                                <span
                                    className={cn(
                                        CHECK_BASE,
                                        isChecked &&
                                            "polli:bg-theme-bg-active polli:text-theme-text-strong",
                                    )}
                                >
                                    {isChecked && "✓"}
                                </span>
                                <span className="polli:whitespace-nowrap">
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
