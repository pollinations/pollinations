/**
 * Simple user statistics tracker for nano-banana model
 * Tracks requests and violations per user with disk persistence
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import debug from "debug";

const log = debug("pollinations:user-stats");

interface UserStats {
  requests: number;
  violations: number;
}

interface UserStatsData {
  [username: string]: UserStats;
}

class UserStatsTracker {
  private stats: UserStatsData = {};
  private filePath: string;
  private saveTimeout: NodeJS.Timeout | null = null;

  constructor() {
    this.filePath = path.join(process.cwd(), "temp", "user_stats.json");
    this.loadStats();
  }

  /**
   * Load stats from disk on startup
   */
  private async loadStats(): Promise<void> {
    try {
      await fs.mkdir(path.dirname(this.filePath), { recursive: true });
      const data = await fs.readFile(this.filePath, "utf8");
      this.stats = JSON.parse(data);
      log(`Loaded stats for ${Object.keys(this.stats).length} users`);
    } catch (error) {
      // File doesn't exist or is invalid, start with empty stats
      this.stats = {};
      log("Starting with empty user stats");
    }
  }

  /**
   * Save stats to disk (debounced to avoid excessive writes)
   */
  private async saveStats(): Promise<void> {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    
    this.saveTimeout = setTimeout(async () => {
      try {
        await fs.writeFile(this.filePath, JSON.stringify(this.stats, null, 2));
        log(`Saved stats for ${Object.keys(this.stats).length} users`);
      } catch (error) {
        log("Error saving user stats:", error);
      }
    }, 1000); // Save after 1 second of inactivity
  }

  /**
   * Record a request for a user
   */
  recordRequest(username: string): void {
    if (!username || username === 'anonymous') return;
    
    if (!this.stats[username]) {
      this.stats[username] = { requests: 0, violations: 0 };
    }
    
    this.stats[username].requests++;
    this.saveStats();
  }

  /**
   * Record a violation for a user
   */
  recordViolation(username: string): void {
    if (!username || username === 'anonymous') return;
    
    if (!this.stats[username]) {
      this.stats[username] = { requests: 0, violations: 0 };
    }
    
    this.stats[username].violations++;
    this.saveStats();
  }

  /**
   * Get stats for a user
   */
  getUserStats(username: string): UserStats {
    return this.stats[username] || { requests: 0, violations: 0 };
  }

  /**
   * Get all user stats
   */
  getAllStats(): UserStatsData {
    return { ...this.stats };
  }

  /**
   * Get top users by violations (for monitoring)
   */
  getTopViolators(limit: number = 10): Array<{username: string, stats: UserStats}> {
    return Object.entries(this.stats)
      .map(([username, stats]) => ({ username, stats }))
      .sort((a, b) => b.stats.violations - a.stats.violations)
      .slice(0, limit);
  }

  /**
   * Get violation rate for a user
   */
  getViolationRate(username: string): number {
    const stats = this.getUserStats(username);
    return stats.requests > 0 ? stats.violations / stats.requests : 0;
  }
}

// Singleton instance
export const userStatsTracker = new UserStatsTracker();
