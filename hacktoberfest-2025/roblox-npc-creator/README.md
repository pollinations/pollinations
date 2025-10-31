# 🤖 Roblox AI NPC Creator

Create AI-powered NPCs in Roblox using the Pollinations API. This project demonstrates how to properly version control Roblox projects with Git using Rojo.

## What It Does

This kit provides everything you need to create conversational AI NPCs in Roblox:
- **Chat UI** - Clean interface for talking to NPCs
- **Client-Server Architecture** - Secure API calls from the server
- **Pollinations Integration** - Free AI text generation
- **Git-Friendly Structure** - Proper version control with Rojo

## Features

- ✅ AI-powered NPC conversations
- ✅ Customizable NPC personalities
- ✅ Clean chat interface
- ✅ Secure server-side API calls
- ✅ Easy to extend and modify
- ✅ Full Git version control

## Prerequisites

Before you start, install these tools:

1. **Roblox Studio** - [Download here](https://create.roblox.com/)
2. **Git** - [Download here](https://git-scm.com/)
3. **Aftman** - [Installation guide](https://github.com/LPGhatguy/aftman)
4. **VS Code** (recommended) - [Download here](https://code.visualstudio.com/)

## 🚀 Quick Start

1. **Install Rojo**:
   ```bash
   aftman install
   rojo plugin install
   ```

2. **Get Your Pollinations API Key**:
   - Visit [auth.pollinations.ai](https://auth.pollinations.ai)
   - Sign up for a free account
   - Copy your API key

3. **Configure the NPC**:
   
   Open `src/ServerScriptService/ConfigModule.lua` and add your API key:
   ```lua
   return {
       API_KEY = "your_pollinations_api_key_here",
       MODEL = "openai",
       NPC_PERSONALITY = "You are a helpful and friendly NPC."
   }
   ```

4. **Start Rojo & Connect**:
   ```bash
   rojo serve
   ```
   
   Then in Roblox Studio:
   - Open a new Baseplate
   - Click Rojo plugin → Connect
   - Enable HTTP Requests (Game Settings → Security)

5. **Test It**:
   - Press F5 to play
   - Click the NPC
   - Start chatting!

## 📚 Documentation

- **[CONTRIBUTING.md](CONTRIBUTING.md)** - How to contribute to this project
- **[CONVERSION_GUIDE.md](CONVERSION_GUIDE.md)** - Technical details on Rojo conversion

## Project Structure

```
roblox-npc-creator/
├── README.md                    # This file
├── aftman.toml                  # Tool versions
├── default.project.json         # Rojo project configuration
├── .gitignore                   # Git ignore patterns
├── src/
│   ├── ServerScriptService/
│   │   ├── ChatServer.lua       # Server-side chat handler
│   │   └── ConfigModule.lua     # Configuration (API key, etc.)
│   ├── StarterPlayer/
│   │   └── StarterPlayerScripts/
│   │       └── ChatClient.lua   # Client-side chat UI logic
│   ├── StarterGui/
│   │   └── ChatUI/              # Chat interface
│   │       ├── init.meta.json
│   │       ├── InputBox.lua
│   │       ├── SendButton.lua
│   │       └── OutputLabel.lua
│   └── ReplicatedStorage/
│       └── ChatEvents/          # RemoteEvents for communication
│           ├── SendMessage.lua
│           └── ReceiveMessage.lua
└── models/
    └── NPC.rbxmx                # The NPC model (XML format)
```

## How It Works

### Architecture

1. **Player clicks NPC** → Triggers ClickDetector
2. **Chat UI opens** → Player types message
3. **Client sends message** → Via RemoteEvent to server
4. **Server calls Pollinations API** → Gets AI response
5. **Server sends response** → Via RemoteEvent to client
6. **UI displays response** → Player sees AI message

### Key Components

- **ConfigModule** - Stores API key and settings
- **ChatServer** - Handles API calls (server-side only for security)
- **ChatClient** - Manages UI interactions
- **ChatEvents** - RemoteEvents for client-server communication
- **ChatUI** - ScreenGui with input/output elements

## Customization

### Change NPC Personality

Edit `src/ServerScriptService/ConfigModule.lua`:

```lua
NPC_PERSONALITY = "You are a wise wizard who speaks in riddles."
```

### Change NPC Model

Replace `models/NPC.rbxmx` with your own model, or edit it in Studio and export as `.rbxmx`

### Add Multiple NPCs

1. Duplicate the NPC model
2. Create separate ConfigModules for each
3. Update ChatServer to handle multiple NPCs

## Development Workflow

### Edit Code in VS Code

1. Open this folder in VS Code
2. Edit `.lua` files in the `src/` directory
3. Rojo automatically syncs changes to Studio
4. Test in Studio immediately

### Commit Changes

```bash
git add .
git commit -m "Add new NPC personality"
git push
```

### Build Place File

```bash
# Build a .rbxl place file
rojo build -o game.rbxl
```

## Troubleshooting

### "HTTP requests are not enabled"
- Go to Game Settings > Security > Enable HTTP Requests

### "API key invalid"
- Check your API key in ConfigModule.lua
- Make sure you copied it correctly from auth.pollinations.ai

### "Rojo won't connect"
- Make sure `rojo serve` is running
- Check that Studio is trying to connect to `localhost:34872`
- Try restarting both Rojo and Studio

### "Chat UI not appearing"
- Make sure ChatUI is in StarterGui
- Check that ChatClient is in StarterPlayerScripts
- Verify the ClickDetector is on the NPC's Head

## Advanced Usage

### Use Different AI Models

Change the model in ConfigModule.lua:

```lua
MODEL = "openai-large"  -- GPT-4o
-- or
MODEL = "deepseek"      -- DeepSeek V3
-- or
MODEL = "qwen-coder"    -- Qwen 2.5 Coder
```

See [Pollinations API Docs](https://github.com/pollinations/pollinations/blob/main/APIDOCS.md) for all models.

### Add Conversation History

Modify ChatServer.lua to store previous messages and send them with each request for context-aware conversations.

### Add Voice Responses

Use Pollinations audio API to generate voice responses:
```
https://audio.pollinations.ai/tts?text=Hello&voice=alloy
```

## Contributing

Want to improve this project? Here are some ideas:

- [ ] Add conversation history/memory
- [ ] Add voice responses with audio API
- [ ] Add multiple NPC personalities
- [ ] Add NPC emotion system
- [ ] Add quest/dialogue tree system
- [ ] Add image generation for NPC portraits
- [ ] Add admin commands for NPC control

Submit a PR with your improvements!

## Resources

- [Pollinations API Docs](https://github.com/pollinations/pollinations/blob/main/APIDOCS.md)
- [Rojo Documentation](https://rojo.space/docs/)
- [Roblox Creator Hub](https://create.roblox.com/)
- [Pollinations Discord](https://discord.gg/8HqSRhJVxn)

## License

MIT License - Feel free to use this in your own projects!

---

**Made for Hacktoberfest 2025** 🎃

Built with ❤️ using [Pollinations AI](https://pollinations.ai)
