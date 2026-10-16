import { cn } from "../lib/cn.ts";

/**
 * A small green "live" marker for numbers that update in real time. A slow
 * 2.4s ping says "now" without pulling the eye; under reduced motion only
 * the still dot remains. Decorative: the number's own text carries meaning.
 */
export function LiveDot({ className }: { className?: string }) {
    return (
        <span
            aria-hidden="true"
            className={cn(
                "polli:relative polli:inline-flex polli:size-2 polli:shrink-0",
                className,
            )}
        >
            <span className="polli:absolute polli:inset-0 polli:animate-ping polli:rounded-full polli:bg-intent-success-bg-bright polli:opacity-60 polli:[animation-duration:2.4s] polli:motion-reduce:hidden" />
            <span className="polli:relative polli:size-2 polli:rounded-full polli:bg-intent-success-bg-bright" />
        </span>
    );
}
