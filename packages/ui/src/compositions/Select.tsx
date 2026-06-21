import type { ReactNode } from "react";
import { cn } from "../lib/cn.ts";
import { ChevronIcon } from "../primitives/ChevronIcon.tsx";
import { Dropdown } from "../primitives/Dropdown.tsx";
import { DropdownItem } from "../primitives/DropdownItem.tsx";
import { ScrollArea } from "../primitives/ScrollArea.tsx";
import { Tooltip } from "../primitives/Tooltip.tsx";

export type SelectOption<TValue extends string = string> = {
    value: TValue;
    label: ReactNode;
};

export type SelectProps<TValue extends string = string> = {
    options: readonly SelectOption<TValue>[];
    value: TValue;
    onChange: (value: TValue) => void;
    placeholder?: string;
    disabled?: boolean;
    disabledText?: string;
    align?: "start" | "end";
    label?: string;
};

const TRIGGER_BASE =
    "polli-control polli:inline-flex polli:min-h-8 polli:min-w-[140px] polli:items-center polli:gap-2 polli:rounded-full polli:px-3 polli:py-1.5 polli:text-xs polli:font-medium polli:transition-all polli:duration-200";

const CHECK_BASE =
    "polli:flex polli:h-4 polli:w-4 polli:flex-shrink-0 polli:items-center polli:justify-center polli:rounded polli:border polli:border-theme-border polli:text-xs";

export function Select<TValue extends string = string>({
    options,
    value,
    onChange,
    placeholder = "Select",
    disabled,
    disabledText,
    align = "start",
    label,
}: SelectProps<TValue>) {
    const selectedOption = options.find((option) => option.value === value);
    const displayText = disabled
        ? (disabledText ?? placeholder)
        : (selectedOption?.label ?? placeholder);

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
                            "polli:cursor-not-allowed polli:bg-theme-bg-active polli:opacity-50",
                        )}
                    >
                        <span className="polli:flex-1 polli:truncate polli:text-left polli:text-theme-text-strong">
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
                className="polli:min-w-[160px]"
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
                {(close) => (
                    <ScrollArea className="polli:max-h-64">
                        {options.map((option) => {
                            const selected = option.value === value;
                            return (
                                <DropdownItem
                                    key={option.value}
                                    onClick={() => {
                                        onChange(option.value);
                                        close();
                                    }}
                                    className={cn(
                                        "polli:gap-3 polli:rounded-none polli:text-xs",
                                        selected &&
                                            "polli:bg-theme-bg-active polli:text-theme-text-strong polli:hover:bg-theme-bg-active polli:focus-visible:bg-theme-bg-active",
                                    )}
                                >
                                    <span
                                        className={cn(
                                            CHECK_BASE,
                                            selected &&
                                                "polli:bg-theme-bg-active polli:text-theme-text-strong",
                                        )}
                                    >
                                        {selected && "✓"}
                                    </span>
                                    <span className="polli:whitespace-nowrap">
                                        {option.label}
                                    </span>
                                </DropdownItem>
                            );
                        })}
                    </ScrollArea>
                )}
            </Dropdown>
        </div>
    );
}
