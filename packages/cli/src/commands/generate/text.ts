import chalk from 'chalk';
import ora from 'ora';
import { TokenStorage } from '../../utils/token-storage.js';
import { get } from '../../config/index.js';

interface TextOptions {
  model: string;
  system?: string;
  maxTokens?: string;
  temperature?: string;
  stream?: boolean;
}

export async function generateText(prompt: string, options: TextOptions) {
  const tokenStorage = new TokenStorage();
  const token = await tokenStorage.retrieve();

  if (!token) {
    console.log(chalk.red('Not authenticated. Please run "polli auth login" first.'));
    process.exit(1);
  }

  const spinner = options.stream ? null : ora('Generating text...').start();

  try {
    const apiUrl = get('apiUrl');
    const url = new URL('/api/generate/openai/chat/completions', apiUrl);

    // Build messages array
    const messages = [];
    if (options.system) {
      messages.push({ role: 'system', content: options.system });
    }
    messages.push({ role: 'user', content: prompt });

    // Build request body
    const body: any = {
      model: options.model,
      messages,
      stream: options.stream || false,
    };

    if (options.maxTokens) body.max_tokens = parseInt(options.maxTokens);
    if (options.temperature) body.temperature = parseFloat(options.temperature);

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

    if (options.stream && response.body) {
      // Handle streaming response
      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      console.log(chalk.cyan('\nResponse:\n'));

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const json = JSON.parse(data);
              const content = json.choices?.[0]?.delta?.content;
              if (content) {
                process.stdout.write(content);
              }
            } catch {
              // Ignore JSON parse errors
            }
          }
        }
      }
      console.log('\n');
    } else {
      // Handle non-streaming response
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;

      if (spinner) spinner.succeed('Text generated successfully');
      console.log(chalk.cyan('\nResponse:\n'));
      console.log(content);
    }

  } catch (error) {
    if (spinner) spinner.fail('Failed to generate text');
    console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'));
    process.exit(1);
  }
}