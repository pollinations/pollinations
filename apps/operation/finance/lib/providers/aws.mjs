import { spawn } from "node:child_process";

/**
 * AWS provider — fetches MTD consumption from Cost Explorer via `aws ce`.
 *
 * Returns { mtd_total_usd, mtd_credit_usd, mtd_cash_usd, records, as_of }.
 *
 * Credit semantics:
 *   - `UnblendedCost`      = list price ("total consumed")
 *   - `NetUnblendedCost`   = after credits/discounts ("net cash cost")
 *   - `mtd_credit_usd`     = UnblendedCost - NetUnblendedCost  (what credits absorbed)
 *   - `mtd_cash_usd`       = NetUnblendedCost                   (what hits Wise)
 *
 * See .claude/skills/provider-billing/providers/aws.md for context. Our
 * account is a member under Automat-IT's payer; credit grants at the payer
 * level may not be visible here — if credits aren't decrementing, check with
 * Automat-IT.
 */

function awsCmd(args) {
    return new Promise((resolve, reject) => {
        const child = spawn("aws", args, {
            stdio: ["ignore", "pipe", "pipe"],
        });
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (d) => {
            stdout += d;
        });
        child.stderr.on("data", (d) => {
            stderr += d;
        });
        child.on("error", reject);
        child.on("close", (code) => {
            if (code !== 0) {
                reject(
                    new Error(
                        `aws ${args.join(" ")} failed (${code}): ${stderr}`,
                    ),
                );
                return;
            }
            try {
                resolve(JSON.parse(stdout));
            } catch (e) {
                reject(new Error(`aws returned invalid JSON: ${e.message}`));
            }
        });
    });
}

function lastDayOfMonth(currentMonth) {
    const [y, m] = currentMonth.split("-").map(Number);
    return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/**
 * Fetch MTD usage for a given month. currentMonth is "YYYY-MM".
 * Cost Explorer `End` is exclusive, so we pass today + 1 day to include today.
 */
export async function fetchMtd(currentMonth) {
    const start = `${currentMonth}-01`;
    const today = new Date();
    const isSameMonth =
        `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, "0")}` ===
        currentMonth;
    // End is exclusive; pass tomorrow so today's partial data is included.
    let end;
    if (isSameMonth) {
        const tomorrow = new Date(today);
        tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
        end = `${tomorrow.getUTCFullYear()}-${String(tomorrow.getUTCMonth() + 1).padStart(2, "0")}-${String(tomorrow.getUTCDate()).padStart(2, "0")}`;
    } else {
        // Past month: end = first day of next month
        const [y, m] = currentMonth.split("-").map(Number);
        const next = new Date(Date.UTC(y, m, 1));
        end = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
    }

    const data = await awsCmd([
        "ce",
        "get-cost-and-usage",
        "--time-period",
        `Start=${start},End=${end}`,
        "--granularity",
        "MONTHLY",
        "--metrics",
        "UnblendedCost",
        "NetUnblendedCost",
    ]);

    const results = data.ResultsByTime ?? [];
    const total = results[0]?.Total ?? {};
    const unblended = Number(total.UnblendedCost?.Amount ?? 0);
    const net = Number(total.NetUnblendedCost?.Amount ?? 0);

    const mtd_total_usd = Number(unblended.toFixed(2));
    const mtd_cash_usd = Number(net.toFixed(2));
    const mtd_credit_usd = Number((unblended - net).toFixed(2));

    return {
        mtd_total_usd,
        mtd_credit_usd,
        mtd_cash_usd,
        records: results.length,
        as_of: new Date().toISOString().slice(0, 10),
    };
}
