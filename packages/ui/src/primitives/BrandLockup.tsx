import type { ComponentPropsWithoutRef, CSSProperties, FC } from "react";
import lockupUrl from "../brand/lockup-horizontal.svg";
import markUrl from "../brand/mark.svg";
import wordmarkUrl from "../brand/wordmark.svg";
import { cn } from "../lib/cn.ts";

/**
 * The brand mark, rendered as a CSS mask so it inherits `currentColor`.
 *
 * That matters more than it looks: an <img> would need a separate black and
 * white file per surface, and would be wrong the moment a theme changed.
 * Masking means one asset works on cream, on the dark panel, and in dark mode.
 *
 * This replaces three near-identical copies of the same mask — AppHeader used
 * the longhand properties, enter's dashboard-shell used the `WebkitMask`
 * shorthand, and the website had its own text-only fallback.
 */
export type BrandVariant = "lockup" | "mark" | "wordmark";

// Each ratio is the asset's own viewBox width / height — `contain` masking
// letterboxes inside a box of any other shape, so keep these in step with the
// files when scripts/brand/generate.mjs changes them.
const ASSETS: Record<BrandVariant, { url: string; ratio: number }> = {
    // Mark plus wordmark, side by side — the default for headers and footers.
    lockup: { url: lockupUrl, ratio: 858.034 / 105.6 },
    mark: { url: markUrl, ratio: 1 },
    wordmark: { url: wordmarkUrl, ratio: 179.97 / 23.77 },
};

export type BrandLockupProps = Omit<
    ComponentPropsWithoutRef<"span">,
    "children"
> & {
    variant?: BrandVariant;
    /** Rendered height in px. Width follows the asset's own ratio. */
    height?: number;
    /** Accessible name; pass "" to hide it from assistive tech. */
    label?: string;
};

export const BrandLockup: FC<BrandLockupProps> = ({
    variant = "lockup",
    height = 24,
    label = "pollinations.ai",
    className,
    style,
    ...rest
}) => {
    const { url, ratio } = ASSETS[variant];
    const mask = `url('${url}') center / contain no-repeat`;

    const maskStyle: CSSProperties = {
        height,
        width: height * ratio,
        backgroundColor: "currentColor",
        WebkitMask: mask,
        mask,
        ...style,
    };

    return (
        <span
            {...rest}
            role="img"
            aria-label={label || undefined}
            aria-hidden={label ? undefined : true}
            className={cn("polli:inline-block polli:shrink-0", className)}
            style={maskStyle}
        />
    );
};
