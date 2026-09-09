import type { ComponentPropsWithoutRef, FC } from "react";
import { cn } from "../lib/cn.ts";

export type ButtonGroupProps = ComponentPropsWithoutRef<"div">;

export const ButtonGroup: FC<ButtonGroupProps> = ({
    className,
    children,
    role = "group",
    ...rest
}) => (
    <div
        {...rest}
        role={role}
        className={cn(
            "polli:flex polli:min-w-0 polli:flex-wrap polli:items-center polli:gap-1.5",
            className,
        )}
    >
        {children}
    </div>
);
