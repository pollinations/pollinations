import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { TokenStorage } from '../../utils/token-storage.js';
import { get } from '../../config/index.js';

export async function revokeKey(keyId: string) {
  const tokenStorage = new TokenStorage();
  const token = await tokenStorage.retrieve();

  if (!token) {
    console.log(chalk.red('Not authenticated. Please run "polli auth login" first.'));
    process.exit(1);
  }

  // Confirm revocation
  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: `Are you sure you want to revoke key ${keyId}?`,
      default: false,
    },
  ]);

  if (!confirm) {
    console.log(chalk.yellow('Revocation cancelled.'));
    return;
  }

  const spinner = ora('Revoking API key...').start();

  try {
    const apiUrl = get('apiUrl');
    const response = await fetch(`${apiUrl}/api/auth/api-key/revoke`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ id: keyId }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to revoke key: ${error}`);
    }

    spinner.succeed('API key revoked successfully!');
    console.log(chalk.gray(`\nKey ${keyId} has been revoked and can no longer be used.`));

  } catch (error) {
    spinner.fail('Failed to revoke API key');
    console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'));
    process.exit(1);
  }
}