import type { FC } from "react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/util.ts";
import { useAutoHideScrollbar } from "../../hooks/use-auto-hide-scrollbar.ts";

type MultiSelectTheme = "pink" | "yellow";

const THEME_TOKENS: Record<
    MultiSelectTheme,
    {
        labelText: string;
        triggerIdle: string;
        triggerOpen: string;
        triggerDisabled: string;
        triggerTextIdle: string;
        triggerTextOpen: string;
        triggerTextDisabled: string;
        chevronIdle: string;
        chevronOpen: string;
        popupBorder: string;
        scrollbar: string;
        rowSelected: string;
        rowIdle: string;
        rowHover: string;
        checkSelected: string;
        checkIdle: string;
    }
> = {
    pink: {
        labelText: "text-pink-800/75",
        triggerIdle: "border-pink-300 bg-pink-50/80 hover:bg-pink-100",
        triggerOpen: "border-pink-300 bg-pink-200",
        triggerDisabled: "border-pink-200 bg-pink-50/50",
        triggerTextIdle: "text-pink-900",
        triggerTextOpen: "text-pink-950",
        triggerTextDisabled: "text-pink-700/60",
        chevronIdle: "text-pink-700",
        chevronOpen: "text-pink-950",
        popupBorder: "border-pink-300",
        scrollbar: "scrollbar-theme-pink",
        rowSelected: "bg-pink-200 text-pink-950",
        rowIdle: "text-pink-900",
        rowHover: "hover:bg-pink-50",
        checkSelected: "bg-pink-200 border-pink-300 text-pink-950",
        checkIdle: "border-pink-300",
    },
    yellow: {
        labelText: "text-yellow-800/75",
        triggerIdle: "border-yellow-200 bg-yellow-50/80 hover:bg-yellow-100",
        triggerOpen: "border-yellow-200 bg-yellow-200",
        triggerDisabled: "border-yellow-100 bg-yellow-50/50",
        triggerTextIdle: "text-yellow-900",
        triggerTextOpen: "text-yellow-950",
        triggerTextDisabled: "text-yellow-700/60",
        chevronIdle: "text-yellow-700",
        chevronOpen: "text-yellow-950",
        popupBorder: "border-yellow-200",
        scrollbar: "scrollbar-theme-yellow",
        rowSelected: "bg-yellow-200 text-yellow-950",
        rowIdle: "text-yellow-900",
        rowHover: "hover:bg-yellow-50",
        checkSelected: "bg-yellow-200 border-yellow-200 text-yellow-950",
        checkIdle: "border-yellow-200",
    },
};

type MultiSelectProps = {
    options: { value: string; label: string }[];
    selected: string[];
    onChange: (selected: string[]) => void;
    placeholder: string;
    disabled?: boolean;
    disabledText?: string;
    align?: "start" | "end";
    label?: string;
    theme?: MultiSelectTheme;
};

