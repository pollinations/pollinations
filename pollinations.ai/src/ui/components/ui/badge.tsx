import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "../../../utils";

// ============================================
// BADGE COMPONENT
// ============================================
// Small pill/tag for status indicators
// Used for: "Coming soon", "Beta", "New", etc.
//
// Variants:
// - highlight: Lime/green glow effect (positive, new)
// - brand: Rose/magenta accent (important, featured)
// - muted: Subtle, low contrast (informational)
// ============================================

const badgeVariants = cva(
    "inline-flex items-center font-headline text-xs font-black uppercase tracking-wider px-3 py-1 rounded-full",
    {
        variants: {
            variant: {
                highlight:
                    "bg-white text-dark border border-dark shadow-highlight-sm",
                brand: "bg-white text-dark border border-dark shadow-brand-sm",
                muted: "bg-white text-muted border border-tan",
                // Per-badge accent colors — synesthesia mapping
                fresh: "bg-tertiary-strong/25 text-dark border-r-4 border-b-4 border-tertiary-strong shadow-[2px_2px_0_rgb(var(--tertiary-strong)_/_0.3)]",
                pollen: "bg-accent-strong/25 text-dark border-r-4 border-b-4 border-accent-strong shadow-[2px_2px_0_rgb(var(--accent-strong)_/_0.3)]",
                buzz: "bg-primary-strong/25 text-dark border-r-4 border-b-4 border-primary-strong shadow-[2px_2px_0_rgb(var(--primary-strong)_/_0.3)]",
            },
        },
        defaultVariants: {
            variant: "highlight",
        },
    },
);

interface BadgeProps
    extends React.HTMLAttributes<HTMLSpanElement>,
        VariantProps<typeof badgeVariants> {}

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
    ({ className, variant, ...props }, ref) => {
        return (
            <span
                ref={ref}
                className={cn(badgeVariants({ variant, className }))}
                {...props}
            />
        );
    },
);
Badge.displayName = "Badge";
