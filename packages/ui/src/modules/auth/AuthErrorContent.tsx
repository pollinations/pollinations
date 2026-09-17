import type { ReactNode } from "react";
import { Heading } from "../../primitives/Typography.tsx";
import { ErrorBanner } from "./AuthModal.tsx";

export function AuthErrorContent({
    title,
    titleId,
    message,
    children,
}: {
    title: string;
    titleId: string;
    message: string;
    children?: ReactNode;
}) {
    return (
        <>
            <Heading as="h1" size="section" id={titleId}>
                {title}
            </Heading>
            <ErrorBanner>{message}</ErrorBanner>
            {children}
        </>
    );
}
