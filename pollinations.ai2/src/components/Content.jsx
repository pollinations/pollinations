// Content component - handles both exact text and LLM-generated text
// Usage:
//   <Content value="exact text" />
//   <Content value={{exact: true, content: "text"}} />
//   <Content value={{exact: false, content: "prompt for LLM"}} />

import { TextGenerator } from "./TextGenerator";

export function Content({
    value,
    className = "",
    as: Component = "span",
    ...props
}) {
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
