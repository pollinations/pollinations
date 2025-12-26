import * as React from "react";
import { cn } from "../../../utils";
import { useCopy } from "../../contexts/CopyContext";

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
        const { isProcessing } = useCopy();
        return (
            <div
                ref={ref}
                className={cn(
                    "relative bg-surface-page border-r-4 border-b-4 border-border-brand shadow-shadow-brand-lg p-6 md:p-8 rounded-card",
                    className
                )}
                {...props}
            >
                {/* Translation Indicator */}
                {isProcessing && (
                    <div className="absolute top-2 right-3 md:top-3 md:right-4 z-10">
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-black/70 backdrop-blur-sm border border-white/20 text-[10px] text-white/70">
                            <span className="w-1.5 h-1.5 rounded-full bg-text-brand animate-pulse" />
                            Translating
                        </span>
                    </div>
                )}
                {children}
            </div>
        );
    }
);
PageCard.displayName = "PageCard";
