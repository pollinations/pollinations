import { createFileRoute } from "@tanstack/react-router";
import { DocumentPage } from "../components/DocumentPage.tsx";
import { TERMS_PAGE } from "../copy/content/legal.ts";
import { loadMarkdown } from "../lib/loadMarkdown.ts";

export const Route = createFileRoute("/terms")({
    loader: () => loadMarkdown("/legal/TERMS_OF_SERVICE.md"),
    head: () => ({
        meta: [
            { title: "Terms | pollinations.ai" },
            { name: "description", content: TERMS_PAGE.pageDescription },
        ],
    }),
    component: () => (
        <DocumentPage theme="green" markdown={Route.useLoaderData()} />
    ),
});
