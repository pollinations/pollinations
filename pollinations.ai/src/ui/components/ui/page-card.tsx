import * as React from "react";
import { cn } from "../../../utils";

// ============================================
// PAGE CARD COMPONENT
// ============================================
// Main content container for all pages
// Provides consistent brutalist card styling site-wide
// ============================================

interface PageCardProps extends React.HTMLAttributes<HTMLDivElement> {
    isTranslating?: boolean;
}

export const PageCard = React.forwardRef<HTMLDivElement, PageCardProps>(
    ({ className, children, isTranslating, ...props }, ref) => {
        return (
            <div
                ref={ref}
                className={cn(
                    "relative bg-surface-page border-r-4 border-b-4 border-border-brand shadow-shadow-brand-lg p-6 md:p-8 rounded-card",
                    className,
                )}
                {...props}
            >
                {/* Translation Indicator */}
                {isTranslating && (
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
    },
);
PageCard.displayName = "PageCard";
