#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { authCommands } from './commands/auth/index.js';
import { generateCommands } from './commands/generate/index.js';
import { keysCommands } from './commands/keys/index.js';
import { pollenCommands } from './commands/pollen/index.js';
import { configCommands } from './commands/config/index.js';
import { getConfig } from './config/index.js';

const program = new Command();

program
  .name('polli')
  .description('CLI tool for Pollinations platform management')
  .version('0.1.0');

// Add command groups
authCommands(program);
generateCommands(program);
keysCommands(program);
pollenCommands(program);
configCommands(program);

// Global options
program
  .option('--api-url <url>', 'Override API base URL', 'https://enter.pollinations.ai')
  .option('--debug', 'Enable debug output', false);

// Parse arguments
program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}