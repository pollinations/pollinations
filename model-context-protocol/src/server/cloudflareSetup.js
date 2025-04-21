// Cloudflare tunnel setup for the Pollinations MCP server
import fs from 'fs';

/**
 * Starts a Cloudflare tunnel for the MCP server
 * @param {Object} options - Configuration options
 * @param {number} options.port - Port the server is running on
 * @param {string} options.configPath - Path to Cloudflare tunnel config file
 * @param {Object} options.server - MCP server instance
 * @returns {Promise<Object>} HTTP server
 */
export async function startCloudflareServer({ port, configPath, server }) {
  // Check if cloudflared is installed
  try {
    const { spawn } = await import('child_process');
    
    // Check if the config file exists
    if (!fs.existsSync(configPath)) {
      console.error(`Cloudflare tunnel config file not found: ${configPath}`);
      console.error('Please run the setup-cloudflare-tunnel.sh script first');
      process.exit(1);
    }
    
    // Parse the config file to get the tunnel ID
    const tunnelConfig = fs.readFileSync(configPath, 'utf8');
    const tunnelMatch = tunnelConfig.match(/tunnel:\s*([a-f0-9-]+)/);
    const tunnelId = tunnelMatch ? tunnelMatch[1] : null;
    
    if (!tunnelId) {
      console.error('Could not find tunnel ID in config file');
      console.error('Please run the setup-cloudflare-tunnel.sh script again');
      process.exit(1);
    }
    
    // Start the cloudflared tunnel using the direct run command
    // This is more reliable than using the config file
    console.error(`Starting Cloudflare tunnel with ID: ${tunnelId}`);
    console.error(`Tunnel will be available at flow.pollinations.ai`);
    
    const cloudflared = spawn('cloudflared', ['tunnel', 'run', '--url', `http://localhost:${port}`, tunnelId], {
      stdio: ['ignore', 'pipe', 'pipe']
    });
    
    // Handle cloudflared output
    cloudflared.stdout.on('data', (data) => {
      console.error(`[Cloudflare Tunnel] ${data.toString().trim()}`);
    });
    
    cloudflared.stderr.on('data', (data) => {
      console.error(`[Cloudflare Tunnel Error] ${data.toString().trim()}`);
    });
    
    // Handle cloudflared exit
    cloudflared.on('exit', (code) => {
      console.error(`Cloudflare tunnel exited with code ${code}`);
      if (code !== 0) {
        console.error('Tunnel failed, but HTTP server will continue running');
        console.error('You can try running the tunnel manually with:');
        console.error(`cloudflared tunnel run --url http://localhost:${port} ${tunnelId}`);
      }
    });
    
    // Handle process exit to clean up the tunnel
    process.on('SIGINT', async () => {
      console.error('Shutting down Cloudflare tunnel...');
      cloudflared.kill();
      await server.close();
      process.exit(0);
    });
    
    return cloudflared;
  } catch (error) {
    console.error('Error starting Cloudflare tunnel:', error);
    console.error('Continuing with HTTP server only');
    return null;
  }
}
