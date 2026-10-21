import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { readVendorJournals } from "./worker/planning";

export default defineConfig(async () => {
    // Tests use one source snapshot per run, never a second checked-in catalog.
    let vendorDetails: unknown;
    if (process.env.VITEST) {
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
                  test: {
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
