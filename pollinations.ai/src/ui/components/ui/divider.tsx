import * as React from "react";
import { cva } from "class-variance-authority";
import { cn } from "../../../utils";

// ============================================
// DIVIDER COMPONENT
// ============================================
// Horizontal rule for separating content sections
// Used consistently across all pages to create visual breaks
//
// Examples:
// - HelloPage: Between major sections (Pollen, Get Pollen, Tiers, etc.)
// - CommunityPage: Between community info and supporters
// - DocsPage: Between API sections
//
// Spacing variants control vertical margin above/below
// ============================================
const dividerVariants = cva("border-t-2 border-border-faint", {
    variants: {
        spacing: {
            default: "my-12", // Standard section spacing (most common)
            comfortable: "my-16", // Extra breathing room
            tight: "my-8", // Compact, less prominent
            compact: "my-6", // Very tight spacing
            none: "", // Custom spacing
        },
    },
    defaultVariants: {
        spacing: "default",
    },
});

import { VariantProps } from "class-variance-authority";

interface DividerProps
    extends React.HTMLAttributes<HTMLHRElement>,
        VariantProps<typeof dividerVariants> {}

export const Divider = React.forwardRef<HTMLHRElement, DividerProps>(
    ({ className, spacing, ...props }, ref) => {
        return (
            <hr
                ref={ref}
                className={cn(dividerVariants({ spacing, className }))}
                {...props}
            />
        );
    }
);
Divider.displayName = "Divider";
