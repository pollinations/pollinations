import type { FC } from "react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/util.ts";

type MultiSelectProps = {
    options: { value: string; label: string }[];
    selected: string[];
    onChange: (selected: string[]) => void;
    placeholder: string;
    disabled?: boolean;
    disabledText?: string;
    align?: "start" | "end";
    label?: string;
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
}) => {
    const [open, setOpen] = useState(false);
    const [openDirection, setOpenDirection] = useState<"up" | "down">("up");
    const ref = useRef<HTMLDivElement>(null);
    const isAllSelected = selected.length === 0;

    const calculateDirection = () => {
        if (!ref.current) return "up";
        const rect = ref.current.getBoundingClientRect();
        const dropdownHeight = 280; // max-h-64 (256px) + some padding
        const spaceAbove = rect.top;
        const spaceBelow = window.innerHeight - rect.bottom;

        // Prefer opening upward, but if not enough space, open downward
        if (spaceAbove < dropdownHeight && spaceBelow > spaceAbove) {
            return "down";
        }
        return "up";
    };

    const handleToggle = () => {
        if (disabled) return;
        if (!open) {
            setOpenDirection(calculateDirection());
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
                <span className="text-xs font-medium text-gray-500">
                    {label}
                </span>
            )}
            <button
                type="button"
                onClick={handleToggle}
                disabled={disabled}
                className={cn(
                    "flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-full",
                    "border transition-all duration-200 min-w-[140px]",
                    disabled
                        ? "bg-gray-100 border-gray-200 cursor-not-allowed opacity-60"
                        : open
                          ? "bg-green-950 border-green-950"
                          : "bg-gray-100 border-gray-100 hover:bg-gray-200",
                )}
            >
                <span
                    className={cn(
                        "truncate flex-1 text-left",
                        disabled
                            ? "text-gray-400"
                            : open
                              ? "text-green-100"
                              : "text-gray-600",
                    )}
                >
                    {displayText}
                </span>
                <svg
                    className={cn(
                        "w-3 h-3 transition-transform",
                        open ? "text-green-100 rotate-180" : "text-gray-400",
                    )}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                >
                    <title>Toggle dropdown</title>
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 9l-7 7-7-7"
                    />
                </svg>
            </button>
            {disabled && (
                <span className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-gray-800 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-[100]">
                    No items available
                </span>
            )}
            {open && !disabled && (
                <div
                    className={cn(
                        "absolute min-w-[320px] bg-white border border-gray-200 rounded-lg shadow-lg z-50 overflow-hidden",
                        openDirection === "up"
                            ? "bottom-full mb-1"
                            : "top-full mt-1",
                        align === "end" ? "right-0" : "left-0",
                    )}
                >
                    <div className="max-h-64 overflow-y-auto overflow-x-hidden">
                        <button
                            type="button"
                            onClick={selectAll}
                            className={cn(
                                "w-full px-3 py-2 text-left text-xs transition-colors flex items-center gap-3",
                                isAllSelected
                                    ? "bg-green-950 text-green-100 font-medium"
                                    : "text-gray-600 hover:bg-gray-100",
                            )}
                        >
                            <span
                                className={cn(
                                    "w-4 h-4 rounded border flex items-center justify-center text-xs flex-shrink-0",
                                    isAllSelected
                                        ? "bg-green-950 border-green-950 text-green-100"
                                        : "border-gray-300",
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
                                            ? "bg-green-950 text-green-100"
                                            : "text-gray-600 hover:bg-gray-100",
                                    )}
                                >
                                    <span
                                        className={cn(
                                            "w-4 h-4 rounded border flex items-center justify-center text-xs flex-shrink-0",
                                            isChecked
                                                ? "bg-green-950 border-green-950 text-green-100"
                                                : "border-gray-300",
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
