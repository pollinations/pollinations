#!/usr/bin/env node

/**
 * Rate Limit Statistics Checker
 *
 * Simple script to analyze rate limit errors from the log file.
 * Usage: node scripts/check-rate-limits.js [hours]
 *
 * Examples:
 * node scripts/check-rate-limits.js     # Last 1 hour
 * node scripts/check-rate-limits.js 24  # Last 24 hours
 */

// import { getRateLimitStats } from "../logging/rateLimitLogger.js";
// TODO: Fix this import - logging directory doesn't exist
const getRateLimitStats = (hours: number) => ({ error: "Rate limit logging not configured" });

const hours = parseInt(process.argv[2]) || 1;

console.log(`\n🔍 Rate Limit Analysis - Last ${hours} hour(s)\n`);

const stats: any = getRateLimitStats(hours);

if (stats.error) {
    console.log(`❌ Error: ${stats.error}`);
    process.exit(1);
}

console.log(`📊 Total Rate Limit Errors: ${stats.total_errors}`);
console.log(`📈 Average Queue Utilization: ${stats.avg_queue_utilization}%\n`);

if (stats.total_errors === 0) {
    console.log("✅ No rate limit errors in the specified time period!");
    process.exit(0);
}

console.log("🎯 Errors by Tier:");
Object.entries(stats.by_tier)
    .sort(([, a], [, b]) => (b as number) - (a as number))
    .forEach(([tier, count]) => {
        console.log(`  ${tier}: ${count} errors`);
    });

console.log("\n🤖 Errors by Model:");
Object.entries(stats.by_model)
    .sort(([, a], [, b]) => (b as number) - (a as number))
    .slice(0, 10) // Top 10 models
    .forEach(([model, count]) => {
        console.log(`  ${model}: ${count} errors`);
    });

console.log("\n👥 Top Users with Errors:");
Object.entries(stats.by_user)
    .sort(([, a], [, b]) => (b as number) - (a as number))
    .slice(0, 10) // Top 10 users
    .forEach(([user, count]) => {
        console.log(`  ${user}: ${count} errors`);
    });

console.log(`\n📁 Log file: logs/rate-limit-errors.jsonl`);
console.log(
    `💡 For detailed analysis, examine individual log entries in the file.`,
);
