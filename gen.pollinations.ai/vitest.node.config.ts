import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Focused async-job unit tests run under plain node with the same aliases as
// vitest.config.ts, so the workerd pool is not required for these tests.
const genSrc = fileURLToPath(new URL("./src/", import.meta.url));
const root = path.dirname(path.dirname(genSrc));

export default defineConfig({
    resolve: {
        alias: [
            {
                find: /^@shared\/(.*)$/,
                replacement: path.join(root, "shared", "$1"),
            },
            { find: /^@\/(.*)$/, replacement: `${genSrc}$1` },
        ],
    },
    test: {
        environment: "node",
        include: ["test/generation-jobs.test.ts"],
    },
});
