import chalk from 'chalk';
import ora from 'ora';
import { exec } from 'child_process';
import { promisify } from 'util';
import { createServer } from 'http';
import { TokenStorage } from '../../utils/token-storage.js';
import { get } from '../../config/index.js';

const execAsync = promisify(exec);

const LOCAL_PORT = 8899;
const CALLBACK_URL = `http://localhost:${LOCAL_PORT}/callback`;

export async function login() {
  const tokenStorage = new TokenStorage();

  // Check if already authenticated
  const existingToken = await tokenStorage.retrieve();
  if (existingToken) {
    console.log(chalk.yellow('Already logged in. Use "polli auth logout" to logout first.'));
    return;
  }

  const spinner = ora('Starting authentication flow...').start();

  try {
    // Create local server to receive the callback
    const apiKey = await new Promise<string>((resolve, reject) => {
      const server = createServer((req, res) => {
        const url = new URL(req.url!, `http://localhost:${LOCAL_PORT}`);

        if (url.pathname === '/callback') {
          // Extract API key from hash fragment (passed as query param by client-side redirect)
          const apiKey = url.searchParams.get('api_key');

          if (apiKey) {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(`
              <!DOCTYPE html>
              <html>
              <head>
                <title>Authentication Successful</title>
                <script>
                  // Extract API key from URL fragment and redirect with it as query param
                  const hash = window.location.hash.substring(1);
                  const params = new URLSearchParams(hash);
                  const apiKey = params.get('api_key');
                  if (apiKey && !window.location.search.includes('api_key')) {
                    window.location.href = '/callback?api_key=' + apiKey;
                  }
                </script>
              </head>
              <body style="font-family: system-ui, sans-serif; text-align: center; padding: 50px;">
                <h1>✅ Authentication Successful!</h1>
                <p>You can now close this window and return to your terminal.</p>
              </body>
              </html>
            `);

            if (apiKey) {
              server.close();
              resolve(apiKey);
            }
          } else {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end(`
              <!DOCTYPE html>
              <html>
              <head>
                <title>Authentication Failed</title>
                <script>
                  // Try to extract from fragment
                  const hash = window.location.hash.substring(1);
                  const params = new URLSearchParams(hash);
                  const apiKey = params.get('api_key');
                  if (apiKey) {
                    window.location.href = '/callback?api_key=' + apiKey;
                  }
                </script>
              </head>
              <body style="font-family: system-ui, sans-serif; text-align: center; padding: 50px;">
                <h1>❌ Authentication Failed</h1>
                <p>No API key received. Please try again.</p>
              </body>
              </html>
            `);
          }
        } else {
          res.writeHead(404);
          res.end('Not found');
        }
      });

      server.on('error', reject);

      server.listen(LOCAL_PORT, async () => {
        spinner.text = 'Opening browser for authentication...';

        // Build the authorize URL with CLI-specific permissions
        const apiUrl = get('apiUrl');
        const authUrl = new URL('/authorize', apiUrl);
        authUrl.searchParams.set('redirect_url', CALLBACK_URL);
        authUrl.searchParams.set('expiry', '365'); // 1 year expiry for CLI keys
        authUrl.searchParams.set('permissions', 'profile'); // Profile access for CLI

        // Open browser
        const openCommand = process.platform === 'darwin' ? 'open' :
                          process.platform === 'win32' ? 'start' :
                          'xdg-open';

        try {
          await execAsync(`${openCommand} "${authUrl.toString()}"`);
          spinner.text = 'Waiting for authentication in browser...';
        } catch (error) {
          spinner.fail('Failed to open browser automatically');
          console.log(chalk.yellow('\nPlease open this URL in your browser:'));
          console.log(chalk.blue(authUrl.toString()));
          spinner.start('Waiting for authentication...');
        }
      });

      // Timeout after 5 minutes
      setTimeout(() => {
        server.close();
        reject(new Error('Authentication timeout'));
      }, 5 * 60 * 1000);
    });

    spinner.text = 'Storing authentication token...';

    // Store the API key
    await tokenStorage.store({
      accessToken: apiKey,
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(), // 1 year
      userId: 'cli-user', // We'll fetch actual user info later
    });

    // Fetch user info using the API key
    try {
      const apiUrl = get('apiUrl');
      const response = await fetch(`${apiUrl}/api/auth/session`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.user) {
          await tokenStorage.store({
            accessToken: apiKey,
            expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
            userId: data.user.id,
            userName: data.user.name || data.user.githubUsername,
            userEmail: data.user.email,
          });
        }
      }
    } catch {
      // Ignore errors fetching user info - the key is still valid
    }

    spinner.succeed('Successfully logged in to Pollinations!');
    console.log(chalk.green('\nYou can now use the CLI to interact with Pollinations.'));
  } catch (error) {
    spinner.fail('Authentication failed');
    console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'));
    process.exit(1);
  }
}