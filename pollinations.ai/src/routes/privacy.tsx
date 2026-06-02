import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "../components/LegalPage.tsx";
import { PRIVACY_PAGE } from "../copy/content/legal.ts";
import { loadMarkdown } from "../lib/loadMarkdown.ts";

export const Route = createFileRoute("/privacy")({
    loader: () => loadMarkdown("/legal/PRIVACY_POLICY.md"),
    head: () => ({
        meta: [
            { title: "Privacy | pollinations.ai" },
            { name: "description", content: PRIVACY_PAGE.pageDescription },
        ],
    }),
    component: () => <LegalPage markdown={Route.useLoaderData()} />,
});
