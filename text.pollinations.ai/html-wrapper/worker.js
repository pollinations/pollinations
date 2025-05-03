import { createParser } from 'eventsource-parser';

// System prompt that instructs the model to return a single HTML file
const HTML_SYSTEM_PROMPT = `You are an HTML generator. Your task is to return a single, complete HTML file that implements what the user asks for.
The HTML should be valid, self-contained, and ready to be rendered in a browser.
Place your HTML code inside a markdown code block with the html language specifier like this:

\`\`\`html
<!DOCTYPE html>
<html>
...
</html>
\`\`\`

Include all necessary CSS inline within a <style> tag in the head section.
Include all necessary JavaScript within <script> tags, preferably at the end of the body.
Make the design clean, modern, and responsive.
Write the code in a sequence that lets the browser already render something meaningful while it is being transmitted.
Feel free to incrementally show the UI.
Imagine you are coding for a demoscene challenge where code should be short and elegant.
Use images from src="https://image.pollinations.ai/prompt/[urlencoded prompt]?width=[width]&height=[height]"`;

// No helper functions needed - we check for code blocks directly in the stream processing

// Main worker function
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Extract the prompt from the path (everything after the first /)
    const prompt = url.pathname.substring(1);
    if (!prompt) {
      return new Response('Please provide a prompt in the URL path', {
        status: 400,
        headers: { 'Content-Type': 'text/plain' }
      });
    }

    const decodedPrompt = decodeURIComponent(prompt);
    console.log(`Received prompt: ${decodedPrompt}`);

    // Set up headers for the response
    const responseHeaders = {
      'Content-Type': 'text/html; charset=utf-8'
    };

    try {
      // Prepare the request to text.pollinations.ai/v1
      const apiResponse = await fetch('https://text.pollinations.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream'
        },
        body: JSON.stringify({
          model: 'openai-large',
          messages: [
            { role: 'system', content: HTML_SYSTEM_PROMPT },
            { role: 'user', content: decodedPrompt }
          ],
          stream: true
        })
      });

      if (!apiResponse.ok) {
        throw new Error(`API request failed with status ${apiResponse.status}`);
      }

      // Create a TransformStream to process the SSE stream
      const { readable, writable } = new TransformStream();

      // Variables to track state
      let insideCodeBlock = false;
      let buffer = '';

      // Process the stream using eventsource-parser
      const parser = createParser((event) => {
        if (event.type === 'event') {
          try {
            // Skip empty data or [DONE] messages
            if (!event.data || event.data === '[DONE]') return;

            const data = JSON.parse(event.data);

            if (data.choices && data.choices[0] && data.choices[0].delta && data.choices[0].delta.content) {
              const content = data.choices[0].delta.content;

              // Check for code block markers
              if (content.includes('```html')) {
                insideCodeBlock = true;
                // Only keep what comes after ```html
                buffer = content.split('```html')[1] || '';
              } else if (insideCodeBlock && content.includes('```')) {
                // We've reached the end of the code block
                // Only include content before the closing ```
                const parts = content.split('```');
                buffer += parts[0];

                // Write the buffer to the stream
                const writer = writable.getWriter();
                writer.write(new TextEncoder().encode(buffer));
                writer.releaseLock();

                // Reset state
                insideCodeBlock = false;
                buffer = '';
              } else if (insideCodeBlock) {
                // Inside code block, accumulate content
                buffer += content;

                // Write the content to the stream
                const writer = writable.getWriter();
                writer.write(new TextEncoder().encode(content));
                writer.releaseLock();
              }
            }
          } catch (error) {
            console.error('Error parsing SSE data:', error);
            console.error('Problematic data:', event.data);
          }
        }
      });

      // Process the stream
      const reader = apiResponse.body.getReader();

      // Read and process the stream
      (async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            // Feed the chunk to the parser
            parser.feed(new TextDecoder().decode(value));
          }

          // Always close the writer when done
          const writer = writable.getWriter();
          writer.close();
        } catch (error) {
          console.error('Error processing stream:', error);
          const writer = writable.getWriter();
          writer.abort(error);
        }
      })();

      // Return the readable stream as the response
      return new Response(readable, {
        headers: responseHeaders
      });
    } catch (error) {
      console.error('Error:', error);
      return new Response(`Error: ${error.message}`, {
        status: 500,
        headers: { 'Content-Type': 'text/plain' }
      });
    }
  }
};
