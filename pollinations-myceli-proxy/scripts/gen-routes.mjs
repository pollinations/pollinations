// Generate wrangler.generated.toml with app routes from apps.json plus explicit
// ops routes. apps.json remains the source of truth for community app domains.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const MARKER =
    "  # GENERATED-PROXY-ROUTES (apps + ops; injected by scripts/gen-routes.mjs)";
const OPS_SUBDOMAINS = ["economics", "kpi"];

const apps = JSON.parse(
    readFileSync(join(here, "../../apps/apps.json"), "utf8"),
);
const subs = Object.entries(apps)
    .filter(([key]) => key !== "_defaults")
    .map(([key, cfg]) => cfg.subdomain || key)
    .sort();

const generatedRoutes = [...subs, ...OPS_SUBDOMAINS]
    .sort()
    .map(
        (sub) =>
            `  { pattern = "${sub}.pollinations.ai", custom_domain = true },`,
    )
    .join("\n");

const base = readFileSync(join(here, "../wrangler.toml"), "utf8");
if (!base.includes(MARKER)) {
    throw new Error("GENERATED-PROXY-ROUTES marker not found in wrangler.toml");
}

writeFileSync(
    join(here, "../wrangler.generated.toml"),
    base.replace(MARKER, generatedRoutes),
);

console.log(
    `Generated ${subs.length} app routes + ${OPS_SUBDOMAINS.length} ops routes -> wrangler.generated.toml`,
);
