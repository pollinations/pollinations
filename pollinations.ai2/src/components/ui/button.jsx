import * as React from "react";
import { cva } from "class-variance-authority";
import { cn } from "../../lib/utils";

const buttonVariants = cva(
    "inline-flex items-center justify-center whitespace-nowrap font-headline uppercase tracking-wider font-black transition-all focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50",
    {
        variants: {
            variant: {
                default:
                    "bg-lime/90 text-offblack border-r-4 border-b-4 border-rose shadow-[4px_4px_0px_0px_rgba(255,105,180,1)] hover:shadow-[6px_6px_0px_0px_rgba(255,105,180,1)] backdrop-blur-sm",
                outline:
                    "bg-offwhite/80 text-offblack border-r-4 border-b-4 border-rose hover:bg-lime/90 hover:shadow-[4px_4px_0px_0px_rgba(255,105,180,1)] backdrop-blur-sm",
                ghost: "hover:bg-lime/10 text-offwhite",
                brutal: "bg-lime/90 text-offblack border-r-4 border-b-4 border-rose shadow-[4px_4px_0px_0px_rgba(255,105,180,1)] hover:shadow-[6px_6px_0px_0px_rgba(255,105,180,1)] backdrop-blur-sm",
            },
            size: {
                default: "px-4 py-3 text-xs",
                sm: "px-3 py-2 text-xs",
                lg: "px-8 py-4 text-sm",
                icon: "h-10 w-10",
            },
        },
        defaultVariants: {
            variant: "default",
            size: "default",
        },
    }
);

const Button = React.forwardRef(
    ({ className, variant, size, ...props }, ref) => {
        return (
            <button
                className={cn(buttonVariants({ variant, size, className }))}
                ref={ref}
                {...props}
            />
        );
    }
);
Button.displayName = "Button";

export { Button, buttonVariants };
