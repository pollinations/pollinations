#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import os from 'os';

// Determine the Claude Desktop config file path based on the operating system
const getConfigPath = () => {
  switch (os.platform()) {
    case 'darwin': // macOS
      return path.join(os.homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
    case 'win32': // Windows
      return path.join(os.homedir(), 'AppData', 'Roaming', 'Claude', 'claude_desktop_config.json');
    default: // Linux and others
      return path.join(os.homedir(), '.config', 'Claude', 'claude_desktop_config.json');
  }
};

const configPath = getConfigPath();
console.log(`Claude Desktop config path: ${configPath}`);

// Read existing config or create a new one
let config = {};
try {
  const configData = fs.readFileSync(configPath, 'utf8');
  config = JSON.parse(configData);
  console.log('Existing Claude Desktop config found');
} catch (error) {
  console.log('Creating new Claude Desktop config');
}

// Ensure mcpServers section exists
config.mcpServers = config.mcpServers || {};

// Add or update the pollinations MCP server configuration
config.mcpServers.pollinations = {
  command: 'node',
  args: [path.resolve('pollinations-mcp-server.js')],
  disabled: false,
  alwaysAllow: []
};

// Write the updated config back to the file
const configDir = path.dirname(configPath);
if (!fs.existsSync(configDir)) {
  fs.mkdirSync(configDir, { recursive: true });
  console.log(`Created directory: ${configDir}`);
}

fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
console.log(`Pollinations MCP server installed in Claude Desktop config at ${configPath}`);
console.log('Please restart Claude Desktop to apply the changes');