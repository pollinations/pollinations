import * as React from "react";
import { cn } from "../../../utils";

// ============================================
// PAGE CARD COMPONENT
// ============================================
// Main content container for all pages
// Provides consistent brutalist card styling site-wide
//
// Used on:
// - HelloPage: Main content wrapper
// - PlayPage: Play/Feed interface container
// - DocsPage: Documentation content
// - CommunityPage: Community content
//
// Features:
// - Brutalist borders (right-4, bottom-4)
// - Rose accent shadow
// - Responsive padding (p-6 md:p-8)
// - Semi-transparent offwhite background
//
// Note: Legal pages (Privacy, Terms) use different styling
// and should not use this component
// ============================================

interface PageCardProps extends React.HTMLAttributes<HTMLDivElement> {}

export const PageCard = React.forwardRef<HTMLDivElement, PageCardProps>(
    ({ className, children, ...props }, ref) => {
        return (
            <div
                ref={ref}
                className={cn(
                    "bg-surface-page border-r-4 border-b-4 border-border-brand shadow-shadow-brand-lg p-6 md:p-8 rounded-card",
                    className
                )}
                {...props}
            >
                {children}
            </div>
        );
    }
);
PageCard.displayName = "PageCard";
