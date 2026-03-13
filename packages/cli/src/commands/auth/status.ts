import chalk from 'chalk';
import { TokenStorage } from '../../utils/token-storage.js';
import { get } from '../../config/index.js';

export async function status() {
  const tokenStorage = new TokenStorage();
  const token = await tokenStorage.retrieve();

  if (!token) {
    console.log(chalk.yellow('Not logged in.'));
    console.log(chalk.gray('Use "polli auth login" to authenticate.'));
    return;
  }

  console.log(chalk.green('✓ Logged in to Pollinations'));

  if (token.userName || token.userEmail) {
    console.log(chalk.gray('User:'), token.userName || token.userEmail);
  }

  // Check token validity by making a test request
  try {
    const apiUrl = get('apiUrl');
    const response = await fetch(`${apiUrl}/api/auth/session`, {
      headers: {
        'Authorization': `Bearer ${token.accessToken}`
      }
    });

    if (response.ok) {
      const data = await response.json();
      if (data.user) {
        console.log(chalk.gray('Account ID:'), data.user.id);
        console.log(chalk.gray('Tier:'), data.user.tier || 'spore');
      }

      // Check pollen balance
      const balanceResponse = await fetch(`${apiUrl}/api/account/balance`, {
        headers: {
          'Authorization': `Bearer ${token.accessToken}`
        }
      });

      if (balanceResponse.ok) {
        const balanceData = await balanceResponse.json();
        console.log(chalk.gray('Pollen balance:'), balanceData.balance?.toFixed(2) || '0.00');
      }
    } else if (response.status === 401) {
      console.log(chalk.red('\n⚠ Token is invalid or expired. Please login again.'));
      await tokenStorage.clear();
    }
  } catch (error) {
    console.log(chalk.yellow('\nCould not verify token status (network error).'));
  }

  const expiresAt = new Date(token.expiresAt);
  const daysRemaining = Math.floor((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

  if (daysRemaining > 0) {
    console.log(chalk.gray('Token expires in:'), `${daysRemaining} days`);
  } else {
    console.log(chalk.red('Token has expired. Please login again.'));
  }
}