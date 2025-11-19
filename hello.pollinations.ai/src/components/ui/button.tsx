import * as React from "react";
import { cva } from "class-variance-authority";
import { cn } from "../../lib/utils";

const buttonVariants = cva(
    "inline-flex items-center justify-center transition-all focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50",
    {
        variants: {
            variant: {
                // Primary CTA: Black bg + Yellow border (used in HelloPage, CommunityPage, DocsPage)
                primary:
                    "gap-2 font-headline uppercase tracking-wider font-black bg-charcoal border-r-4 border-b-4 border-yellow shadow-lime-md text-white hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-lime-sm",
                // Secondary CTA: Yellow bg + Black border (used in HelloPage, DocsPage)
                secondary:
                    "gap-2 font-headline uppercase tracking-wider font-black bg-yellow border-r-4 border-b-4 border-charcoal shadow-charcoal-md text-charcoal hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-charcoal-sm",
                // Toggle buttons (DocsPage prompts/parameters) - uses data-active attribute
                toggle: "px-3 py-1.5 font-mono text-xs border-2 transition-all data-[active=true]:bg-yellow data-[active=true]:border-pink data-[active=true]:font-black data-[active=true]:shadow-pink-sm data-[active=false]:bg-gray-ultra-light data-[active=false]:border-gray data-[active=false]:hover:bg-gray-ultra-light data-[active=false]:hover:border-pink data-[active=true]:hover:shadow-pink-md",
                // Copy button (small, lime bg, rose border) - used for Copy URL actions
                copy: "px-4 py-2 font-headline uppercase text-xs font-black bg-yellow border-2 border-pink hover:shadow-pink-md transition-all",
                // Model selector (tiny, 4-state logic) - PlayPage model buttons
                model: "relative px-2 py-1.5 font-mono text-sm font-medium border-2 border-transparent transition-all data-[active=true]:data-[type=image]:bg-pink data-[active=true]:data-[type=image]:shadow-charcoal-sm data-[active=true]:data-[type=text]:bg-yellow data-[active=true]:data-[type=text]:shadow-charcoal-sm data-[active=true]:data-[type=audio]:bg-cyan data-[active=true]:data-[type=audio]:shadow-charcoal-sm data-[active=false]:bg-gray-ultra-light data-[active=false]:data-[type=image]:hover:bg-gray-ultra-light data-[active=false]:data-[type=text]:hover:bg-gray-ultra-light data-[active=false]:data-[type=audio]:hover:bg-gray-ultra-light",
                // Generate button (full-width, dynamic color) - PlayPage generate button
                generate:
                    "w-full px-6 py-4 font-headline uppercase text-lg font-black border-r-4 border-b-4 border-charcoal transition-all data-[type=image]:bg-pink data-[type=image]:shadow-charcoal-md data-[type=image]:hover:translate-x-[2px] data-[type=image]:hover:translate-y-[2px] data-[type=image]:hover:shadow-charcoal-sm data-[type=text]:bg-yellow data-[type=text]:shadow-charcoal-md data-[type=text]:hover:translate-x-[2px] data-[type=text]:hover:translate-y-[2px] data-[type=text]:hover:shadow-charcoal-sm data-[type=audio]:bg-cyan data-[type=audio]:shadow-charcoal-md data-[type=audio]:hover:translate-x-[2px] data-[type=audio]:hover:translate-y-[2px] data-[type=audio]:hover:shadow-charcoal-sm disabled:opacity-50 disabled:cursor-not-allowed enabled:cursor-pointer",
                // Icon button (header social icons) - Square, responsive size
                icon: "flex-shrink-0 w-6 h-6 md:w-8 md:h-8 flex items-center justify-center bg-gray-light backdrop-blur-md border-r-4 border-b-4 border-gray hover:bg-yellow hover:border-pink hover:shadow-pink-md transition-all p-1 md:p-1.5",
                // Icon with text button (Enter button) - Responsive height, icon + text
                iconText:
                    "flex-shrink-0 h-6 md:h-8 px-2 md:px-3 flex items-center justify-center gap-1 bg-gray-light backdrop-blur-md border-r-4 border-b-4 border-gray hover:bg-yellow hover:border-pink hover:shadow-pink-md transition-all",
                // Remove button (square rose) - PlayPage image upload remove
                remove: "absolute top-1 right-1 w-6 h-6 bg-pink flex items-center justify-center transition-colors",
                // Navigation tab (header nav) - Active/inactive states
                nav: "px-5 py-3 md:px-5 md:py-3 font-headline text-sm md:text-sm font-black uppercase tracking-wider border-r-4 border-b-4 border-pink transition-all duration-200 whitespace-nowrap data-[active=true]:bg-yellow data-[active=true]:backdrop-blur-md data-[active=true]:text-charcoal data-[active=true]:shadow-pink-md data-[active=false]:bg-gray-light data-[active=false]:backdrop-blur-md data-[active=false]:text-charcoal data-[active=false]:hover:bg-yellow data-[active=false]:hover:shadow-pink-md",
                // Footer icon (minimal) - Footer social icons
                footerIcon:
                    "w-6 h-6 flex items-center justify-center hover:bg-yellow transition-all p-1",
                // Old variants (keeping for backwards compatibility if needed)
                default:
                    "justify-center whitespace-nowrap font-headline uppercase tracking-wider font-black bg-yellow text-charcoal border-r-4 border-b-4 border-pink shadow-pink-md hover:shadow-pink-lg backdrop-blur-sm",
                outline:
                    "justify-center whitespace-nowrap font-headline uppercase tracking-wider font-black bg-gray-light text-charcoal border-r-4 border-b-4 border-pink hover:bg-yellow hover:shadow-pink-md backdrop-blur-sm",
                ghost: "font-body text-charcoal hover:text-charcoal transition-colors cursor-pointer relative",
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
