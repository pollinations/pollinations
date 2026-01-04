"use client";

import * as ProgressPrimitive from "@radix-ui/react-progress";
import type * as React from "react";

import { cn } from "./utils";

function Progress({
    className,
    value,
    style,
    ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root>) {
    const progressBg = (style as any)?.__progressBackground;

    return (
        <ProgressPrimitive.Root
            data-slot="progress"
            className={cn(
                "bg-primary/20 relative h-2 w-full overflow-hidden rounded-full",
                className,
            )}
            style={style}
            {...props}
        >
            <ProgressPrimitive.Indicator
                data-slot="progress-indicator"
                className="bg-primary h-full w-full flex-1 transition-all"
                style={{
                    transform: `translateX(-${100 - (value || 0)}%)`,
                    backgroundColor: progressBg || undefined,
                }}
            />
        </ProgressPrimitive.Root>
    );
}

export { Progress };
