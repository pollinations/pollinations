import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../../utils";

// ============================================
// TIER CARD COMPONENT
// ============================================
// Special card variant for sponsorship tiers
// Features emoji display with visual progression
//
// Tiers progress visually:
// - spore: Muted, starting point
// - seed: Growing, more prominent
// - flower: Blooming, vibrant
// - nectar: Premium, golden glow
// ============================================

const tierCardVariants = cva(
    "flex items-start gap-4 p-4 rounded-sub-card transition-all",
    {
        variants: {
            tier: {
                spore: "bg-surface-card border-l-4 border-border-subtle",
                seed: "bg-surface-card border-l-4 border-border-main",
                flower: "bg-surface-card border-l-4 border-border-brand shadow-shadow-brand-sm",
                nectar: "bg-surface-card border-l-4 border-border-highlight shadow-shadow-highlight-sm",
            },
        },
        defaultVariants: {
            tier: "spore",
        },
    }
);

const emojiVariants = cva(
    "flex items-center justify-center rounded-full shrink-0 text-2xl",
    {
        variants: {
            tier: {
                spore: "w-10 h-10 bg-border-subtle/30",
                seed: "w-11 h-11 bg-border-main/30",
                flower: "w-12 h-12 bg-button-primary-bg/20",
                nectar: "w-12 h-12 bg-button-focus-ring/20 shadow-shadow-highlight-sm",
            },
        },
        defaultVariants: {
            tier: "spore",
        },
    }
);

const tierNameVariants = cva(
    "inline-block font-headline text-xs font-black uppercase tracking-wider px-2 py-0.5 rounded mr-2",
    {
        variants: {
            tier: {
                spore: "bg-border-subtle/30 text-text-body-secondary",
                seed: "bg-border-main/30 text-text-body-main",
                flower: "bg-button-primary-bg/20 text-text-brand",
                nectar: "bg-button-focus-ring/20 text-text-highlight",
            },
        },
        defaultVariants: {
            tier: "spore",
        },
    }
);

interface TierCardProps
    extends React.HTMLAttributes<HTMLDivElement>,
        VariantProps<typeof tierCardVariants> {
    emoji: string;
    title: string;
    description: string;
}

export const TierCard = React.forwardRef<HTMLDivElement, TierCardProps>(
    ({ className, tier, emoji, title, description, ...props }, ref) => {
        // Parse title: "Spore — Just arrived" → tierName: "Spore", subtitle: "Just arrived"
        const [tierName, ...rest] = title.split(" — ");
        const subtitle = rest.join(" — ");

        return (
            <div
                ref={ref}
                className={cn(tierCardVariants({ tier, className }))}
                {...props}
            >
                <div className={cn(emojiVariants({ tier }))}>
                    <span role="img" aria-label={title}>
                        {emoji}
                    </span>
                </div>
                <div className="flex-1 min-w-0">
                    <p className="font-headline text-sm font-black text-text-body-main mb-1">
                        <span className={cn(tierNameVariants({ tier }))}>
                            {tierName}
                        </span>
                        {subtitle && (
                            <span className="text-text-body-secondary font-medium normal-case tracking-normal">
                                {subtitle}
                            </span>
                        )}
                    </p>
                    <p className="font-body text-xs text-text-body-secondary leading-relaxed">
                        {description}
                    </p>
                </div>
            </div>
        );
    }
);
TierCard.displayName = "TierCard";
