import chalk from 'chalk';
import { TokenStorage } from '../../utils/token-storage.js';
import { get } from '../../config/index.js';

export async function listKeys() {
  const tokenStorage = new TokenStorage();
  const token = await tokenStorage.retrieve();

  if (!token) {
    console.log(chalk.red('Not authenticated. Please run "polli auth login" first.'));
    process.exit(1);
  }

  try {
    const apiUrl = get('apiUrl');
    const response = await fetch(`${apiUrl}/api/api-keys/list`, {
      headers: {
        'Authorization': `Bearer ${token.accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch keys: ${response.statusText}`);
    }

    const data = await response.json();
    const keys = data.apiKeys || [];

    if (keys.length === 0) {
      console.log(chalk.yellow('No API keys found.'));
      console.log(chalk.gray('Use "polli keys create" to create a new key.'));
      return;
    }

    console.log(chalk.cyan('\nYour API Keys:\n'));

    for (const key of keys) {
      const isPublishable = key.start?.startsWith('pk_');
      const keyType = isPublishable ? chalk.blue('publishable') : chalk.green('secret');
      const status = key.revokedAt ? chalk.red('revoked') : chalk.green('active');

      console.log(chalk.bold(`${key.name || 'Unnamed Key'}`));
      console.log(chalk.gray('  ID:'), key.id);
      console.log(chalk.gray('  Type:'), keyType);
      console.log(chalk.gray('  Status:'), status);
      console.log(chalk.gray('  Starts with:'), key.start || 'N/A');

      if (key.createdAt) {
        const created = new Date(key.createdAt).toLocaleDateString();
        console.log(chalk.gray('  Created:'), created);
      }

      if (key.expiresAt) {
        const expires = new Date(key.expiresAt);
        const daysRemaining = Math.floor((expires.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        const expiryText = daysRemaining > 0 ?
          `${expires.toLocaleDateString()} (${daysRemaining} days)` :
          chalk.red('Expired');
        console.log(chalk.gray('  Expires:'), expiryText);
      }

      if (key.lastUsedAt) {
        const lastUsed = new Date(key.lastUsedAt).toLocaleDateString();
        console.log(chalk.gray('  Last used:'), lastUsed);
      }

      console.log();
    }
  } catch (error) {
    console.error(chalk.red('Failed to list keys:'), error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}