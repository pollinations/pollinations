import type { FC } from "react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/util.ts";
import { useAutoHideScrollbar } from "../../hooks/use-auto-hide-scrollbar.ts";
import { type DashboardTheme, themeTokens } from "../layout/dashboard-theme.ts";

type MultiSelectProps = {
    options: { value: string; label: string }[];
    selected: string[];
    onChange: (selected: string[]) => void;
    placeholder: string;
    disabled?: boolean;
    disabledText?: string;
    align?: "start" | "end";
    label?: string;
    theme: DashboardTheme;
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
    theme,
}) => {
    const tokens = themeTokens[theme];
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
                <span className={cn("text-xs font-medium", tokens.text.muted)}>
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
                              tokens.border.subtle,
                              tokens.bg.subtle,
                          )
                        : open
                          ? cn(tokens.border.idle, tokens.bg.active)
                          : cn(
                                tokens.border.idle,
                                tokens.bg.idle,
                                tokens.bg.hover,
                            ),
                )}
            >
                <span
                    className={cn(
                        "truncate flex-1 text-left",
                        disabled
                            ? tokens.text.softer
                            : open
                              ? tokens.text.strong
                              : tokens.text.base,
                    )}
                >
                    {displayText}
                </span>
                <svg
                    className={cn(
                        "w-3 h-3 transition-transform",
                        open
                            ? cn("rotate-180", tokens.text.strong)
                            : tokens.text.soft,
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
                        tokens.border.idle,
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
                                    ? cn(
                                          tokens.bg.active,
                                          tokens.text.strong,
                                          "font-medium",
                                      )
                                    : cn(tokens.text.base, tokens.bg.soft),
                            )}
                        >
                            <span
                                className={cn(
                                    "w-4 h-4 rounded border flex items-center justify-center text-xs flex-shrink-0",
                                    isAllSelected
                                        ? cn(
                                              tokens.bg.active,
                                              tokens.border.idle,
                                              tokens.text.strong,
                                          )
                                        : tokens.border.idle,
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
                                            ? cn(
                                                  tokens.bg.active,
                                                  tokens.text.strong,
                                              )
                                            : cn(
                                                  tokens.text.base,
                                                  tokens.bg.soft,
                                              ),
                                    )}
                                >
                                    <span
                                        className={cn(
                                            "w-4 h-4 rounded border flex items-center justify-center text-xs flex-shrink-0",
                                            isChecked
                                                ? cn(
                                                      tokens.bg.active,
                                                      tokens.border.idle,
                                                      tokens.text.strong,
                                                  )
                                                : tokens.border.idle,
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
