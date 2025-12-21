import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
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
                    "bg-button-focus-ring/20 text-text-highlight border border-border-highlight shadow-shadow-highlight-sm",
                brand: "bg-button-primary-bg/20 text-text-brand border border-border-brand shadow-shadow-brand-sm",
                muted: "bg-surface-card text-text-body-secondary border border-border-subtle",
            },
        },
        defaultVariants: {
            variant: "highlight",
        },
    }
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
    }
);
Badge.displayName = "Badge";
