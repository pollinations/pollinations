#!/usr/bin/env tsx

import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";

interface BillingEvent {
    timestamp?: string;
    "@timestamp"?: string;
    message?: string;
    properties?: {
        totalPrice?: number;
        totalCost?: number;
        isBilledUsage?: boolean;
        model?: string;
        modelRequested?: string;
        modelUsed?: string;
        userId?: string;
        apiKeyId?: string;
        balances?: Record<string, number>;
        selectedMeterSlug?: string;
        status?: number;
        responseStatus?: number;
    };
}

function analyzeBillingLogs(logDir: string) {
    console.log(`\n=== Analyzing billing logs from ${logDir} ===\n`);

    // Load billing-specific logs
    const billingLogsPath = join(logDir, "billing-logs.jsonl");
    if (!existsSync(billingLogsPath)) {
        console.error(`❌ Billing logs not found at ${billingLogsPath}`);
        return;
    }

    const billingLogs = readFileSync(billingLogsPath, "utf-8")
        .split("\n")
        .filter(line => line.trim())
        .map(line => {
            try {
                return JSON.parse(line) as BillingEvent;
            } catch (e) {
                return null;
            }
        })
        .filter(Boolean) as BillingEvent[];

    console.log(`📊 Loaded ${billingLogs.length} billing events\n`);

    // Analyze billing events
    const stats = {
        totalEvents: billingLogs.length,
        billedEvents: 0,
        unbilledEvents: 0,
        totalPrice: 0,
        totalCost: 0,
        byModel: {} as Record<string, { count: number; price: number; cost: number }>,
        byUser: {} as Record<string, { count: number; price: number; cost: number }>,
        byApiKey: {} as Record<string, { count: number; price: number; cost: number }>,
        balanceDecrements: [] as any[],
        errors: [] as any[],
    };

    for (const event of billingLogs) {
        const props = event.properties || {};

        // Count billed vs unbilled
        if (props.isBilledUsage === true) {
            stats.billedEvents++;

            // Sum up totals
            if (props.totalPrice) stats.totalPrice += props.totalPrice;
            if (props.totalCost) stats.totalCost += props.totalCost;

            // Group by model
            const model = props.modelRequested || props.modelUsed || props.model || "unknown";
            if (!stats.byModel[model]) {
                stats.byModel[model] = { count: 0, price: 0, cost: 0 };
            }
            stats.byModel[model].count++;
            stats.byModel[model].price += props.totalPrice || 0;
            stats.byModel[model].cost += props.totalCost || 0;

            // Group by user
            if (props.userId) {
                if (!stats.byUser[props.userId]) {
                    stats.byUser[props.userId] = { count: 0, price: 0, cost: 0 };
                }
                stats.byUser[props.userId].count++;
                stats.byUser[props.userId].price += props.totalPrice || 0;
                stats.byUser[props.userId].cost += props.totalCost || 0;
            }

            // Group by API key
            if (props.apiKeyId) {
                if (!stats.byApiKey[props.apiKeyId]) {
                    stats.byApiKey[props.apiKeyId] = { count: 0, price: 0, cost: 0 };
                }
                stats.byApiKey[props.apiKeyId].count++;
                stats.byApiKey[props.apiKeyId].price += props.totalPrice || 0;
                stats.byApiKey[props.apiKeyId].cost += props.totalCost || 0;
            }
        } else if (props.isBilledUsage === false) {
            stats.unbilledEvents++;
        }

        // Track balance decrements
        if (event.message?.includes("Decrement")) {
            stats.balanceDecrements.push({
                timestamp: event.timestamp || event["@timestamp"],
                message: event.message,
                properties: props,
            });
        }

        // Track errors
        if (props.status && props.status >= 400) {
            stats.errors.push({
                timestamp: event.timestamp || event["@timestamp"],
                status: props.status || props.responseStatus,
                model: props.modelRequested || props.model,
                message: event.message,
            });
        }
    }

    // Display results
    console.log("📈 BILLING SUMMARY");
    console.log("==================");
    console.log(`Total events: ${stats.totalEvents}`);
    console.log(`Billed events: ${stats.billedEvents}`);
    console.log(`Unbilled events: ${stats.unbilledEvents}`);
    console.log(`Total price (what users pay): $${stats.totalPrice.toFixed(4)}`);
    console.log(`Total cost (what we pay): $${stats.totalCost.toFixed(4)}`);
    console.log(`Markup: ${stats.totalPrice > 0 ? ((stats.totalPrice / stats.totalCost - 1) * 100).toFixed(1) : 0}%`);
    console.log();

    console.log("📊 BY MODEL");
    console.log("============");
    const modelsSorted = Object.entries(stats.byModel)
        .sort((a, b) => b[1].price - a[1].price)
        .slice(0, 10);

    for (const [model, data] of modelsSorted) {
        const markup = data.cost > 0 ? ((data.price / data.cost - 1) * 100).toFixed(1) : "N/A";
        console.log(`${model}:`);
        console.log(`  Requests: ${data.count}`);
        console.log(`  Revenue: $${data.price.toFixed(4)}`);
        console.log(`  Cost: $${data.cost.toFixed(4)}`);
        console.log(`  Markup: ${markup}%`);
    }
    console.log();

    console.log("💰 BALANCE DECREMENTS");
    console.log("=====================");
    console.log(`Found ${stats.balanceDecrements.length} balance decrement events`);
    for (const dec of stats.balanceDecrements.slice(0, 5)) {
        console.log(`- ${dec.timestamp}: ${dec.message}`);
    }
    console.log();

    console.log("❌ ERRORS");
    console.log("==========");
    const errorsByStatus = stats.errors.reduce((acc, err) => {
        const status = err.status || "unknown";
        acc[status] = (acc[status] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);

    for (const [status, count] of Object.entries(errorsByStatus)) {
        console.log(`HTTP ${status}: ${count} errors`);
    }
    console.log();

    // Load and compare with D1 data
    const d1Path = join(logDir, "d1-summary.txt");
    if (existsSync(d1Path)) {
        console.log("🗄️  D1 DATABASE COMPARISON");
        console.log("==========================");
        const d1Data = readFileSync(d1Path, "utf-8");
        console.log(d1Data.substring(0, 500));
        console.log();
    }

    // Load and compare with Tinybird data
    const tinybirdPath = join(logDir, "tinybird-model-health.json");
    if (existsSync(tinybirdPath)) {
        console.log("🐦 TINYBIRD COMPARISON");
        console.log("======================");
        try {
            const tinybirdData = JSON.parse(readFileSync(tinybirdPath, "utf-8"));
            if (tinybirdData.data && Array.isArray(tinybirdData.data)) {
                const recentData = tinybirdData.data.slice(0, 5);
                for (const item of recentData) {
                    console.log(`Model: ${item.model}, Requests: ${item.requests}, Success: ${item.success_rate}%`);
                }
            }
        } catch (e) {
            console.log("Failed to parse Tinybird data");
        }
        console.log();
    }

    // Check for discrepancies
    console.log("⚠️  POTENTIAL DISCREPANCIES");
    console.log("===========================");

    // Check if we have events with price but no cost
    const eventsWithPriceNoCost = billingLogs.filter(e =>
        e.properties?.totalPrice && e.properties.totalPrice > 0 &&
        (!e.properties?.totalCost || e.properties.totalCost === 0)
    );

    if (eventsWithPriceNoCost.length > 0) {
        console.log(`⚠️  Found ${eventsWithPriceNoCost.length} events with price but no cost!`);
        for (const event of eventsWithPriceNoCost.slice(0, 3)) {
            console.log(`  - Model: ${event.properties?.modelRequested}, Price: $${event.properties?.totalPrice}`);
        }
    }

    // Check for events that should be billed but aren't
    const unbilledWithSuccess = billingLogs.filter(e =>
        e.properties?.isBilledUsage === false &&
        e.properties?.responseStatus === 200
    );

    if (unbilledWithSuccess.length > 0) {
        console.log(`⚠️  Found ${unbilledWithSuccess.length} successful requests marked as unbilled`);
    }

    // Check balance tracking
    const eventsWithBalances = billingLogs.filter(e => e.properties?.balances);
    console.log(`\n📊 Balance tracking: ${eventsWithBalances.length} events have balance data`);

    if (eventsWithBalances.length > 0) {
        const sample = eventsWithBalances[0];
        console.log("Sample balance data:", JSON.stringify(sample.properties?.balances, null, 2));
    }
}

// Main execution
const logDir = process.argv[2];
if (!logDir) {
    console.error("Usage: npx tsx analyze-billing-logs.ts <log-directory>");
    process.exit(1);
}

if (!existsSync(logDir)) {
    console.error(`Directory not found: ${logDir}`);
    process.exit(1);
}

analyzeBillingLogs(logDir);