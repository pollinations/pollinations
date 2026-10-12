import type {
    ComponentPropsWithoutRef,
    CSSProperties,
    FC,
    ReactNode,
} from "react";
import { cn } from "../lib/cn.ts";
import { Text } from "../primitives/Typography.tsx";

export type MediaPlaceholderProps = ComponentPropsWithoutRef<"div"> & {
    icon?: ReactNode;
    label?: ReactNode;
    detail?: ReactNode;
    /** Work is running: the icon disc breathes (still under reduced motion). */
    busy?: boolean;
    /** Fill colour (a token var), e.g. a modality tint; replaces the dashed outline. */
    tint?: string;
};

export const MediaPlaceholder: FC<MediaPlaceholderProps> = ({
    icon,
    label,
    detail,
    busy = false,
    tint,
    children,
    className,
    style,
    ...rest
}) => (
    <div
        {...rest}
        aria-busy={busy || undefined}
        style={
            tint
                ? ({
                      ...style,
                      "--polli-placeholder-tint": tint,
                  } as CSSProperties)
                : style
        }
        className={cn(
            "polli:flex polli:aspect-video polli:min-h-40 polli:flex-col polli:items-center polli:justify-center polli:gap-3 polli:rounded-lg polli:border polli:border-dashed polli:border-theme-border polli:bg-theme-bg-pale polli:p-6 polli:text-center",
            tint &&
                "polli:rounded-card polli:border-transparent polli:bg-(--polli-placeholder-tint)",
            className,
        )}
    >
        {icon && (
            <div
                className={cn(
                    "polli:flex polli:h-10 polli:w-10 polli:items-center polli:justify-center polli:rounded-full polli:bg-theme-bg-active polli:text-theme-text-base",
                    tint && "polli:h-14 polli:w-14 polli:bg-surface-opaque/70",
                    busy &&
                        "polli:animate-pulse polli:motion-reduce:animate-none",
                )}
            >
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
    </div>
);
