import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../../utils";

// ============================================
// FEATURE ITEM COMPONENT
// ============================================
// List item with icon/emoji slot for feature lists
// More engaging than plain border-left lists
//
// Variants:
// - brand: Rose/magenta accent (Why Choose section)
// - highlight: Lime/green accent (What You Can Build)
// - muted: Subtle styling (secondary features)
// ============================================

const featureItemVariants = cva(
    "flex items-start gap-3 font-body text-sm text-text-body-secondary leading-relaxed"
);

const iconVariants = cva(
    "flex items-center justify-center shrink-0 rounded-lg text-base mt-0.5",
    {
        variants: {
            variant: {
                brand: "w-7 h-7 bg-button-primary-bg/20 text-text-brand",
                highlight:
                    "w-7 h-7 bg-button-focus-ring/20 text-text-highlight",
                muted: "w-7 h-7 bg-surface-card text-text-body-secondary",
            },
        },
        defaultVariants: {
            variant: "brand",
        },
    }
);

interface FeatureItemProps
    extends React.HTMLAttributes<HTMLLIElement>,
        VariantProps<typeof iconVariants> {
    icon?: string;
}

export const FeatureItem = React.forwardRef<HTMLLIElement, FeatureItemProps>(
    ({ className, variant, icon, children, ...props }, ref) => {
        return (
            <li
                ref={ref}
                className={cn(featureItemVariants(), className)}
                {...props}
            >
                {icon && (
                    <span className={cn(iconVariants({ variant }))}>
                        {icon}
                    </span>
                )}
                <span className="flex-1">{children}</span>
            </li>
        );
    }
);
FeatureItem.displayName = "FeatureItem";
