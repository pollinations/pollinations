# Pollinations Discord Bot

A Discord bot that provides access to Pollinations AI image and text generation capabilities directly in Discord.

## Features

- `/imagine` - Generate images from text descriptions using Pollinations AI
- `/chat` - Chat with Pollinations AI text models
- Support for multiple AI models
- Error handling and rate limiting
- Progress updates during generation

## Setup

1. Clone the repository
2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file based on `.env.example`:
```bash
cp .env.example .env
```

4. Set up your Discord bot:
   - Go to [Discord Developer Portal](https://discord.com/developers/applications)
   - Create a new application
   - Go to the Bot section and create a bot
   - Copy the bot token and add it to your `.env` file
   - Enable necessary intents (Message Content, Server Members, etc.)

5. Start the bot:
```bash
npm start
```

## Docker Setup

1. Build the image:
```bash
docker build -t pollinations-discord-bot .
```

2. Run the container:
```bash
docker run -d --env-file .env pollinations-discord-bot
```

## Commands

### Image Generation
```
/imagine <prompt>
```
Generates an image based on your text description.

Options:
- `prompt`: Description of the image you want to generate
- `model` (optional): Choose the AI model to use (default: sdxl)

### Chat
```
/chat <message>
```
Chat with the Pollinations AI.

Options:
- `message`: Your message to the AI
- `model` (optional): Choose the AI model to use (default: gpt-3.5-turbo)

## Development

Run in development mode with auto-reload:
```bash
npm run dev
```

Run tests:
```bash
npm test
```

## License

MIT License - see LICENSE file for details.