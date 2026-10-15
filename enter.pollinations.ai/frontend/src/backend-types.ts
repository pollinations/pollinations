// Type-only boundary to the Worker backend. Keep backend source imports here so
// frontend/backend coupling is explicit and easy to replace later with bundled
// generated declarations. Naive tsc declaration emit is not enough today
// because route types include hono-openapi declarations.
export type { FrontendApiRoutes as ApiRoutes } from "../../src/frontend-api.ts";
export type { QuestStandingsResponse } from "../../src/routes/quest-leaderboard.ts";
export type { QuestCatalogResponse } from "../../src/routes/quests.ts";
export type { QuestCheckResult } from "../../src/services/quest-checker.ts";
export type {
    AutoTopUpIssue,
    BillingOverview,
    BillingTaxId,
    SavedPaymentMethod,
} from "../../src/utils/stripe-billing/types.ts";
