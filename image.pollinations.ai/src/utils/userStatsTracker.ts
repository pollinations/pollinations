/**
 * Simple functional user statistics tracker
 * Tracks requests and violations per user with disk persistence
 */

import fs from "node:fs";
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
function ensureDir() {
  const dir = path.dirname(STATS_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// Load stats from disk
function loadStats() {
  try {
    ensureDir();
    if (fs.existsSync(STATS_FILE)) {
      const data = fs.readFileSync(STATS_FILE, "utf8");
      stats = JSON.parse(data);
      log(`Loaded stats for ${Object.keys(stats).length} users`);
    } else {
      stats = {};
      log("Starting with empty user stats");
    }
  } catch (error) {
    stats = {};
    log("Error loading stats:", error);
  }
}

// Save stats to disk (debounced)
function saveStats() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      ensureDir();
      fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2));
      log(`Saved stats for ${Object.keys(stats).length} users`);
    } catch (error) {
      log("Error saving user stats:", error);
    }
  }, 100);
}

// Initialize on import
loadStats();

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
};
