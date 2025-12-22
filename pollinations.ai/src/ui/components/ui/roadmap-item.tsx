import * as React from "react";
import { cn } from "../../../utils";

// ============================================
// ROADMAP ITEM COMPONENT
// ============================================
// Visual roadmap card with icon
// All items are equal importance, colorful
// ============================================

interface RoadmapItemProps extends React.HTMLAttributes<HTMLDivElement> {
    icon: string;
    title: string;
    description: string;
}

export const RoadmapItem = React.forwardRef<HTMLDivElement, RoadmapItemProps>(
    ({ className, icon, title, description, ...props }, ref) => {
        return (
            <div
                ref={ref}
                className={cn(
                    "flex items-start gap-4 p-4 rounded-sub-card bg-surface-card border-l-4 border-border-highlight",
                    className
                )}
                {...props}
            >
                <div className="flex items-center justify-center shrink-0 w-10 h-10 rounded-full bg-button-focus-ring/20 text-xl">
                    <span role="img" aria-label={title}>
                        {icon}
                    </span>
                </div>
                <div className="flex-1 min-w-0">
                    <p className="font-headline text-sm font-black text-text-body-main mb-1">
                        {title}
                    </p>
                    <p className="font-body text-xs text-text-body-secondary leading-relaxed">
                        {description}
                    </p>
                </div>
            </div>
        );
    }
);
RoadmapItem.displayName = "RoadmapItem";
