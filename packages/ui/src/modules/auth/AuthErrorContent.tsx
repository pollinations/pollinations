import type { ReactNode } from "react";
import { useId } from "react";
import { Heading, Text } from "../../primitives/Typography.tsx";
import { ErrorBanner } from "./AuthModal.tsx";

/** Error screen body: title, the message in a banner, optional next step. */
export function AuthErrorContent({
    title,
    titleId,
    message,
    hint,
    children,
}: {
    title: string;
    titleId?: string;
    message: ReactNode;
    hint?: ReactNode;
    children?: ReactNode;
}) {
    const generatedId = useId();
    return (
        <>
            <Heading as="h1" size="section" id={titleId ?? generatedId}>
                {title}
            </Heading>
            <ErrorBanner>{message}</ErrorBanner>
            {hint && (
                <Text size="xs" tone="muted">
                    {hint}
                </Text>
            )}
            {children}
        </>
    );
}
