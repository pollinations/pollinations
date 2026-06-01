import type { ComponentPropsWithoutRef, FC } from "react";
import { cn } from "../lib/cn.ts";

export type ButtonGroupProps = ComponentPropsWithoutRef<"div"> & {
    wrap?: boolean;
};

export const ButtonGroup: FC<ButtonGroupProps> = ({
    wrap = true,
    className,
    children,
    role = "group",
    ...rest
}) => (
    <div
        {...rest}
        role={role}
        className={cn(
            "polli:flex polli:min-w-0 polli:items-center polli:gap-1.5",
            wrap ? "polli:flex-wrap" : "polli:flex-nowrap",
            className,
        )}
    >
        {children}
    </div>
);
