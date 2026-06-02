import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "../components/LegalPage.tsx";
import { TERMS_PAGE } from "../copy/content/legal.ts";

export const Route = createFileRoute("/terms")({
    loader: () => fetch("/legal/TERMS_OF_SERVICE.md").then((r) => r.text()),
    head: () => ({
        meta: [
            { title: "Terms | pollinations.ai" },
            { name: "description", content: TERMS_PAGE.pageDescription },
        ],
    }),
    component: () => <LegalPage markdown={Route.useLoaderData()} />,
});
