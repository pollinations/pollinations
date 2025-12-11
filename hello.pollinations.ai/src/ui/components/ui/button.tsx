import * as React from "react";
import { cva } from "class-variance-authority";
import { cn } from "../../../utils";

const buttonVariants = cva(
    "inline-flex items-center justify-center transition-all focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 rounded-button",
    {
        variants: {
            variant: {
                // Primary CTA: Black bg + Yellow border (used in HelloPage, CommunityPage, DocsPage)
                primary:
                    "gap-2 font-headline uppercase tracking-wider font-black bg-button-primary-bg border-r-4 border-b-4 border-border-highlight shadow-shadow-highlight-md text-text-on-color hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-shadow-highlight-sm",
                // Secondary CTA: Yellow bg + Black border (used in HelloPage, DocsPage)
                secondary:
                    "gap-2 font-headline uppercase tracking-wider font-black bg-button-secondary-bg border-r-4 border-b-4 border-border-strong shadow-shadow-dark-md text-text-body-main hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-shadow-dark-sm",
                // Toggle buttons (DocsPage prompts/parameters) - uses data-active attribute
                toggle: "px-3 py-1.5 font-mono text-xs border-2 transition-all text-text-body-main data-[active=true]:bg-button-secondary-bg data-[active=true]:border-border-brand data-[active=true]:font-black data-[active=true]:shadow-shadow-brand-sm data-[active=false]:bg-input-background data-[active=false]:border-border-main data-[active=false]:hover:bg-input-background data-[active=false]:hover:border-border-brand data-[active=true]:hover:shadow-shadow-brand-md",
                // Copy button (small, lime bg, rose border) - used for Copy URL actions
                copy: "px-4 py-2 font-headline uppercase text-xs font-black text-text-body-main bg-button-secondary-bg border-2 border-border-brand hover:shadow-shadow-brand-md transition-all",
                // Model selector (tiny, 4-state logic) - PlayPage model buttons
                model: "relative px-2 py-1.5 font-mono text-sm font-medium text-text-body-main border-2 border-transparent transition-all data-[active=true]:text-text-on-color data-[active=true]:data-[type=image]:bg-indicator-image data-[active=true]:data-[type=image]:shadow-shadow-dark-sm data-[active=true]:data-[type=text]:bg-indicator-text data-[active=true]:data-[type=text]:shadow-shadow-dark-sm data-[active=true]:data-[type=audio]:bg-indicator-audio data-[active=true]:data-[type=audio]:shadow-shadow-dark-sm data-[active=false]:bg-input-background data-[active=false]:data-[type=image]:hover:bg-input-background data-[active=false]:data-[type=text]:hover:bg-input-background data-[active=false]:data-[type=audio]:hover:bg-input-background",
                // Generate button (full-width, dynamic color) - PlayPage generate button
                generate:
                    "w-full px-6 py-4 font-headline uppercase text-lg font-black text-text-body-main border-r-4 border-b-4 border-border-strong transition-all data-[type=image]:bg-indicator-image data-[type=image]:shadow-shadow-dark-md data-[type=image]:hover:translate-x-[2px] data-[type=image]:hover:translate-y-[2px] data-[type=image]:hover:shadow-shadow-dark-sm data-[type=text]:bg-indicator-text data-[type=text]:shadow-shadow-dark-md data-[type=text]:hover:translate-x-[2px] data-[type=text]:hover:translate-y-[2px] data-[type=text]:hover:shadow-shadow-dark-sm data-[type=audio]:bg-indicator-audio data-[type=audio]:shadow-shadow-dark-md data-[type=audio]:hover:translate-x-[2px] data-[type=audio]:hover:translate-y-[2px] data-[type=audio]:hover:shadow-shadow-dark-sm disabled:opacity-50 disabled:cursor-not-allowed enabled:cursor-pointer",
                // Icon button (header social icons) - Square, responsive size
                icon: "flex-shrink-0 w-6 h-6 md:w-8 md:h-8 flex items-center justify-center bg-surface-page backdrop-blur-md border-r-4 border-b-4 border-border-main hover:bg-button-secondary-bg hover:border-border-brand hover:shadow-shadow-brand-md transition-all p-1 md:p-1.5",
                // Icon with text button (Enter button) - Responsive height, icon + text
                iconText:
                    "flex-shrink-0 h-6 md:h-8 px-2 md:px-3 flex items-center justify-center gap-1 bg-surface-page backdrop-blur-md border-r-4 border-b-4 border-border-main hover:bg-button-secondary-bg hover:border-border-brand hover:shadow-shadow-brand-md transition-all",
                // Remove button (square rose) - PlayPage image upload remove
                remove: "absolute top-1 right-1 w-6 h-6 bg-indicator-image flex items-center justify-center transition-colors",
                // Navigation tab (header nav) - Active/inactive states
                nav: "px-5 py-3 md:px-5 md:py-3 font-headline text-sm md:text-sm font-black uppercase tracking-wider border-r-4 border-b-4 border-border-brand transition-all duration-200 whitespace-nowrap data-[active=true]:bg-button-secondary-bg data-[active=true]:backdrop-blur-md data-[active=true]:text-text-body-main data-[active=true]:shadow-shadow-brand-md data-[active=false]:bg-surface-page data-[active=false]:backdrop-blur-md data-[active=false]:text-text-body-main data-[active=false]:hover:bg-button-secondary-bg data-[active=false]:hover:shadow-shadow-brand-md",
            },
            size: {
                default: "px-4 py-3 text-xs",
                sm: "px-3 py-2 text-xs",
                lg: "px-6 py-4 text-sm",
                icon: "h-10 w-10",
            },
        },
        defaultVariants: {
            variant: "primary",
            size: "lg",
        },
    }
);

import { VariantProps } from "class-variance-authority";

export interface ButtonProps
    extends React.ButtonHTMLAttributes<HTMLButtonElement>,
        VariantProps<typeof buttonVariants> {
    as?: React.ElementType;
    href?: string;
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
