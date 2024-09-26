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
- Rate limiting to prevent abuse

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

## Rate Limiting

The API implements rate limiting to prevent abuse. By default, each IP address is limited to 20 requests per minute. Cached responses do not count towards this limit.

## Caching

Responses are cached to improve performance and reduce unnecessary API calls. The cache is persisted to disk and loaded on server start.

## Contributing

We welcome contributions to the Pollinations.ai Text Generation API! Please feel free to submit issues, fork the repository and send pull requests.

## License

[MIT License](LICENSE)

---

Created by the Pollinations.ai Team