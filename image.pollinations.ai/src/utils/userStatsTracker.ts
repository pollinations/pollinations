/**
 * Simple functional user statistics tracker
 * Tracks requests and violations per user with disk persistence
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import debug from "debug";

const log = debug("pollinations:user-stats");
const STATS_FILE = path.join(process.cwd(), "temp", "user_stats.json");

interface UserStats {
  requests: number;
  violations: number;
}

type UserStatsData = Record<string, UserStats>;

let stats: UserStatsData = {};
let saveTimer: NodeJS.Timeout | null = null;

// Ensure directory exists
async function ensureDir() {
  const dir = path.dirname(STATS_FILE);
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch (error) {
    log("Error creating directory:", error);
  }
}

// Load stats from disk
async function loadStats() {
  try {
    await ensureDir();
    const data = await fs.readFile(STATS_FILE, "utf8");
    stats = JSON.parse(data);
    log(`Loaded stats for ${Object.keys(stats).length} users`);
  } catch (error) {
    stats = {};
    log("Starting with empty user stats");
  }
}

// Save stats to disk (debounced)
function saveStats() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      await ensureDir();
      await fs.writeFile(STATS_FILE, JSON.stringify(stats, null, 2));
      log(`Saved stats for ${Object.keys(stats).length} users`);
    } catch (error) {
      log("Error saving user stats:", error);
    }
  }, 100);
}

// Initialize on import
loadStats().catch(err => log("Failed to initialize stats:", err));

export const userStatsTracker = {
  recordRequest(username: string | null | undefined) {
    if (!username || username === 'anonymous') return;
    if (!stats[username]) stats[username] = { requests: 0, violations: 0 };
    stats[username].requests++;
    saveStats();
  },

  recordViolation(username: string | null | undefined) {
    if (!username || username === 'anonymous') return;
    if (!stats[username]) stats[username] = { requests: 0, violations: 0 };
    stats[username].violations++;
    saveStats();
  },

  getUserStats(username: string): UserStats {
    return stats[username] || { requests: 0, violations: 0 };
  },

  getAllStats(): UserStatsData {
    return { ...stats };
  },

  getTopViolators(limit: number = 10) {
    return Object.entries(stats)
      .map(([username, s]) => ({ username, stats: s }))
      .sort((a, b) => b.stats.violations - a.stats.violations)
      .slice(0, limit);
  },

  getViolationRate(username: string): number {
    const s = userStatsTracker.getUserStats(username);
    return s.requests > 0 ? s.violations / s.requests : 0;
  },

  // Async methods for explicit async operations
  async flushStats() {
    if (saveTimer) clearTimeout(saveTimer);
    try {
      await ensureDir();
      await fs.writeFile(STATS_FILE, JSON.stringify(stats, null, 2));
      log(`Flushed stats for ${Object.keys(stats).length} users`);
    } catch (error) {
      log("Error flushing stats:", error);
    }
  },

  async reloadStats() {
    await loadStats();
  },
};
