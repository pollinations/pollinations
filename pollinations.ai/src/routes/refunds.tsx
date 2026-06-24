import { createFileRoute } from "@tanstack/react-router";
import { DocumentPage } from "../components/DocumentPage.tsx";
import { REFUNDS_PAGE } from "../copy/content/legal.ts";
import { loadMarkdown } from "../lib/loadMarkdown.ts";

export const Route = createFileRoute("/refunds")({
    loader: () => loadMarkdown("/legal/REFUNDS_AND_CANCELLATIONS.md"),
    head: () => ({
        meta: [
            { title: "Refunds | pollinations.ai" },
            { name: "description", content: REFUNDS_PAGE.pageDescription },
        ],
    }),
    component: () => <DocumentPage markdown={Route.useLoaderData()} />,
});
