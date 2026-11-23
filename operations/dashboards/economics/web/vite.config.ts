import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { readVendorJournals } from "./worker/planning";

export default defineConfig(async ({ mode }) => {
    const publicTests = mode === "public";
    // Tests use one source snapshot per run, never a second checked-in catalog.
    let vendorDetails: unknown;
    if (process.env.VITEST && !publicTests) {
        vendorDetails = process.env.ECONOMICS_VENDOR_DETAILS_FILE
            ? JSON.parse(
                  await readFile(
                      process.env.ECONOMICS_VENDOR_DETAILS_FILE,
                      "utf8",
                  ),
              )
            : (
                  await readVendorJournals(
                      parseEnv(
                          await readFile(
                              new URL("./.dev.vars", import.meta.url),
                              "utf8",
                          ),
                      ),
                  )
              ).vendorDetails;
    }
    return {
        ...(process.env.VITEST
            ? {
                  test: publicTests
                      ? {
                            setupFiles: ["./src/setupPublicTests.ts"],
                            // Public CI keeps the existing credential-free selection.
                            // Other tests require the private vendor source snapshot.
                            include: [
                                "src/components/DataTable.test.ts",
                                "src/components/EconomicsGauge.test.ts",
                                "src/components/ErrorBoundary.test.ts",
                                "src/components/Evidence.test.tsx",
                                "src/components/Filters.test.tsx",
                                "src/components/Provenance.test.tsx",
                                "src/components/ReconcilePro.test.tsx",
                                "src/fixtures.test.ts",
                                "scripts/check-tinybird-contract.test.mjs",
                                "worker/planning.test.ts",
                                "src/lib/allocationIntegrity.test.ts",
                                "src/lib/creditProjectionHorizon.test.ts",
                                "src/lib/dataConfidence.test.ts",
                                "src/lib/dataConfidenceCoverage.test.ts",
                                "src/lib/documents.test.ts",
                                "src/lib/format.test.ts",
                                "src/lib/fx.test.ts",
                                "src/lib/ledgerAudit.test.ts",
                                "src/lib/modelIdentity.test.ts",
                                "src/lib/modelReconcile.test.ts",
                                "src/lib/months.test.ts",
                                "src/lib/planning.test.ts",
                                "src/lib/productMix.test.ts",
                                "src/lib/providerCalendarCoverage.test.ts",
                                "src/lib/providerRegistry.public.test.ts",
                                "src/lib/revenueShareEconomics.test.ts",
                                "src/lib/runwayForecastTiming.test.ts",
                                "src/lib/sales.test.ts",
                                "src/lib/tb.test.ts",
                                "src/lib/tone.test.ts",
                                "src/lib/vendorJournals.test.ts",
                                "src/views/CreditsTab.test.ts",
                                "src/views/GpuTab.test.ts",
                                "src/views/ResultPresentation.test.ts",
                                "src/views/RevenueShareTab.test.tsx",
                                "src/views/RunwayTab.test.ts",
                                "src/views/RunwayUnknownCash.test.ts",
                                "src/views/UnitEconomicsTab.test.ts",
                                "src/views/VendorJournal.test.ts",
                            ],
                        }
                      : {
                            setupFiles: ["./src/setupTests.ts"],
                            env: {
                                ECONOMICS_VENDOR_DETAILS:
                                    JSON.stringify(vendorDetails),
                            },
                        },
              }
            : {}),
        plugins: [
            react(),
            tailwindcss(),
            ...(process.env.VITEST ? [] : [cloudflare()]),
        ],
        environments: {
            client: {
                build: {
                    rollupOptions: {
                        output: {
                            manualChunks(id: string) {
                                if (id.endsWith("/provider-registry.json"))
                                    return "provider-registry";
                            },
                            chunkFileNames(chunk: { name: string }) {
                                return chunk.name === "provider-registry"
                                    ? "private/[name]-[hash].js"
                                    : "assets/[name]-[hash].js";
                            },
                        },
                    },
                },
            },
        },
        server: { host: "localhost", port: 4180, strictPort: true },
        resolve: {
            dedupe: ["react", "react-dom"],
        },
    };
});
