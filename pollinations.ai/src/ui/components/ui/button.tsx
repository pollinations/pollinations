import { cva } from "class-variance-authority";
import * as React from "react";
import { cn } from "../../../utils";

const buttonVariants = cva(
    "inline-flex items-center justify-center transition-all focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 rounded-button",
    {
        variants: {
            variant: {
                // Primary CTA: Black bg + Yellow border (used in HelloPage, CommunityPage, PlayPage)
                primary:
                    "gap-2 font-headline uppercase tracking-wider font-black bg-button-primary-bg border-r-4 border-b-4 border-border-highlight shadow-shadow-dark-md text-text-on-color hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-shadow-dark-sm active:translate-x-[3px] active:translate-y-[3px] active:shadow-none",
                // Secondary CTA: Yellow bg + Black border (used in HelloPage, PlayPage)
                secondary:
                    "gap-2 font-headline uppercase tracking-wider font-black bg-button-secondary-bg border-r-4 border-b-4 border-border-strong shadow-shadow-dark-md text-text-body-main hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-shadow-dark-sm active:translate-x-[3px] active:translate-y-[3px] active:shadow-none",
                // Toggle buttons (genre filters) - neutral white-ish style
                toggle: "px-3 py-1.5 font-mono text-base border-2 transition-all data-[active=true]:bg-[rgb(var(--text-primary)_/_0.08)] data-[active=true]:border-[rgb(var(--text-primary)_/_0.3)] data-[active=true]:text-text-body-main data-[active=true]:font-black data-[active=false]:bg-input-background data-[active=false]:border-border-faint data-[active=false]:text-text-caption data-[active=false]:hover:border-border-subtle data-[active=false]:hover:text-text-body-secondary",
                // Toggle-glow variant (badge filters) - reads color from --glow CSS variable (RGB triplet)
                "toggle-glow":
                    "px-3 py-1.5 font-headline uppercase tracking-wider text-base border-2 transition-all data-[active=true]:bg-[rgb(var(--glow)_/_0.15)] data-[active=true]:border-[rgb(var(--glow))] data-[active=true]:text-[rgb(var(--glow))] data-[active=true]:font-black data-[active=true]:shadow-[0_0_10px_rgb(var(--glow)_/_0.4)] data-[active=false]:bg-input-background data-[active=false]:border-border-subtle data-[active=false]:text-[rgb(var(--glow)_/_0.6)] data-[active=false]:hover:border-[rgb(var(--glow)_/_0.6)] data-[active=false]:hover:text-[rgb(var(--glow))] data-[active=false]:hover:shadow-[0_0_6px_rgb(var(--glow)_/_0.25)]",
                // Copy button (small, lime bg, rose border) - used for Copy URL actions
                copy: "px-4 py-2 font-headline uppercase text-base font-black text-text-body-main bg-button-secondary-bg border-2 border-border-brand hover:shadow-shadow-brand-md transition-all",
                // Model selector (tiny, 4-state logic) - PlayPage model buttons
                model: "relative px-2 py-1.5 font-mono text-base font-medium text-text-body-main transition-all data-[active=true]:text-text-on-color data-[active=true]:data-[type=image]:bg-indicator-image data-[active=true]:data-[type=image]:shadow-shadow-dark-sm data-[active=true]:data-[type=text]:bg-indicator-text data-[active=true]:data-[type=text]:shadow-shadow-dark-sm data-[active=true]:data-[type=audio]:bg-indicator-audio data-[active=true]:data-[type=audio]:shadow-shadow-dark-sm data-[active=true]:data-[type=video]:bg-indicator-video data-[active=true]:data-[type=video]:shadow-shadow-dark-sm data-[active=false]:bg-input-background data-[active=false]:data-[type=image]:hover:bg-input-background data-[active=false]:data-[type=text]:hover:bg-input-background data-[active=false]:data-[type=audio]:hover:bg-input-background data-[active=false]:data-[type=video]:hover:bg-input-background",
                // Generate button (full-width, dynamic color) - PlayPage generate button
                generate:
                    "w-full px-6 py-5 font-headline uppercase text-2xl font-black text-text-on-color border-r-4 border-b-4 border-border-strong transition-all data-[type=image]:bg-indicator-image data-[type=image]:shadow-shadow-dark-md data-[type=image]:hover:translate-x-[2px] data-[type=image]:hover:translate-y-[2px] data-[type=image]:hover:shadow-shadow-dark-sm data-[type=text]:bg-indicator-text data-[type=text]:shadow-shadow-dark-md data-[type=text]:hover:translate-x-[2px] data-[type=text]:hover:translate-y-[2px] data-[type=text]:hover:shadow-shadow-dark-sm data-[type=audio]:bg-indicator-audio data-[type=audio]:shadow-shadow-dark-md data-[type=audio]:hover:translate-x-[2px] data-[type=audio]:hover:translate-y-[2px] data-[type=audio]:hover:shadow-shadow-dark-sm data-[type=video]:bg-indicator-video data-[type=video]:shadow-shadow-dark-md data-[type=video]:hover:translate-x-[2px] data-[type=video]:hover:translate-y-[2px] data-[type=video]:hover:shadow-shadow-dark-sm disabled:opacity-50 disabled:cursor-not-allowed enabled:cursor-pointer",
                // Icon button (header social icons) - Square, responsive size
                icon: "flex-shrink-0 w-6 h-6 lg:w-8 lg:h-8 flex items-center justify-center bg-surface-page backdrop-blur-md border-r-4 border-b-4 border-border-subtle shadow-shadow-dark-sm hover:bg-button-secondary-bg hover:border-border-brand hover:shadow-shadow-dark-md hover:translate-x-[-1px] hover:translate-y-[-1px] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all p-1 lg:p-1.5",
                // Icon with text button (Enter button) - Matches nav button padding
                iconText:
                    "flex-shrink-0 px-3 py-1.5 flex items-center justify-center gap-1 bg-surface-page backdrop-blur-md border-r-4 border-b-4 border-border-accent shadow-shadow-dark-sm hover:bg-button-secondary-bg hover:border-border-brand hover:shadow-shadow-dark-md hover:translate-x-[-1px] hover:translate-y-[-1px] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all",
                // Remove button (square rose) - PlayPage image upload remove
                remove: "absolute top-1 right-1 w-6 h-6 bg-indicator-image flex items-center justify-center transition-colors",
                // Navigation tab (header nav) - Active/inactive states
                nav: "px-3 py-1.5 lg:px-5 lg:py-3 font-headline text-base lg:text-lg font-black uppercase tracking-wider border-r-4 border-b-4 transition-all duration-200 whitespace-nowrap active:translate-x-[2px] active:translate-y-[2px] active:shadow-none data-[active=true]:border-border-brand data-[active=true]:bg-button-secondary-bg data-[active=true]:backdrop-blur-md data-[active=true]:text-text-body-main data-[active=true]:shadow-shadow-dark-md data-[active=false]:border-border-highlight data-[active=false]:bg-surface-page data-[active=false]:backdrop-blur-md data-[active=false]:text-text-body-main data-[active=false]:shadow-shadow-dark-sm data-[active=false]:hover:border-border-brand data-[active=false]:hover:bg-button-secondary-bg data-[active=false]:hover:shadow-shadow-dark-md data-[active=false]:hover:translate-x-[-1px] data-[active=false]:hover:translate-y-[-1px]",
            },
            size: {
                default: "px-4 py-3 text-base",
                sm: "px-3 py-2 text-base",
                lg: "px-6 py-4 text-lg",
                icon: "h-10 w-10",
            },
        },
        defaultVariants: {
            variant: "primary",
            size: "lg",
        },
    },
);

import type { VariantProps } from "class-variance-authority";

export interface ButtonProps
    extends React.ButtonHTMLAttributes<HTMLButtonElement>,
        VariantProps<typeof buttonVariants> {
    as?: React.ElementType;
    href?: string;
    to?: string;
    target?: string;
    rel?: string;
}

const Button = React.forwardRef<
    HTMLButtonElement | HTMLAnchorElement,
    ButtonProps
>(({ className, variant, size, as, ...props }, ref) => {
    const Comp = as || "button";
    return (
        <Comp
            className={cn(buttonVariants({ variant, size, className }))}
            ref={ref}
            {...props}
        />
    );
});
Button.displayName = "Button";

export { Button, buttonVariants };
