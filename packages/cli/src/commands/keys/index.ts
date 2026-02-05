import { Command } from 'commander';
import { listKeys } from './list.js';
import { createKey } from './create.js';
import { revokeKey } from './revoke.js';

export function keysCommands(program: Command) {
  const keys = program
    .command('keys')
    .description('Manage API keys');

  keys
    .command('list')
    .description('List all API keys')
    .action(listKeys);

  keys
    .command('create')
    .description('Create a new API key')
    .option('-n, --name <name>', 'Key name', 'CLI Key')
    .option('-t, --type <type>', 'Key type (publishable or secret)', 'secret')
    .option('-e, --expiry <days>', 'Expiry in days')
    .option('-b, --budget <pollen>', 'Pollen budget')
    .action(createKey);

  keys
    .command('revoke <keyId>')
    .description('Revoke an API key')
    .action(revokeKey);
}