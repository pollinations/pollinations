import type { ComponentPropsWithoutRef, FC, ReactNode } from "react";
import { cn } from "../lib/cn.ts";
import { WarningIcon } from "../primitives/icons/index.tsx";
import { Text } from "../primitives/Typography.tsx";

type AlertIntent = "info" | "advisory" | "warning" | "danger";

const intentClasses: Record<AlertIntent, string> = {
    info: "polli:bg-theme-bg-pale polli:text-theme-text-strong",
    advisory: "polli:bg-intent-warning-bg-light/45 polli:text-theme-text-base",
    warning: "polli:bg-intent-warning-bg-light polli:text-intent-warning-text",
    danger: "polli:bg-intent-danger-bg-light polli:text-intent-danger-text",
};

export type AlertProps = Omit<ComponentPropsWithoutRef<"div">, "title"> & {
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
            "polli:rounded-xl polli:px-3 polli:py-2 polli:text-sm",
            intent === "advisory" && "polli:flex polli:items-start polli:gap-2",
            intentClasses[intent],
            className,
        )}
    >
        {intent === "advisory" && (
            <WarningIcon className="polli:mt-0.5 polli:h-4 polli:w-4 polli:shrink-0 polli:text-intent-warning-text" />
        )}
        <div className="polli:min-w-0">
            {title &&
                (intent === "advisory" ? (
                    <>
                        <strong className="polli:font-semibold polli:text-theme-text-strong">
                            {title}
                        </strong>{" "}
                        —{" "}
                    </>
                ) : (
                    <Text
                        as="div"
                        size="xs"
                        tone="strong"
                        weight="bold"
                        className="polli:mb-1 polli:uppercase polli:tracking-wide"
                    >
                        {title}
                    </Text>
                ))}
            {children}
        </div>
    </div>
);
