import { stdin, stdout } from "node:process";
import readline from "node:readline/promises";
import { CATEGORIES } from "./categories.mjs";

/**
 * Interactively resolve an unknown vendor.
 * Returns { canonical, category, forecast } suitable for writing into vendors.json.
 */
export async function promptNewVendor(rawName) {
    const rl = readline.createInterface({ input: stdin, output: stdout });
    try {
        console.log(`\nNew vendor: "${rawName}"`);
        const canonical =
            (await rl.question(`  Canonical name [${rawName}]: `)) || rawName;
        let category = await rl.question(
            `  Category (${CATEGORIES.join(", ")}) [Other]: `,
        );
        category = category || "Other";
        if (!CATEGORIES.includes(category)) {
            console.log(
                `  ⚠ unknown category "${category}" — will fall back to Other`,
            );
            category = "Other";
        }
        let forecast = await rl.question(
            "  Forecast rule (number | avg3 | last | none | live) [avg3]: ",
        );
        forecast = forecast || "avg3";
        if (
            forecast !== "avg3" &&
            forecast !== "last" &&
            forecast !== "none" &&
            forecast !== "live"
        ) {
            const n = Number(forecast);
            if (!Number.isFinite(n)) {
                console.log(
                    `  ⚠ invalid forecast "${forecast}" — falling back to avg3`,
                );
                forecast = "avg3";
            } else {
                forecast = n;
            }
        }
        return { canonical, category, forecast };
    } finally {
        rl.close();
    }
}
