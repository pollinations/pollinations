# Pollinations.ai Text Generation API

This repository contains the source code for the Pollinations.ai Text Generation API, a powerful and flexible service for generating text using various language models.

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Usage](#usage)
- [API Endpoints](#api-endpoints)
- [Examples](#examples)
- [Rate Limiting](#rate-limiting)
- [Caching](#caching)
- [Contributing](#contributing)
- [License](#license)

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

The API supports both GET and POST requests. Here are some basic usage examples:

### GET Request

```
https://text.pollinations.ai/{prompt}?model={model}&seed={seed}&json={true/false}&temperature={temperature}
```

### POST Request

```
POST https://text.pollinations.ai/

{
  "messages": [
    {"role": "system", "content": "You are a helpful assistant."},
    {"role": "user", "content": "Tell me a joke."}
  ],
  "model": "openai",
  "temperature": 0.7,
  "seed": 1234,
  "jsonMode": true
}
```

## API Endpoints

- `GET /{prompt}`: Generate text based on a single prompt
- `POST /`: Generate text based on a conversation (array of messages)
- `GET /models`: Get a list of available models
- `POST /openai`: OpenAI-compatible endpoint for easy integration

## Examples

### GET Request Example

```
https://text.pollinations.ai/List%20of%20books%20by%20author%20Carl%20Sagan?seed=1234&json=true
```

This request will generate a list of books by Carl Sagan, with a fixed seed for reproducibility and JSON output format.

### POST Request Example

```json
POST https://text.pollinations.ai/

{
  "messages": [
    {"role": "system", "content": "You are a knowledgeable astronomer."},
    {"role": "user", "content": "Explain the concept of a black hole."}
  ],
  "model": "mistral",
  "temperature": 0.5
}
```

This request will generate an explanation of black holes using the Mistral model, with a slightly reduced temperature for more focused output.

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