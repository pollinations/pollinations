# 🔄 Converting .rbxm to Rojo Project

This guide shows you how to convert the existing `ZerotoNPC_Model v2.rbxm` file into a proper Rojo project structure with Git-friendly files.

## 📋 Overview

We'll convert the binary `.rbxm` file into:
- Individual `.lua` script files (editable in VS Code)
- `.rbxmx` XML model files (Git-friendly)
- Proper Rojo project structure

## 🎯 Method 1: Manual Extraction (Recommended - Simple)

This method uses Roblox Studio directly. No additional tools needed!

### Step 1: Open the Model in Studio

1. **Open Roblox Studio**
2. **Create a new Baseplate**
3. **Insert the model**:
   - Go to `Workspace` in Explorer
   - Right-click → `Insert from File...`
   - Select `/Users/thomash/Downloads/roblox npc creator/ZerotoNPC_Model v2  (3).rbxm`

### Step 2: Export Scripts as .lua Files

For each script in the model, we'll save it as a `.lua` file:

#### ChatServer Script:
1. Find `ChatServer` in the model
2. Right-click → `Save to File...`
3. Save as: `src/ServerScriptService/ChatServer.lua`
4. Make sure "Save as type" is set to `Lua Script (*.lua)`

#### ConfigModule:
1. Find `ConfigModule` 
2. Right-click → `Save to File...`
3. Save as: `src/ServerScriptService/ConfigModule.lua`

#### ChatClient:
1. Find `ChatClient`
2. Right-click → `Save to File...`
3. Save as: `src/StarterPlayer/StarterPlayerScripts/ChatClient.lua`

### Step 3: Export the NPC Model as XML

1. Find the `NPC` model in Workspace
2. Right-click → `Save to File...`
3. **Important**: Change "Save as type" to `Roblox XML Model Files (*.rbxmx)`
4. Save as: `models/NPC.rbxmx`

### Step 4: Handle UI Components

The ChatUI is a ScreenGui with multiple children. We have two options:

**Option A: Keep as single file (easier)**
1. Find `ChatUI` in StarterGui
2. Right-click → `Save to File...`
3. Save as `Roblox XML Model Files (*.rbxmx)`
4. Save to: `src/StarterGui/ChatUI.rbxmx`

**Option B: Create from scratch (more control)**
- Use the Lua files we already created in `src/StarterGui/ChatUI/`
- These will be synced by Rojo

### Step 5: Verify Structure

Your folder should now look like:

```
roblox-npc-creator/
├── src/
│   ├── ServerScriptService/
│   │   ├── ChatServer.lua          ✅ Exported
│   │   └── ConfigModule.lua        ✅ Exported
│   ├── StarterPlayer/
│   │   └── StarterPlayerScripts/
│   │       └── ChatClient.lua      ✅ Exported
│   └── StarterGui/
│       └── ChatUI.rbxmx            ✅ Exported
└── models/
    └── NPC.rbxmx                   ✅ Exported
```

### Step 6: Test with Rojo

1. **Start Rojo server**:
   ```bash
   cd hacktoberfest-2025/roblox-npc-creator
   rojo serve
   ```

2. **Connect from Studio**:
   - Open a new Baseplate in Studio
   - Click the Rojo plugin
   - Click "Connect"
   - Your project syncs!

3. **Verify everything loaded**:
   - Check ServerScriptService has ChatServer and ConfigModule
   - Check StarterPlayerScripts has ChatClient
   - Check StarterGui has ChatUI
   - Check Workspace has NPC
   - Check ReplicatedStorage has ChatEvents

## 🛠️ Method 2: Using rbxlx-to-rojo Tool (Advanced)

This method uses an official Rojo tool to automate the conversion.

### Prerequisites:

- Node.js installed
- Rojo installed via Aftman

### Steps:

1. **First, convert .rbxm to .rbxlx (place file)**:
   - Open the model in Studio
   - File → Publish to Roblox As...
   - Or File → Save to File As... → Save as `.rbxlx`

2. **Download rbxlx-to-rojo**:
   ```bash
   # Download from releases
   # https://github.com/rojo-rbx/rbxlx-to-rojo/releases
   ```

3. **Run the converter**:
   ```bash
   rbxlx-to-rojo path/to/your-place.rbxlx output-folder
   ```

4. **Move files to proper structure**:
   - The tool creates a Rojo project
   - Move scripts to `src/` folders
   - Update `default.project.json` paths

### Pros & Cons:

**Method 1 (Manual)**:
- ✅ Simple, no extra tools
- ✅ Full control over structure
- ✅ Works with any Studio version
- ❌ More manual work

**Method 2 (rbxlx-to-rojo)**:
- ✅ Automated
- ✅ Handles complex projects
- ❌ Requires additional setup
- ❌ Needs place file (.rbxlx) not model file

## 🔍 Verifying the Conversion

### Check Script Contents:

Open each `.lua` file and verify:
- No XML tags or binary data
- Clean Lua code
- Proper comments and formatting

### Check Model File:

Open `NPC.rbxmx` in a text editor:
- Should be readable XML
- Contains `<roblox>` tags
- Has `<Item class="Model">` for the NPC

### Test in Studio:

1. Start Rojo server
2. Connect from Studio
3. Enable HTTP Requests (Game Settings → Security)
4. Add your API key to ConfigModule
5. Press F5 to test
6. Click the NPC and try chatting

## 🐛 Troubleshooting

### "File not found" errors
- Check file paths match `default.project.json`
- Make sure folders exist: `src/ServerScriptService/`, etc.

### Scripts not syncing
- Verify Rojo server is running
- Check Studio is connected to Rojo
- Look for errors in Rojo output

### NPC model not loading
- Make sure `NPC.rbxmx` is valid XML
- Try opening it in Studio first
- Check it has all required parts (Head, Humanoid, etc.)

### UI not appearing
- Verify ChatUI.rbxmx is in correct location
- Check it's a ScreenGui with proper children
- Make sure ResetOnSpawn is false

## 📝 Next Steps

Once converted:

1. **Commit to Git**:
   ```bash
   git add .
   git commit -m "Convert NPC model to Rojo structure"
   git push
   ```

2. **Edit in VS Code**:
   - Open `.lua` files
   - Make changes
   - See them sync to Studio instantly

3. **Collaborate**:
   - Others can clone the repo
   - They run `rojo serve`
   - Everyone works on the same codebase

4. **Build place files**:
   ```bash
   rojo build -o game.rbxl
   ```

## 🎉 Success!

You now have a proper Rojo project with:
- ✅ Git-friendly file structure
- ✅ Editable scripts in VS Code
- ✅ Version control for all code
- ✅ Collaborative development ready
- ✅ Professional workflow

Happy coding! 🌸
