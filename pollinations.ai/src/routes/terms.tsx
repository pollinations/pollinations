import { createFileRoute } from "@tanstack/react-router";
import TermsPage from "../ui/pages/TermsPage";

export const Route = createFileRoute("/terms")({
    component: TermsPage,
});
