import * as React from "react";
import { cva } from "class-variance-authority";
import { cn } from "../../lib/utils";

const buttonVariants = cva(
    "inline-flex items-center justify-center transition-all focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50",
    {
        variants: {
            variant: {
                // Primary CTA: Black bg + Lime border (used in HelloPage, CommunityPage, DocsPage)
                // Primary CTA: Black bg + Lime border (used in HelloPage, CommunityPage, DocsPage)
                primary:
                    "gap-2 font-headline uppercase tracking-wider font-black bg-foreground border-r-4 border-b-4 border-primary shadow-primary-md text-background hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-primary-sm",
                // Secondary CTA: Lime bg + Black border (used in HelloPage, DocsPage)
                secondary:
                    "gap-2 font-headline uppercase tracking-wider font-black bg-primary/90 border-r-4 border-b-4 border-foreground shadow-black-md hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-black-sm",
                // Toggle buttons (DocsPage prompts/parameters) - uses data-active attribute
                toggle: "px-3 py-1.5 font-mono text-xs border-2 transition-all data-[active=true]:bg-lime/90 data-[active=true]:border-rose data-[active=true]:font-black data-[active=true]:shadow-rose-sm data-[active=false]:bg-offblack/10 data-[active=false]:border-offblack/30 data-[active=false]:hover:bg-lime/20 data-[active=false]:hover:border-rose data-[active=true]:hover:shadow-rose-md",
                // Copy button (small, lime bg, rose border) - used for Copy URL actions
                copy: "px-4 py-2 font-headline uppercase text-xs font-black bg-lime/90 border-2 border-rose hover:shadow-rose-md transition-all",
                // Model selector (tiny, 4-state logic) - PlayPage model buttons
                model: "relative px-2 py-1.5 font-mono text-sm font-medium border-2 border-transparent transition-all data-[active=true]:data-[type=image]:bg-rose/90 data-[active=true]:data-[type=image]:shadow-black-sm data-[active=true]:data-[type=text]:bg-lime/90 data-[active=true]:data-[type=text]:shadow-black-sm data-[active=true]:data-[type=audio]:bg-cyan/90 data-[active=true]:data-[type=audio]:shadow-black-sm data-[active=false]:bg-offblack/5 data-[active=false]:data-[type=image]:hover:bg-offblack/10 data-[active=false]:data-[type=text]:hover:bg-offblack/10 data-[active=false]:data-[type=audio]:hover:bg-offblack/10",
                // Generate button (full-width, dynamic color) - PlayPage generate button
                generate:
                    "w-full px-6 py-4 font-headline uppercase text-lg font-black border-r-4 border-b-4 border-offblack transition-all data-[type=image]:bg-rose data-[type=image]:shadow-black-md data-[type=image]:hover:translate-x-[2px] data-[type=image]:hover:translate-y-[2px] data-[type=image]:hover:shadow-black-sm data-[type=text]:bg-lime data-[type=text]:shadow-black-md data-[type=text]:hover:translate-x-[2px] data-[type=text]:hover:translate-y-[2px] data-[type=text]:hover:shadow-black-sm data-[type=audio]:bg-cyan data-[type=audio]:shadow-black-md data-[type=audio]:hover:translate-x-[2px] data-[type=audio]:hover:translate-y-[2px] data-[type=audio]:hover:shadow-black-sm disabled:opacity-50 disabled:cursor-not-allowed enabled:cursor-pointer",
                // Icon button (header social icons) - Square, responsive size
                icon: "flex-shrink-0 w-6 h-6 md:w-8 md:h-8 flex items-center justify-center bg-offwhite/80 backdrop-blur-md border-r-4 border-b-4 border-offblack/30 hover:bg-lime/90 hover:border-rose hover:shadow-rose-md transition-all p-1 md:p-1.5",
                // Icon with text button (Enter button) - Responsive height, icon + text
                iconText:
                    "flex-shrink-0 h-6 md:h-8 px-2 md:px-3 flex items-center justify-center gap-1 bg-offwhite/80 backdrop-blur-md border-r-4 border-b-4 border-offblack/30 hover:bg-lime/90 hover:border-rose hover:shadow-rose-md transition-all",
                // Remove button (square rose) - PlayPage image upload remove
                remove: "absolute top-1 right-1 w-6 h-6 bg-rose flex items-center justify-center hover:bg-rose/70 transition-colors",
                // Navigation tab (header nav) - Active/inactive states
                nav: "px-5 py-3 md:px-5 md:py-3 font-headline text-sm md:text-sm font-black uppercase tracking-wider border-r-4 border-b-4 border-rose transition-all duration-200 whitespace-nowrap data-[active=true]:bg-lime/90 data-[active=true]:backdrop-blur-md data-[active=true]:text-offblack data-[active=true]:shadow-rose-md data-[active=false]:bg-offwhite/80 data-[active=false]:backdrop-blur-md data-[active=false]:text-offblack data-[active=false]:hover:bg-lime/90 data-[active=false]:hover:shadow-rose-md",
                // Footer icon (minimal) - Footer social icons
                footerIcon:
                    "w-6 h-6 flex items-center justify-center hover:bg-lime/90 transition-all p-1",
                // Old variants (keeping for backwards compatibility if needed)
                default:
                    "justify-center whitespace-nowrap font-headline uppercase tracking-wider font-black bg-lime/90 text-offblack border-r-4 border-b-4 border-rose shadow-rose-md hover:shadow-rose-lg backdrop-blur-sm",
                outline:
                    "justify-center whitespace-nowrap font-headline uppercase tracking-wider font-black bg-offwhite/80 text-offblack border-r-4 border-b-4 border-rose hover:bg-lime/90 hover:shadow-rose-md backdrop-blur-sm",
                ghost: "font-body text-offblack/60 hover:text-offblack transition-colors cursor-pointer relative",
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

const Button = React.forwardRef<HTMLButtonElement | HTMLAnchorElement, ButtonProps>(
    ({ className, variant, size, as, ...props }, ref) => {
        const Comp = as || "button";
        return (
            <Comp
                className={cn(buttonVariants({ variant, size, className }))}
                ref={ref}
                {...props}
            />
        );
    }
);
Button.displayName = "Button";

export { Button, buttonVariants };
