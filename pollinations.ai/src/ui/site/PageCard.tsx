import { cn } from "@pollinations/ui";
import type { ComponentPropsWithoutRef } from "react";

export const pageCardClassName =
    "flex flex-col gap-12 overflow-clip rounded-[28px] bg-theme-bg-pale px-4 py-10 shadow-container sm:gap-18 sm:px-8 sm:py-16 md:px-18";

export function PageCard({
    className,
    ...props
}: ComponentPropsWithoutRef<"section">) {
    return <section className={cn(pageCardClassName, className)} {...props} />;
}
