import chalk from 'chalk';
import ora from 'ora';
import { TokenStorage } from '../../utils/token-storage.js';
import { get } from '../../config/index.js';

interface CreateKeyOptions {
  name: string;
  type: string;
  expiry?: string;
  budget?: string;
}

export async function createKey(options: CreateKeyOptions) {
  const tokenStorage = new TokenStorage();
  const token = await tokenStorage.retrieve();

  if (!token) {
    console.log(chalk.red('Not authenticated. Please run "polli auth login" first.'));
    process.exit(1);
  }

  const spinner = ora('Creating API key...').start();

  try {
    const apiUrl = get('apiUrl');
    const isPublishable = options.type === 'publishable';
    const prefix = isPublishable ? 'pk' : 'sk';

    // Create the key
    const response = await fetch(`${apiUrl}/api/auth/api-key/create`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: options.name,
        prefix,
        ...(options.expiry && {
          expiresIn: parseInt(options.expiry) * 24 * 60 * 60, // Convert days to seconds
        }),
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to create key: ${error}`);
    }

    const data = await response.json();

    // If budget is specified, update the key permissions
    if (options.budget && data.data?.id) {
      const updateResponse = await fetch(`${apiUrl}/api/api-keys/${data.data.id}/update`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          pollenBudget: parseFloat(options.budget),
        }),
      });

      if (!updateResponse.ok) {
        console.log(chalk.yellow('\nWarning: Key created but failed to set budget.'));
      }
    }

    spinner.succeed('API key created successfully!');

    console.log(chalk.cyan('\n🔑 New API Key:\n'));
    console.log(chalk.bold.green(data.data?.key));

    console.log(chalk.yellow('\n⚠️  Important:'));
    console.log(chalk.yellow('This is the only time you will see this key.'));
    console.log(chalk.yellow('Save it securely - it cannot be retrieved later.\n'));

    console.log(chalk.gray('Key Details:'));
    console.log(chalk.gray('  Name:'), options.name);
    console.log(chalk.gray('  Type:'), isPublishable ? 'Publishable' : 'Secret');
    console.log(chalk.gray('  ID:'), data.data?.id);
    if (options.expiry) {
      console.log(chalk.gray('  Expires in:'), `${options.expiry} days`);
    }
    if (options.budget) {
      console.log(chalk.gray('  Budget:'), `${options.budget} pollen`);
    }

  } catch (error) {
    spinner.fail('Failed to create API key');
    console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'));
    process.exit(1);
  }
}