import { performance } from 'perf_hooks';

class Profiler {
  constructor() {
    this.metrics = new Map();
    this.lastDump = Date.now();
    this.dumpInterval = 5 * 60 * 1000; // 5 minutes
  }

  start(category, label) {
    const key = `${category}:${label}`;
    if (!this.metrics.has(key)) {
      this.metrics.set(key, {
        count: 0,
        totalTime: 0,
        min: Infinity,
        max: -Infinity,
        timestamps: []
      });
    }
    return performance.now();
  }

  end(category, label, startTime) {
    const duration = performance.now() - startTime;
    const key = `${category}:${label}`;
    const metric = this.metrics.get(key);
    
    metric.count++;
    metric.totalTime += duration;
    metric.min = Math.min(metric.min, duration);
    metric.max = Math.max(metric.max, duration);
    metric.timestamps.push({ time: Date.now(), duration });

    // Keep only last 1000 timestamps to manage memory
    if (metric.timestamps.length > 1000) {
      metric.timestamps = metric.timestamps.slice(-1000);
    }

    this.maybeLogMetrics();
  }

  maybeLogMetrics() {
    const now = Date.now();
    if (now - this.lastDump >= this.dumpInterval) {
      this.dumpMetrics();
      this.lastDump = now;
    }
  }

  dumpMetrics() {
    const summary = {};
    for (const [key, data] of this.metrics.entries()) {
      const [category, label] = key.split(':');
      if (!summary[category]) {
        summary[category] = {};
      }

      // Calculate p95
      const sortedDurations = data.timestamps
        .map(t => t.duration)
        .sort((a, b) => a - b);
      const p95idx = Math.floor(sortedDurations.length * 0.95);
      const p95 = sortedDurations[p95idx] || 0;

      summary[category][label] = {
        avg: data.totalTime / data.count,
        count: data.count,
        min: data.min,
        max: data.max,
        p95,
        requestsPerMinute: (data.timestamps.length * 60000) / 
          (Date.now() - data.timestamps[0]?.time || 60000)
      };
    }

    // Log memory usage
    const memUsage = process.memoryUsage();
    summary.memory = {
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
      rss: Math.round(memUsage.rss / 1024 / 1024),
      external: Math.round(memUsage.external / 1024 / 1024)
    };

    console.log('[PROFILING_METRICS]', JSON.stringify(summary, null, 2));
  }
}

export const profiler = new Profiler();
