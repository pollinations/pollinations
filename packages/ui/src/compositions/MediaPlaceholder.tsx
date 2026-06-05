import type { ComponentPropsWithoutRef, FC, ReactNode } from "react";
import { cn } from "../lib/cn.ts";
import { Text } from "../primitives/Typography.tsx";
import type { ThemeName } from "../theme.ts";

export type MediaPlaceholderProps = ComponentPropsWithoutRef<"div"> & {
    theme?: ThemeName;
    icon?: ReactNode;
    label?: ReactNode;
    detail?: ReactNode;
    action?: ReactNode;
};

export const MediaPlaceholder: FC<MediaPlaceholderProps> = ({
    theme,
    icon,
    label,
    detail,
    action,
    children,
    className,
    ...rest
}) => (
    <div
        {...rest}
        data-theme={theme}
        className={cn(
            "polli:flex polli:aspect-video polli:min-h-40 polli:flex-col polli:items-center polli:justify-center polli:gap-3 polli:rounded-lg polli:border polli:border-dashed polli:border-theme-border polli:bg-theme-bg-pale polli:p-6 polli:text-center",
            className,
        )}
    >
        {icon && (
            <div className="polli:flex polli:h-10 polli:w-10 polli:items-center polli:justify-center polli:rounded-full polli:bg-theme-bg-active polli:text-theme-text-base">
                {icon}
            </div>
        )}
        {(label || detail) && (
            <div className="polli:max-w-sm">
                {label && (
                    <Text as="p" size="sm" tone="strong" weight="semibold">
                        {label}
                    </Text>
                )}
                {detail && (
                    <Text as="p" size="sm" tone="soft" className="polli:mt-1">
                        {detail}
                    </Text>
                )}
            </div>
        )}
        {children}
        {action}
    </div>
);
