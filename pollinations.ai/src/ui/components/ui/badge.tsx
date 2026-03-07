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
                // Per-badge accent colors (theme-responsive)
                fresh: "bg-dark/15 text-dark border border-dark/50 shadow-[0_0_6px] shadow-dark/30",
                pollen: "bg-dark/15 text-dark border border-dark/50 shadow-[0_0_6px] shadow-dark/30",
                buzz: "bg-muted/15 text-muted border border-muted/50 shadow-[0_0_6px] shadow-muted/30",
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
