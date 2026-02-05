import { Command } from 'commander';
import { login } from './login.js';
import { logout } from './logout.js';
import { status } from './status.js';

export function authCommands(program: Command) {
  const auth = program
    .command('auth')
    .description('Authentication commands');

  auth
    .command('login')
    .description('Login to Pollinations')
    .action(login);

  auth
    .command('logout')
    .description('Logout from Pollinations')
    .action(logout);

  auth
    .command('status')
    .description('Check authentication status')
    .action(status);
}