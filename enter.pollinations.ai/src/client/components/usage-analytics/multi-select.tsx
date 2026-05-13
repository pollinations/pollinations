import type { FC } from "react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/util.ts";
import { useAutoHideScrollbar } from "../../hooks/use-auto-hide-scrollbar.ts";
import type { ThemeName } from "../layout/dashboard-theme.ts";

type MultiSelectProps = {
    options: { value: string; label: string }[];
    selected: string[];
    onChange: (selected: string[]) => void;
    placeholder: string;
    disabled?: boolean;
    disabledText?: string;
    align?: "start" | "end";
    label?: string;
    theme: ThemeName;
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
        <div
            ref={ref}
            data-theme={theme}
            className="relative group flex items-center gap-2"
        >
            {label && (
                <span className="text-xs font-medium text-theme-text-muted">
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
                        ? "cursor-not-allowed opacity-60 border-theme-border-subtle bg-theme-bg-subtle"
                        : open
                          ? "border-theme-border bg-theme-bg-active"
                          : "border-theme-border bg-theme-bg-idle hover:bg-theme-bg-hover-soft",
                )}
            >
                <span
                    className={cn(
                        "truncate flex-1 text-left",
                        disabled
                            ? "text-theme-text-softer"
                            : open
                              ? "text-theme-text-strong"
                              : "text-theme-text-base",
                    )}
                >
                    {displayText}
                </span>
                <svg
                    className={cn(
                        "w-3 h-3 transition-transform",
                        open
                            ? "rotate-180 text-theme-text-strong"
                            : "text-theme-text-soft",
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
                <span className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-theme-bg-pale text-theme-text-strong border border-theme-border text-xs rounded-md shadow-sm whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-[100]">
                    No items available
                </span>
            )}
            {open && !disabled && (
                <div
                    className={cn(
                        "min-w-[320px] overflow-hidden rounded-lg border bg-white shadow-lg z-50 border-theme-border",
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
                            `scrollbar-theme-${theme}`,
                        )}
                    >
                        <button
                            type="button"
                            onClick={selectAll}
                            className={cn(
                                "w-full px-3 py-2 text-left text-xs transition-colors flex items-center gap-3",
                                isAllSelected
                                    ? "bg-theme-bg-active text-theme-text-strong font-medium"
                                    : "text-theme-text-base hover:bg-theme-bg-hover-faint",
                            )}
                        >
                            <span
                                className={cn(
                                    "w-4 h-4 rounded border flex items-center justify-center text-xs flex-shrink-0 border-theme-border",
                                    isAllSelected &&
                                        "bg-theme-bg-active text-theme-text-strong",
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
                                            ? "bg-theme-bg-active text-theme-text-strong"
                                            : "text-theme-text-base hover:bg-theme-bg-hover-faint",
                                    )}
                                >
                                    <span
                                        className={cn(
                                            "w-4 h-4 rounded border flex items-center justify-center text-xs flex-shrink-0 border-theme-border",
                                            isChecked &&
                                                "bg-theme-bg-active text-theme-text-strong",
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
