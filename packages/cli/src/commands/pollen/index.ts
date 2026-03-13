import { Command } from 'commander';
import chalk from 'chalk';
import { TokenStorage } from '../../utils/token-storage.js';
import { get } from '../../config/index.js';

export function pollenCommands(program: Command) {
  program
    .command('pollen')
    .description('Check your pollen balance')
    .action(async () => {
      const tokenStorage = new TokenStorage();
      const token = await tokenStorage.retrieve();

      if (!token) {
        console.log(chalk.red('Not authenticated. Please run "polli auth login" first.'));
        process.exit(1);
      }

      try {
        const apiUrl = get('apiUrl');
        const response = await fetch(`${apiUrl}/api/account/balance`, {
          headers: {
            'Authorization': `Bearer ${token.accessToken}`,
          },
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch balance: ${response.statusText}`);
        }

        const data = await response.json();
        const balance = data.balance || 0;

        console.log(chalk.cyan('\n🌻 Pollen Balance\n'));
        console.log(chalk.bold(`${balance.toFixed(2)} pollen`));

        // Get tier info
        const tierResponse = await fetch(`${apiUrl}/api/auth/session`, {
          headers: {
            'Authorization': `Bearer ${token.accessToken}`,
          },
        });

        if (tierResponse.ok) {
          const tierData = await tierResponse.json();
          const tier = tierData.user?.tier || 'spore';
          console.log(chalk.gray('\nTier:'), tier);
        }

      } catch (error) {
        console.error(chalk.red('Failed to fetch balance:'), error instanceof Error ? error.message : 'Unknown error');
        process.exit(1);
      }
    });
}