export const MultiSelect: FC<MultiSelectProps> = ({
    options,
    selected,
    onChange,
    placeholder,
    disabled,
    disabledText,
    align = "start",
    label,
    theme = "pink",
}) => {
    const tokens = THEME_TOKENS[theme];
    const [open, setOpen] = useState(false);
    const [openDirection, setOpenDirection] = useState<"up" | "down">("up");
    const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
    const ref = useRef<HTMLDivElement>(null);
    const scrollAreaRef = useAutoHideScrollbar<HTMLDivElement>(open);
    const isAllSelected = selected.length === 0;

    const calculatePosition = () => {
        if (!ref.current) return { direction: "up" as const, style: {} };
        const rect = ref.current.getBoundingClientRect();
        const dropdownHeight = 280;
        const dropdownWidth = 320;
        const spaceAbove = rect.top;
        const spaceBelow = window.innerHeight - rect.bottom;
        const isMobile = window.innerWidth < 640; // sm breakpoint

        const direction: "up" | "down" =
            spaceAbove < dropdownHeight && spaceBelow > spaceAbove
                ? "down"
                : "up";

        // On mobile with align=end, center the dropdown on screen
        let style: React.CSSProperties = {};
        if (isMobile && align === "end") {
            const centeredLeft = (window.innerWidth - dropdownWidth) / 2;
            style = {
                position: "fixed",
                left: centeredLeft,
                top:
                    direction === "down"
                        ? rect.bottom + 4
                        : rect.top - dropdownHeight - 4,
            };
        }

        return { direction, style };
    };

    const handleToggle = () => {
        if (disabled) return;
        if (!open) {
            const { direction, style } = calculatePosition();
            setOpenDirection(direction);
            setDropdownStyle(style);
        }
        setOpen(!open);
    };

    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node))
                setOpen(false);
        };
        document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, []);

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

    return (
        <div ref={ref} className="relative group flex items-center gap-2">
            {label && (
                <span className={cn("text-xs font-medium", tokens.labelText)}>
                    {label}
                </span>
            )}
            <button
                type="button"
                onClick={handleToggle}
                disabled={disabled}
                className={cn(
                    "inline-flex min-h-8 min-w-[140px] items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-all duration-200",
                    disabled
                        ? cn(
                              "cursor-not-allowed opacity-60",
                              tokens.triggerDisabled,
                          )
                        : open
                          ? tokens.triggerOpen
                          : tokens.triggerIdle,
                )}
            >
                <span
                    className={cn(
                        "truncate flex-1 text-left",
                        disabled
                            ? tokens.triggerTextDisabled
                            : open
                              ? tokens.triggerTextOpen
                              : tokens.triggerTextIdle,
                    )}
                >
                    {displayText}
                </span>
                <svg
                    className={cn(
                        "w-3 h-3 transition-transform",
                        open
                            ? cn("rotate-180", tokens.chevronOpen)
                            : tokens.chevronIdle,
                    )}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    aria-hidden="true"
                >
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 9l-7 7-7-7"
                    />
                </svg>
            </button>
            {disabled && (
                <span className="absolute -top-8 left-1/2 -translate-x-1/2 px-3 py-2 bg-white text-gray-800 text-xs rounded-lg shadow-lg border border-gray-200 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-[100]">
                    No items available
                </span>
            )}
            {open && !disabled && (
                <div
                    className={cn(
                        "min-w-[320px] overflow-hidden rounded-lg border bg-white shadow-lg z-50",
                        tokens.popupBorder,
                        !dropdownStyle.position && "absolute",
                        !dropdownStyle.position &&
                            (openDirection === "up"
                                ? "bottom-full mb-1"
                                : "top-full mt-1"),
                        !dropdownStyle.position &&
                            (align === "end" ? "right-0" : "left-0"),
                    )}
                    style={dropdownStyle}
                >
                    <div
                        ref={scrollAreaRef}
                        className={cn(
                            "max-h-64 overflow-y-auto overflow-x-hidden scrollbar-subtle",
                            tokens.scrollbar,
                        )}
                    >
                        <button
                            type="button"
                            onClick={selectAll}
                            className={cn(
                                "w-full px-3 py-2 text-left text-xs transition-colors flex items-center gap-3",
                                isAllSelected
                                    ? cn(tokens.rowSelected, "font-medium")
                                    : cn(tokens.rowIdle, tokens.rowHover),
                            )}
                        >
                            <span
                                className={cn(
                                    "w-4 h-4 rounded border flex items-center justify-center text-xs flex-shrink-0",
                                    isAllSelected
                                        ? tokens.checkSelected
                                        : tokens.checkIdle,
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
                                        "w-full px-3 py-2 text-left text-xs transition-colors flex items-center gap-3",
                                        isChecked
                                            ? tokens.rowSelected
                                            : cn(
                                                  tokens.rowIdle,
                                                  tokens.rowHover,
                                              ),
                                    )}
                                >
                                    <span
                                        className={cn(
                                            "w-4 h-4 rounded border flex items-center justify-center text-xs flex-shrink-0",
                                            isChecked
                                                ? tokens.checkSelected
                                                : tokens.checkIdle,
                                        )}
                                    >
                                        {isChecked && "✓"}
                                    </span>
                                    <span className="whitespace-nowrap">
                                        {opt.label}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};
