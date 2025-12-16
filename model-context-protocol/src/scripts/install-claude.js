import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';
import { platform } from 'process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Detect the operating system and return the Claude Desktop config path
 */
function getClaudeConfigPath() {
    const os = platform;
    
    switch (os) {
        case 'darwin': // macOS
            return join(homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
        case 'win32': // Windows
            return join(homedir(), 'AppData', 'Roaming', 'Claude', 'claude_desktop_config.json');
        case 'linux': // Linux
            return join(homedir(), '.config', 'Claude', 'claude_desktop_config.json');
        default:
            throw new Error(`Unsupported operating system: ${os}`);
    }
}

/**
 * Create the MCP configuration for Pollinations
 */
function createMcpConfig() {
    return {
        "mcpServers": {
            "pollinations": {
                "command": "npx",
                "args": ["@pollinations/model-context-protocol"],
                "env": {}
            }
        }
    };
}

/**
 * Install Pollinations MCP to Claude Desktop
 */
export async function installClaudeMcp() {
    try {
        console.log("🔍 Detecting Claude Desktop configuration...");
        
        const configPath = getClaudeConfigPath();
        console.log(`📁 Config path: ${configPath}`);
        
        let existingConfig = {};
        
        // Try to read existing config
        try {
            const configContent = await fs.readFile(configPath, 'utf8');
            existingConfig = JSON.parse(configContent);
            console.log("📋 Found existing Claude Desktop configuration");
        } catch (error) {
            if (error.code === 'ENOENT') {
                console.log("🆕 No existing Claude Desktop configuration found, creating new one");
            } else {
                console.log("⚠️  Could not read existing config, creating new one");
            }
        }
        
        // Create or update MCP configuration
        const mcpConfig = createMcpConfig();
        const updatedConfig = {
            ...existingConfig,
            ...mcpConfig
        };
        
        // Ensure mcpServers exists and merge properly
        if (existingConfig.mcpServers) {
            updatedConfig.mcpServers = {
                ...existingConfig.mcpServers,
                ...mcpConfig.mcpServers
            };
        }
        
        // Create directory if it doesn't exist
        const configDir = dirname(configPath);
        try {
            await fs.mkdir(configDir, { recursive: true });
        } catch (error) {
            // Directory might already exist, continue
        }
        
        // Write the updated configuration
        await fs.writeFile(configPath, JSON.stringify(updatedConfig, null, 2));
        
        console.log("✅ Successfully installed Pollinations MCP to Claude Desktop!");
        console.log("");
        console.log("🎉 Installation complete!");
        console.log("📋 Configuration saved to:", configPath);
        console.log("");
        console.log("🔄 Next steps:");
        console.log("1. Restart Claude Desktop if it's running");
        console.log("2. Look for the 🔧 icon in the bottom right");
        console.log("3. You should see 'pollinations' in your available tools");
        console.log("");
        console.log("💡 Having issues? Check:");
        console.log("- Claude Desktop is properly installed");
        console.log("- Node.js and npm are available in your PATH");
        console.log("- The config file is valid JSON");
        
    } catch (error) {
        console.error("❌ Installation failed:", error.message);
        console.error("");
        console.error("🔧 Troubleshooting tips:");
        console.error("1. Ensure Claude Desktop is installed");
        console.error("2. Check file permissions for the config directory");
        console.error("3. Verify Node.js and npm are installed");
        console.error("4. Try running with administrator/sudo privileges");
        
        throw error;
    }
}