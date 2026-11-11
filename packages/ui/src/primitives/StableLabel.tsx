import type { ReactNode } from "react";
import { cn } from "../lib/cn.ts";

export type StableLabelProps = {
    text: string;
    /** Every text this label can show; the widest sets its size. */
    options: readonly string[];
    /** `end` aligns to the end from sm up and to the start on phones. */
    align?: "center" | "end";
    /** Drawn before the text in every option, so it stays beside it. */
    prefix?: ReactNode;
};

/**
 * Text that changes without moving anything: every option is stacked in one
 * grid cell, the unused ones invisible, so the widest sets the size.
 */
export function StableLabel({
    text,
    options,
    align = "center",
    prefix,
}: StableLabelProps) {
    return (
        <span
            className={cn(
                "polli:inline-grid",
                align === "center"
                    ? "polli:justify-items-center"
                    : "polli:justify-items-start polli:sm:justify-items-end",
            )}
        >
            {options.map((option) => (
                <span
                    key={option}
                    aria-hidden="true"
                    className="polli:invisible polli:col-start-1 polli:row-start-1 polli:inline-flex polli:items-center polli:gap-1"
                >
                    {prefix}
                    {option}
                </span>
            ))}
            <span className="polli:col-start-1 polli:row-start-1 polli:inline-flex polli:items-center polli:gap-1">
                {prefix}
                {text}
            </span>
        </span>
    );
}
