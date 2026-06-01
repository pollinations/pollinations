import type { ComponentPropsWithoutRef, FC, ReactNode } from "react";
import { cn } from "../lib/cn.ts";

type AlertIntent = "info" | "success" | "warning" | "danger";

const intentClasses: Record<AlertIntent, string> = {
    info: "polli:border-theme-border polli:bg-theme-bg-pale polli:text-theme-text-strong",
    success:
        "polli:border-intent-success-border polli:bg-intent-success-bg-light polli:text-intent-success-text",
    warning:
        "polli:border-intent-warning-border polli:bg-intent-warning-bg-light polli:text-intent-warning-text",
    danger: "polli:border-intent-danger-border polli:bg-intent-danger-bg-light polli:text-intent-danger-text",
};

export type AlertProps = ComponentPropsWithoutRef<"div"> & {
    intent?: AlertIntent;
    title?: ReactNode;
};

export const Alert: FC<AlertProps> = ({
    intent = "info",
    title,
    className,
    children,
    ...rest
}) => (
    <div
        {...rest}
        role={intent === "danger" ? "alert" : "status"}
        className={cn(
            "polli:rounded-xl polli:border polli:px-3 polli:py-2 polli:text-sm",
            intentClasses[intent],
            className,
        )}
    >
        {title && (
            <div className="polli:mb-1 polli:text-xs polli:font-bold polli:uppercase polli:tracking-wide">
                {title}
            </div>
        )}
        <div>{children}</div>
    </div>
);
