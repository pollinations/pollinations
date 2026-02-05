import chalk from 'chalk';
import ora from 'ora';
import { promises as fs } from 'fs';
import { join, resolve } from 'path';
import { TokenStorage } from '../../utils/token-storage.js';
import { get } from '../../config/index.js';

interface ImageOptions {
  model: string;
  output?: string;
  width: string;
  height: string;
  seed?: string;
  enhance?: boolean;
  nologo?: boolean;
}

export async function generateImage(prompt: string, options: ImageOptions) {
  const tokenStorage = new TokenStorage();
  const token = await tokenStorage.retrieve();

  if (!token) {
    console.log(chalk.red('Not authenticated. Please run "polli auth login" first.'));
    process.exit(1);
  }

  const spinner = ora('Generating image...').start();

  try {
    const apiUrl = get('apiUrl');
    const url = new URL('/api/generate/image', apiUrl);

    // Build request body
    const body: any = {
      prompt,
      model: options.model,
      width: parseInt(options.width),
      height: parseInt(options.height),
    };

    if (options.seed) body.seed = parseInt(options.seed);
    if (options.enhance) body.enhance = true;
    if (options.nologo) body.nologo = true;

    // Make request
    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API error: ${error}`);
    }

    // Get image data
    const imageBuffer = await response.arrayBuffer();

    // Determine output path
    const outputPath = options.output ||
      join(get('outputDirectory'), `image-${Date.now()}.png`);
    const resolvedPath = resolve(outputPath);

    // Ensure directory exists
    await fs.mkdir(join(resolvedPath, '..'), { recursive: true });

    // Save image
    await fs.writeFile(resolvedPath, Buffer.from(imageBuffer));

    spinner.succeed(`Image saved to: ${resolvedPath}`);

    // Show generation details
    console.log(chalk.gray('\nGeneration details:'));
    console.log(chalk.gray('Model:'), options.model);
    console.log(chalk.gray('Size:'), `${options.width}x${options.height}`);
    if (options.seed) console.log(chalk.gray('Seed:'), options.seed);

  } catch (error) {
    spinner.fail('Failed to generate image');
    console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'));
    process.exit(1);
  }
}