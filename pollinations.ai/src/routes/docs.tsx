import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/docs")({
    component: DocsRedirect,
});

function DocsRedirect() {
    useEffect(() => {
        window.location.replace("https://gen.pollinations.ai/docs");
    }, []);

    return null;
}
