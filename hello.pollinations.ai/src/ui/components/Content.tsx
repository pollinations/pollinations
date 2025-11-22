import { ElementType, ComponentPropsWithoutRef } from "react";
import { TextGenerator } from "./TextGenerator";

interface ContentValue {
    exact: boolean;
    content: string;
}

interface ContentProps<T extends ElementType> {
    value: string | ContentValue;
    className?: string;
    as?: T;
    [key: string]: any;
}

export function Content<T extends ElementType = "span">({
    value,
    className = "",
    as,
    ...props
}: ContentProps<T> & Omit<ComponentPropsWithoutRef<T>, keyof ContentProps<T>>) {
    const Component = as || "span";
    // Handle string input (legacy support)
    if (typeof value === "string") {
        return (
            <Component className={className} {...props}>
                {value}
            </Component>
        );
    }

    // Handle object with exact flag
    if (typeof value === "object" && value !== null) {
        const { exact, content } = value;

        if (exact) {
            // Use content as-is
            return (
                <Component className={className} {...props}>
                    {content}
                </Component>
            );
        } else {
            // Generate via LLM
            return (
                <TextGenerator
                    content={undefined}
                    prompt={content}
                    className={className}
                    as={Component}
                    {...props}
                />
            );
        }
    }

    return null;
}
