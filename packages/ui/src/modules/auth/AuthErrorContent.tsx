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
            <div className="polli:pt-3">
                <Heading as="h1" size="section" id={titleId}>
                    {title}
                </Heading>
            </div>
            <ErrorBanner>{message}</ErrorBanner>
            {children}
        </>
    );
}
