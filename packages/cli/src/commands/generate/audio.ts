import chalk from 'chalk';
import ora from 'ora';
import { promises as fs } from 'fs';
import { join, resolve } from 'path';
import { TokenStorage } from '../../utils/token-storage.js';
import { get } from '../../config/index.js';

interface AudioOptions {
  voice: string;
  output?: string;
  format: string;
}

export async function generateAudio(text: string, options: AudioOptions) {
  const tokenStorage = new TokenStorage();
  const token = await tokenStorage.retrieve();

  if (!token) {
    console.log(chalk.red('Not authenticated. Please run "polli auth login" first.'));
    process.exit(1);
  }

  const spinner = ora('Generating audio...').start();

  try {
    const apiUrl = get('apiUrl');
    const url = new URL('/api/generate/openai/audio/speech', apiUrl);

    // Build request body
    const body = {
      model: 'tts-1',
      input: text,
      voice: options.voice,
      response_format: options.format,
    };

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

    // Get audio data
    const audioBuffer = await response.arrayBuffer();

    // Determine output path
    const outputPath = options.output ||
      join(get('outputDirectory'), `audio-${Date.now()}.${options.format}`);
    const resolvedPath = resolve(outputPath);

    // Ensure directory exists
    await fs.mkdir(join(resolvedPath, '..'), { recursive: true });

    // Save audio
    await fs.writeFile(resolvedPath, Buffer.from(audioBuffer));

    spinner.succeed(`Audio saved to: ${resolvedPath}`);

    // Show generation details
    console.log(chalk.gray('\nGeneration details:'));
    console.log(chalk.gray('Voice:'), options.voice);
    console.log(chalk.gray('Format:'), options.format);
    console.log(chalk.gray('Text length:'), `${text.length} characters`);

  } catch (error) {
    spinner.fail('Failed to generate audio');
    console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'));
    process.exit(1);
  }
}