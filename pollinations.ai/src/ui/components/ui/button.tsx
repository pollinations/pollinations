import { cva } from "class-variance-authority";
import * as React from "react";
import { cn } from "../../../utils";

const buttonVariants = cva(
    "inline-flex items-center justify-center transition focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 rounded-button",
    {
        variants: {
            variant: {
                // Primary CTA: Black bg + black border
                primary:
                    "gap-2 font-headline uppercase tracking-wider font-black bg-dark border-r-4 border-b-4 border-dark shadow-dark-md text-white hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-dark-sm active:translate-x-[3px] active:translate-y-[3px] active:shadow-none",
                // Secondary CTA: White bg + black border
                secondary:
                    "gap-2 font-headline uppercase tracking-wider font-black bg-white border-r-4 border-b-4 border-dark shadow-dark-md text-dark hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-dark-sm active:translate-x-[3px] active:translate-y-[3px] active:shadow-none",
                // Toggle buttons (genre filters) - neutral white-ish style
                toggle: "px-3 py-1.5 font-mono text-base border-2 transition data-[active=true]:bg-[rgb(var(--dark)_/_0.08)] data-[active=true]:border-[rgb(var(--dark)_/_0.3)] data-[active=true]:text-dark data-[active=true]:font-black data-[active=false]:bg-white data-[active=false]:border-cream data-[active=false]:text-subtle data-[active=false]:hover:border-tan data-[active=false]:hover:text-muted",
                // Toggle-glow variant (badge/genre filters) - reads color from --glow CSS variable (RGB triplet)
                // Uses border-r-4 border-b-4 + shadow + press-down effect
                "toggle-glow":
                    "px-3 py-1.5 font-headline uppercase tracking-wider text-xs border-r-4 border-b-4 transition data-[active=true]:bg-[rgb(var(--glow)_/_0.25)] data-[active=true]:border-[rgb(var(--glow))] data-[active=true]:text-dark data-[active=true]:font-black data-[active=true]:shadow-[3px_3px_0_rgb(var(--glow))] data-[active=false]:bg-white data-[active=false]:border-[rgb(var(--glow)_/_0.4)] data-[active=false]:text-dark data-[active=false]:shadow-[2px_2px_0_rgb(var(--glow)_/_0.3)] data-[active=false]:hover:translate-x-[1px] data-[active=false]:hover:translate-y-[1px] data-[active=false]:hover:shadow-[1px_1px_0_rgb(var(--glow)_/_0.2)] active:translate-x-[3px] active:translate-y-[3px] active:shadow-none",
                // Copy button (small, white bg, dark border)
                copy: "px-4 py-2 font-headline uppercase text-xs font-black text-dark bg-white border-2 border-dark hover:shadow-dark-sm transition",
                // Model selector (tiny, 4-state logic) - PlayPage model buttons
                // Unselected: light type-colored bg. Selected: white bg + type-colored border/shadow.
                model: "relative px-2 py-1.5 font-mono text-base font-medium text-dark transition data-[active=true]:bg-white data-[active=true]:text-dark data-[active=true]:font-black data-[active=true]:border-r-4 data-[active=true]:border-b-4 data-[active=true]:data-[type=image]:border-primary-strong data-[active=true]:data-[type=image]:shadow-[3px_3px_0_rgb(var(--primary-strong))] data-[active=true]:data-[type=text]:border-secondary-strong data-[active=true]:data-[type=text]:shadow-[3px_3px_0_rgb(var(--secondary-strong))] data-[active=true]:data-[type=audio]:border-tertiary-strong data-[active=true]:data-[type=audio]:shadow-[3px_3px_0_rgb(var(--tertiary-strong))] data-[active=true]:data-[type=video]:border-accent-strong data-[active=true]:data-[type=video]:shadow-[3px_3px_0_rgb(var(--accent-strong))] data-[active=false]:data-[type=image]:bg-primary-light/40 data-[active=false]:data-[type=text]:bg-secondary-light/40 data-[active=false]:data-[type=audio]:bg-tertiary-light/40 data-[active=false]:data-[type=video]:bg-accent-strong/30 data-[active=false]:hover:data-[type=image]:bg-primary-light/70 data-[active=false]:hover:data-[type=text]:bg-secondary-light/70 data-[active=false]:hover:data-[type=audio]:bg-tertiary-light/70 data-[active=false]:hover:data-[type=video]:bg-accent-strong/50",
                // Generate button (full-width, dynamic color) - PlayPage generate button
                generate:
                    "w-full px-6 py-4 font-headline uppercase text-sm font-black text-dark border-r-4 border-b-4 border-dark transition data-[type=image]:bg-primary-strong data-[type=image]:shadow-dark-md data-[type=image]:hover:translate-x-[2px] data-[type=image]:hover:translate-y-[2px] data-[type=image]:hover:shadow-dark-sm data-[type=text]:bg-secondary-strong data-[type=text]:shadow-dark-md data-[type=text]:hover:translate-x-[2px] data-[type=text]:hover:translate-y-[2px] data-[type=text]:hover:shadow-dark-sm data-[type=audio]:bg-tertiary-strong data-[type=audio]:shadow-dark-md data-[type=audio]:hover:translate-x-[2px] data-[type=audio]:hover:translate-y-[2px] data-[type=audio]:hover:shadow-dark-sm data-[type=video]:bg-accent-strong data-[type=video]:shadow-dark-md data-[type=video]:hover:translate-x-[2px] data-[type=video]:hover:translate-y-[2px] data-[type=video]:hover:shadow-dark-sm disabled:opacity-50 disabled:cursor-not-allowed enabled:cursor-pointer",
                // Icon button (header social icons) - Square, responsive size
                icon: "flex-shrink-0 w-6 h-6 lg:w-8 lg:h-8 flex items-center justify-center bg-white border-r-4 border-b-4 border-dark shadow-dark-sm hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition p-1 lg:p-1.5",
                // Icon with text button (Enter button) - Matches nav button padding
                iconText:
                    "flex-shrink-0 px-3 py-1.5 flex items-center justify-center gap-1 bg-white text-dark border-r-4 border-b-4 border-dark shadow-dark-sm hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition",
                // Remove button (square rose) - PlayPage image upload remove
                remove: "absolute top-1 right-1 w-6 h-6 bg-primary-light flex items-center justify-center transition-colors",
                // Navigation tab (header nav) - Active/inactive states. Black when active.
                nav: "px-3 py-1.5 lg:px-4 lg:py-2.5 font-headline text-xs lg:text-sm font-black uppercase tracking-wider border-r-4 border-b-4 transition duration-200 whitespace-nowrap active:translate-x-[2px] active:translate-y-[2px] active:shadow-none data-[active=true]:border-dark data-[active=true]:bg-accent-strong data-[active=true]:text-dark data-[active=true]:shadow-dark-md data-[active=false]:border-dark data-[active=false]:bg-white data-[active=false]:text-dark data-[active=false]:shadow-dark-sm data-[active=false]:hover:border-dark data-[active=false]:hover:bg-accent-strong data-[active=false]:hover:text-dark data-[active=false]:hover:shadow-dark-md data-[active=false]:hover:translate-x-[-1px] data-[active=false]:hover:translate-y-[-1px]",
            },
            size: {
                default: "px-4 py-2.5 text-xs",
                sm: "px-3 py-2 text-xs",
                lg: "px-5 py-3 text-sm",
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
