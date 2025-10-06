# 🚀 Setup Guide - Two Methods

You can set up this project in two ways:

## Method 1: Quick Start (Using Existing Model)

This is the fastest way to get started. Use the pre-built model file.

### Steps:

1. **Copy the model file** from `/Users/thomash/Downloads/roblox npc creator/ZerotoNPC_Model v2 (3).rbxm` to this folder:
   ```bash
   cp "/Users/thomash/Downloads/roblox npc creator/ZerotoNPC_Model v2  (3).rbxm" models/NPC.rbxm
   ```

2. **Open Roblox Studio** with a new Baseplate

3. **Insert the model**:
   - Right-click `Workspace` → Insert from File
   - Select `models/NPC.rbxm`

4. **Move components** to correct locations:
   | Component | From | To |
   |-----------|------|-----|
   | NPC | Workspace | Workspace |
   | ChatUI | (in model) | StarterGui |
   | ChatClient | (in model) | StarterPlayerScripts |
   | ChatServer | (in model) | ServerScriptService |
   | ConfigModule | (in model) | ServerScriptService |
   | ChatEvents | (in model) | ReplicatedStorage |

5. **Enable HTTP Requests**:
   - Home > Game Settings > Security
   - Turn ON "Enable HTTP Requests"

6. **Add your API key**:
   - Open `ServerScriptService > ConfigModule`
   - Replace `YOUR_API_KEY_HERE` with your key from [auth.pollinations.ai](https://auth.pollinations.ai)

7. **Test it**:
   - Press F5 to play
   - Click the NPC
   - Type a message!

## Method 2: Rojo Workflow (Version Control)

This method uses Rojo for proper Git version control and professional development workflow.

### Prerequisites:

- Git installed
- Aftman installed ([guide](https://github.com/LPGhatguy/aftman))
- VS Code (recommended)

### Steps:

1. **Install Rojo**:
   ```bash
   cd hacktoberfest-2025/roblox-npc-creator
   aftman install
   ```

2. **Install Rojo Studio Plugin**:
   ```bash
   rojo plugin install
   ```

3. **Convert the model to XML format** (one-time):
   
   You'll need to export the NPC model as `.rbxmx` (XML format) from Studio:
   - Open the `.rbxm` file in Studio
   - Right-click the NPC model
   - Save to File → Save as `models/NPC.rbxmx`
   - Make sure to select "Save as type: Model File (*.rbxmx)"

4. **Start Rojo server**:
   ```bash
   rojo serve
   ```

5. **Connect from Studio**:
   - Open Roblox Studio (new Baseplate)
   - Click Rojo plugin button
   - Click "Connect"
   - Your project syncs automatically!

6. **Edit code in VS Code**:
   - Open this folder in VS Code
   - Edit `.lua` files in `src/`
   - Changes sync to Studio automatically
   - Test immediately in Studio

7. **Commit your changes**:
   ```bash
   git add .
   git commit -m "Add custom NPC personality"
   git push
   ```

### Benefits of Rojo Method:

- ✅ Edit code in VS Code with autocomplete
- ✅ Full Git version control
- ✅ Collaborate with others easily
- ✅ See meaningful diffs in Git
- ✅ Professional development workflow
- ✅ Can build place files from command line

## Converting Between Methods

### From Quick Start → Rojo:

1. Export your modified scripts from Studio as individual `.lua` files
2. Place them in the `src/` folder structure
3. Export the NPC model as `.rbxmx`
4. Start using Rojo workflow

### From Rojo → Quick Start:

1. Build the place file:
   ```bash
   rojo build -o game.rbxl
   ```
2. Open `game.rbxl` in Studio
3. Continue editing in Studio

## Troubleshooting

### "Module not found" errors
- Make sure all scripts are in the correct services
- Check that ChatEvents folder exists in ReplicatedStorage

### "HTTP requests not enabled"
- Game Settings > Security > Enable HTTP Requests

### Rojo won't connect
- Make sure `rojo serve` is running
- Check Studio is connecting to `localhost:34872`
- Try restarting both Rojo and Studio

### NPC doesn't respond
- Check your API key in ConfigModule
- Look for errors in Output window
- Make sure HTTP requests are enabled

## Next Steps

Once you have it working:

1. Customize the NPC personality in `ConfigModule.lua`
2. Try different AI models (deepseek, qwen-coder, etc.)
3. Add conversation history for context-aware chat
4. Add multiple NPCs with different personalities
5. Create quests or dialogue trees

See the main [README.md](README.md) for more details!
