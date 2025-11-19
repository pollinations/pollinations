import * as React from "react";
import { cva } from "class-variance-authority";
import { cn } from "../../lib/utils";

// ============================================
// SUB CARD COMPONENT
// ============================================
// Nested content cards that appear inside PageCard
// Creates visual hierarchy with subtle dark background
//
// Usage Examples:
// - Feature cards (Buy Pollen, Discord/GitHub info)
// - Roadmap timeline items
// - Info blocks within main content
//
// Size Variants:
// - default (p-6): Feature cards, two-column layouts
// - compact (p-4): Roadmap items, timeline entries
//
// Visual Pattern:
// - Light dark background (bg-offblack/5)
// - No borders (contrast with PageCard's rose border)
// - Responsive padding
// ============================================

const subCardVariants = cva("bg-offblack/5", {
    variants: {
        size: {
            default: "p-6", // Feature cards (HelloPage, CommunityPage)
            compact: "p-4", // Roadmap items (HelloPage timeline)
        },
    },
    defaultVariants: {
        size: "default",
    },
});

export const SubCard = React.forwardRef(
    ({ className, size, children, ...props }, ref) => {
        return (
            <div
                ref={ref}
                className={cn(subCardVariants({ size, className }))}
                {...props}
            >
                {children}
            </div>
        );
    }
);
SubCard.displayName = "SubCard";
