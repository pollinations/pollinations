import { Command } from 'commander';
import chalk from 'chalk';
import { get, set, reset, getConfig } from '../../config/index.js';

export function configCommands(program: Command) {
  const config = program
    .command('config')
    .description('Manage CLI configuration');

  config
    .command('get <key>')
    .description('Get a configuration value')
    .action((key: string) => {
      const conf = getConfig();
      if (conf.has(key)) {
        console.log(conf.get(key));
      } else {
        console.log(chalk.yellow(`Configuration key "${key}" not found.`));
      }
    });

  config
    .command('set <key> <value>')
    .description('Set a configuration value')
    .action((key: string, value: string) => {
      const conf = getConfig();

      // Parse boolean and number values
      let parsedValue: any = value;
      if (value === 'true') parsedValue = true;
      else if (value === 'false') parsedValue = false;
      else if (!isNaN(Number(value))) parsedValue = Number(value);

      conf.set(key, parsedValue);
      console.log(chalk.green(`Set ${key} = ${parsedValue}`));
    });

  config
    .command('list')
    .description('List all configuration values')
    .action(() => {
      const conf = getConfig();
      console.log(chalk.cyan('\nCurrent Configuration:\n'));

      for (const [key, value] of Object.entries(conf.store)) {
        console.log(chalk.gray(`${key}:`), value);
      }
    });

  config
    .command('reset')
    .description('Reset configuration to defaults')
    .action(() => {
      reset();
      console.log(chalk.green('Configuration reset to defaults.'));
    });
}