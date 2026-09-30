import { createFileRoute } from "@tanstack/react-router";
import RefundsPage from "../ui/pages/RefundsPage";

export const Route = createFileRoute("/refunds")({
    component: RefundsPage,
});
