import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            "@shared": fileURLToPath(new URL("../shared", import.meta.url)),
        },
    },
    test: {
        setupFiles: ["operations/economics/web/src/setupPublicTests.ts"],
        include: [
            "shared/providers.test.ts",
            "apps/agent-json.test.ts",
            "apps/catgpt/ai.test.js",
            "apps/chat/src/**/*.test.{js,jsx}",
            // Pure calculations and presentation use artificial vendor definitions.
            // Account/category contract tests remain in the private integration suite.
            "operations/economics/web/src/components/DataTable.test.ts",
            "operations/economics/web/src/components/EconomicsGauge.test.ts",
            "operations/economics/web/src/components/ErrorBoundary.test.ts",
            "operations/economics/web/src/components/Evidence.test.tsx",
            "operations/economics/web/src/components/Filters.test.tsx",
            "operations/economics/web/src/components/Provenance.test.tsx",
            "operations/economics/web/src/components/ReconcilePro.test.tsx",
            "operations/economics/web/src/fixtures.test.ts",
            "operations/economics/web/scripts/check-tinybird-contract.test.mjs",
            "operations/economics/web/worker/planning.test.ts",
            "operations/economics/web/src/components/SourceRecovery.test.tsx",
            "operations/economics/web/src/lib/allocationIntegrity.test.ts",
            "operations/economics/web/src/lib/creditProjectionHorizon.test.ts",
            "operations/economics/web/src/lib/dataConfidence.test.ts",
            "operations/economics/web/src/lib/dataConfidenceCoverage.test.ts",
            "operations/economics/web/src/lib/documents.test.ts",
            "operations/economics/web/src/lib/format.test.ts",
            "operations/economics/web/src/lib/fx.test.ts",
            "operations/economics/web/src/lib/ledgerAudit.test.ts",
            "operations/economics/web/src/lib/modelIdentity.test.ts",
            "operations/economics/web/src/lib/modelReconcile.test.ts",
            "operations/economics/web/src/lib/months.test.ts",
            "operations/economics/web/src/lib/planning.test.ts",
            "operations/economics/web/src/lib/productMix.test.ts",
            "operations/economics/web/src/lib/providerCalendarCoverage.test.ts",
            "operations/economics/web/src/lib/providerRegistry.public.test.ts",
            "operations/economics/web/src/lib/revenueShareEconomics.test.ts",
            "operations/economics/web/src/lib/runwayForecastTiming.test.ts",
            "operations/economics/web/src/lib/sales.test.ts",
            "operations/economics/web/src/lib/tb.test.ts",
            "operations/economics/web/src/lib/tone.test.ts",
            "operations/economics/web/src/lib/vendorJournals.test.ts",
            "operations/economics/web/src/views/CreditsTab.test.ts",
            "operations/economics/web/src/views/GpuTab.test.ts",
            "operations/economics/web/src/views/ResultPresentation.test.ts",
            "operations/economics/web/src/views/RevenueShareTab.test.tsx",
            "operations/economics/web/src/views/RunwayTab.test.ts",
            "operations/economics/web/src/views/RunwayUnknownCash.test.ts",
            "operations/economics/web/src/views/UnitEconomicsTab.test.ts",
            "operations/economics/web/src/views/VendorJournal.test.ts",
        ],
    },
});
