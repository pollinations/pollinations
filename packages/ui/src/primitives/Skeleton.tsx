import { cn } from "../lib/cn.ts";

const shapeClasses = {
    // Stands in for a card or tile.
    card: "polli:rounded-card",
    // A line of text or a number.
    text: "polli:rounded-md",
    // Fills a frame that clips its own corners, like an image strip in a card.
    media: "",
} as const;

export type SkeletonProps = {
    shape?: keyof typeof shapeClasses;
    /** Size only (height, width, aspect ratio); the shape sets the corners. */
    className?: string;
};

/**
 * A quiet pulsing block that holds the place of content still loading, at
 * the size of what replaces it. Decorative: mark the loading region with
 * aria-busy. Still under reduced motion.
 */
export function Skeleton({ shape = "card", className }: SkeletonProps) {
    return (
        <span
            aria-hidden="true"
            className={cn(
                "polli:block polli:animate-pulse polli:bg-theme-bg-subtle polli:motion-reduce:animate-none",
                shapeClasses[shape],
                className,
            )}
        />
    );
}
