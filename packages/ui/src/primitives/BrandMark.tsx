import type { CSSProperties } from "react";
import lockupUrl from "../brand/lockup-horizontal.svg";
import markUrl from "../brand/mark.svg";
import { cn } from "../lib/cn.ts";

export type BrandMarkProps = {
    variant?: "mark" | "lockup";
    className?: string;
};

const mask = (url: string): CSSProperties => ({
    WebkitMask: `url('${url}') center / contain no-repeat`,
    mask: `url('${url}') center / contain no-repeat`,
});

const MASKS = { mark: mask(markUrl), lockup: mask(lockupUrl) };

/** The lotus (or lotus + wordmark) painted in currentColor; size it with className. */
export function BrandMark({ variant = "mark", className }: BrandMarkProps) {
    return (
        <span
            aria-hidden="true"
            className={cn(
                "polli:block polli:shrink-0 polli:bg-current",
                className,
            )}
            style={MASKS[variant]}
        />
    );
}
