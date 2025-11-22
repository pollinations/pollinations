import * as React from "react";
import { cn } from "../../../utils";

// ============================================
// PAGE CONTAINER COMPONENT
// ============================================
// Standard page layout wrapper for all pages
// Provides consistent horizontal padding, centering, and max-width
//
// Structure:
// - Full-width outer wrapper with horizontal padding
// - Max-width centered inner container
//
// Usage:
// <PageContainer>
//   <PageCard>
//     {/* page content */}
//   </PageCard>
// </PageContainer>
//
// Props:
// - noPaddingBottom: Remove bottom padding (for pages like PlayPage)
// - className: Additional classes for the outer wrapper
// ============================================

interface PageContainerProps extends React.HTMLAttributes<HTMLDivElement> {
    noPaddingBottom?: boolean;
}

export const PageContainer = React.forwardRef<HTMLDivElement, PageContainerProps>(
    ({ className, noPaddingBottom = false, children, ...props }, ref) => {
        return (
            <div
                ref={ref}
                className={cn(
                    "w-full px-4",
                    !noPaddingBottom && "pb-12",
                    className
                )}
                {...props}
            >
                <div className="max-w-4xl mx-auto">{children}</div>
            </div>
        );
    }
);
PageContainer.displayName = "PageContainer";
