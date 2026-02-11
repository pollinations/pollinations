# 🌸 Oh My Pollicode

Pre-configured [OpenCode](https://opencode.ai) + [oh-my-opencode](https://github.com/code-yeongyu/oh-my-opencode) with Pollinations AI models for optimal multi-agent workflows.

## Quick Install

```bash
npx oh-my-pollicode
```

Or clone and run:
```bash
git clone https://github.com/pollinations/pollinations.git
cd pollinations/apps/oh-my-pollicode
node install.js
```

## What Gets Installed

### Models (via Pollinations - Free!)

| Agent | Model | Purpose |
|-------|-------|---------|
| **Sisyphus** (main) | Claude Opus 4.5 | Orchestrator - plans & delegates |
| **Oracle** | GPT-5.2 | Architecture & strategic reasoning |
| **Librarian** | Claude Sonnet 4.5 | Documentation & codebase research |
| **Explore** | Gemini Flash Lite | Fast codebase search & grep |
| **UI/UX Engineer** | Gemini 3 Flash | Creative frontend development |
| **Document Writer** | Gemini Flash Lite | Technical writing |
| **Multimodal Looker** | Gemini 3 Flash | Image/PDF analysis |

### Config Files

Both files are written to `~/.config/opencode/`:

- **`opencode.json`** - Provider config (Pollinations API, model definitions)
- **`oh-my-opencode.json`** - Agent-to-model mappings

## Usage

### Basic
```bash
opencode
```

### Ultrawork Mode (Multi-Agent)
Just include `ultrawork` or `ulw` in your prompt:

```
ulw - refactor this codebase for better performance
```

This triggers:
- Parallel agent execution
- Background task delegation
- Automatic context management
- Todo-driven workflow until completion

### Direct Agent Commands
```
@oracle review this architecture
@librarian how is auth implemented in this codebase?
@explore find all usages of the User class
```

## API Key (Optional)

Pollinations works without a key, but with one you get:
- Higher rate limits
- Priority access
- Usage tracking

Get your free key at: https://pollinations.ai/pricing

## Cross-Platform Support

Works on:
- ✅ macOS
- ✅ Linux
- ✅ Windows (PowerShell)

## License

MIT - Powered by [Pollinations.ai](https://pollinations.ai) 🌸
