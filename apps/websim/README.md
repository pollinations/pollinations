# HTML Wrapper for text.pollinations.ai

This is a simple wrapper service around text.pollinations.ai/openai that:

1. Receives a prompt in the path of a GET request
2. Calls the text.pollinations.ai/openai endpoint with model openai-large and streaming enabled
3. Uses a system prompt that instructs the model to return a single HTML file
4. Detects when the first HTML tag appears and starts streaming the HTML directly (not as SSE)

## Installation

```bash
npm install
```

## Usage

Start the server using Cloudflare's Wrangler for local development:

```bash
# Install Wrangler globally (if not already installed)
npm install -g wrangler

# Run the worker locally
wrangler dev worker.js --local
```

Alternatively, you can use the npm script:

```bash
npm run dev
```

This will run the same code that gets deployed to Cloudflare Workers, providing a consistent environment between development and production.

The server will run on port 16386 by default. You can change this by updating the wrangler.toml file.

## Making Requests

Simply make a GET request to the server with your prompt in the path:

```
http://localhost:16386/Create a simple calculator with HTML, CSS, and JavaScript
```

The server will return the HTML content directly, which can be rendered in a browser.

## How it Works

1. The service takes the entire path after the first slash as the prompt
2. It sends a request to text.pollinations.ai/openai with:
   - The openai-large model
   - A system prompt that instructs the model to generate HTML
   - Streaming enabled
3. It processes the SSE stream from text.pollinations.ai
4. When it detects the first HTML tag, it starts streaming the HTML directly to the client
5. If no HTML tags are found, it wraps the content in a basic HTML structure

## System Prompt

The system prompt instructs the model to:
- Return a single, complete HTML file
- Start with <!DOCTYPE html> and end with </html>
- Include all necessary CSS inline within a <style> tag
- Include all necessary JavaScript within <script> tags
- Make the design clean, modern, and responsive

## Deployment to websim.pollinations.ai

To deploy this service to websim.pollinations.ai:

1. Make sure the service is working correctly locally using Wrangler

2. Deploy using Wrangler:
   ```bash
   # Install Wrangler globally (if not already installed)
   npm install -g wrangler

   # Deploy the worker
   wrangler deploy worker.js
   ```

   Wrangler will automatically create the necessary DNS records for the custom domain (websim.pollinations.ai) as specified in your wrangler.toml file.

Once deployed, you can access the service at:
```
https://websim.pollinations.ai/Create a simple calculator with HTML, CSS, and JavaScript
```

Note: The deployment configuration is defined in the wrangler.toml file.
