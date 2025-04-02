# Pollinations.ai Text Generation API

This repository contains the source code for the Pollinations.ai Text Generation API, a powerful and flexible service for generating text using various language models.

## Features

- Support for multiple language models (OpenAI, Mistral, Llama, Claude)
- GET and POST request handling
- JSON mode for structured output
- Seed support for reproducible results
- Temperature control for output randomness
- System prompt support
- Request caching for improved performance

## Installation

1. Clone this repository:
   ```
   git clone https://github.com/pollinations/pollinations
   ```

2. Install dependencies:
   ```
   cd pollinations/text.pollinations.ai
   npm install
   ```

3. Set up environment variables (API keys, etc.) in a `.env` file.

4. Start the server:
   ```
   npm start
   ```

## Usage

The API supports both GET and POST requests. For detailed usage examples, please refer to [APIDOCS.md](../APIDOCS.md).

## API Endpoints

For detailed API documentation, please refer to [APIDOCS.md](../APIDOCS.md).

## Caching

Responses are cached to improve performance and reduce unnecessary API calls. The cache is persisted to disk and loaded on server start.

## Feed Filter CLI

The `feed-filter-cli.js` tool allows you to monitor and filter the text generation feed in real-time. It follows the "thin proxy" design principle, providing useful analytics without transforming the core data.

### Features

- Real-time monitoring of public and private feed messages
- Filtering by referrer, content type, and privacy status
- Exclude messages based on referrer substrings
- Enhanced Roblox filtering (checks referrers, model names, system prompts)
- DNS resolution for top IP addresses in statistics
- JSON output for further analysis
- Command-line interface using Commander.js

### Usage

```bash
node feed-filter-cli.js [options]
```

#### Options

- `--no-referrer` - Only show messages without a referrer
- `--referrer <value>` - Filter by specific referrer
- `--has-markdown` - Only show messages containing markdown
- `--has-html` - Only show messages containing HTML
- `--no-roblox` - Filter out messages with Roblox content
- `--exclude-referrer-substring <value>` - Filter out messages where referrer contains this substring (can be used multiple times)
- `--only-private` - Show only private messages (requires password)
- `--only-public` - Show only public messages
- `--password <value>` - Password for accessing private messages
- `--base-url <url>` - Base URL for API (default: https://text.pollinations.ai)
- `--count-only` - Only display statistics, not individual messages
- `--json-output <file>` - Save raw data to JSON file for later analysis

## Contributing

We welcome contributions to the Pollinations.ai Text Generation API! Please feel free to submit issues, fork the repository and send pull requests.

## License

[MIT License](LICENSE)

---

Created by the Pollinations.ai Team
