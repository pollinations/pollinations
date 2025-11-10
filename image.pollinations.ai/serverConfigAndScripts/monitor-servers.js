#!/usr/bin/env node

// Minimal terminal monitor for flux servers - no dependencies needed!
import https from 'https';

// ANSI escape codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  gray: '\x1b[90m',
};

const clear = '\x1b[2J\x1b[H';

function fetchServers() {
  return new Promise((resolve, reject) => {
    https.get('https://image.pollinations.ai/register', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data).filter(s => s.type === 'flux'));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

function bar(value, max, width = 20, full = '█', empty = '░') {
  const filled = Math.min(width, Math.round((value / Math.max(max, 1)) * width));
  return full.repeat(filled) + empty.repeat(width - filled);
}

function render(servers) {
  console.log(clear);
  
  const timestamp = new Date().toLocaleTimeString();
  console.log(`${colors.bright}${colors.cyan}⚡ FLUX${colors.reset} ${colors.dim}${timestamp}${colors.reset}`);
  
  // Sort by queue size (busiest first)
  servers.sort((a, b) => b.queueSize - a.queueSize);
  
  // Calculate dynamic max for queue bars
  const maxQueue = Math.max(...servers.map(s => s.queueSize), 10);
  
  // Header
  console.log(`${colors.dim}Port  │ Queue            │ Reqs  │ RPS  │ Errs${colors.reset}`);
  console.log(`${colors.dim}──────┼──────────────────┼───────┼──────┼─────${colors.reset}`);
  
  servers.forEach((s) => {
    const port = s.url.split(':').pop().padEnd(5);
    const queuePct = (s.queueSize / maxQueue) * 100;
    const queueColor = queuePct > 70 ? colors.red : queuePct > 40 ? colors.yellow : colors.green;
    const errorRate = parseFloat(s.errorRate);
    const errorColor = errorRate > 5 ? colors.red : errorRate > 2 ? colors.yellow : colors.dim;
    
    console.log(
      `${colors.bright}${port}${colors.reset} │ ` +
      `${queueColor}${bar(s.queueSize, maxQueue, 12)}${colors.reset} ${String(s.queueSize).padStart(3)} │ ` +
      `${String(s.totalRequests).padStart(5)} │ ` +
      `${colors.dim}${s.requestsPerSecond.padStart(4)}${colors.reset} │ ` +
      `${errorColor}${String(s.errors).padStart(3)}${colors.reset}`
    );
  });
  
  // Summary stats
  const totalQueue = servers.reduce((sum, s) => sum + s.queueSize, 0);
  const totalReqs = servers.reduce((sum, s) => sum + s.totalRequests, 0);
  const totalErrs = servers.reduce((sum, s) => sum + s.errors, 0);
  const totalRps = servers.reduce((sum, s) => sum + parseFloat(s.requestsPerSecond), 0).toFixed(2);
  
  console.log(`${colors.dim}──────┴──────────────────┴───────┴──────┴─────${colors.reset}`);
  console.log(
    `${colors.bright}${servers.length}${colors.reset} servers │ ` +
    `Q:${colors.cyan}${totalQueue}${colors.reset} │ ` +
    `R:${colors.blue}${totalReqs}${colors.reset} │ ` +
    `${colors.yellow}${totalRps}${colors.reset}rps │ ` +
    `E:${totalErrs > 0 ? colors.red : colors.green}${totalErrs}${colors.reset}`
  );
}

async function monitor() {
  try {
    const servers = await fetchServers();
    render(servers);
  } catch (err) {
    console.error(`${colors.red}Error fetching data:${colors.reset}`, err.message);
  }
}

// Start monitoring
console.log(`${colors.cyan}Starting monitor...${colors.reset}`);
monitor();
setInterval(monitor, 250);
