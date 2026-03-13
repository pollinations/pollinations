import chalk from 'chalk';
import { TokenStorage } from '../../utils/token-storage.js';

export async function logout() {
  const tokenStorage = new TokenStorage();

  const token = await tokenStorage.retrieve();
  if (!token) {
    console.log(chalk.yellow('Not currently logged in.'));
    return;
  }

  await tokenStorage.clear();
  console.log(chalk.green('Successfully logged out from Pollinations.'));
}