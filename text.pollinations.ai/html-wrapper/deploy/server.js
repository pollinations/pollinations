import express from 'express';
import fetch from 'node-fetch';
import { createParser } from 'eventsource-parser';

const app = express();
const PORT = process.env.PORT || 16386;

// System prompt that instructs the model to return a single HTML file
const HTML_SYSTEM_PROMPT = `You are an HTML generator. Your task is to return a single, complete HTML file that implements what the user asks for.
The HTML should be valid, self-contained, and ready to be rendered in a browser.
Do not include any explanations, markdown formatting, or code blocks.
Start your response with <!DOCTYPE html> and end with </html>.
Include all necessary CSS inline within a <style> tag in the head section.
Include all necessary JavaScript within <script> tags, preferably at the end of the body.
Make the design clean, modern, and responsive.
Write the code in a sequence that lets the browsr already render something meaningful while it is being transmitted
Feel free to incrementally show the UI.
Imagine you are coding for a demoscene challenge where code should be short and elegant.
Use images from src="https://image.polliations.ai/prompt/[urlencoded prompt]?width=[width]&height=[height]"
`;

// Function to detect if a string contains an HTML tag
function containsHtmlTag(text) {
  return /<(!DOCTYPE|html|head|body|div|p|h[1-6]|span|a|img|ul|ol|li|table|tr|td|th|form|input|button|script|style)\b/i.test(text);
}

// Add a simple test route
app.get('/test', (req, res) => {
  console.log('Test route accessed');
  res.send('HTML wrapper service is running!');
});

// Main route that handles GET requests with the prompt in the path
app.get('/*', async (req, res) => {
  try {
    // Extract the prompt from the path (everything after the first /)
    const prompt = req.path.substring(1);

    if (!prompt) {
      return res.status(400).send('Please provide a prompt in the URL path');
    }

    console.log(`Received prompt: ${prompt}`);
    console.log(`Request headers:`, req.headers);

    // Set up headers for the response
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');

    // Prepare the request to web.pollinations.ai/openai
    const apiResponse = await fetch('https://web.pollinations.ai/openai/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream'
      },
      body: JSON.stringify({
        model: 'openai-large',
        messages: [
          { role: 'system', content: HTML_SYSTEM_PROMPT },
          { role: 'user', content: prompt }
        ],
        stream: true
      })
    });

    if (!apiResponse.ok) {
      throw new Error(`API request failed with status ${apiResponse.status}`);
    }

    // Variables to track state
    let htmlStarted = false;
    let accumulatedHtml = '';
    let docTypeWritten = false;

    // Process the stream using eventsource-parser
    const parser = createParser((event) => {
      if (event.type === 'event') {
        try {
          // Skip empty data or [DONE] messages
          if (!event.data || event.data === '[DONE]') return;

          const data = JSON.parse(event.data);

          if (data.choices && data.choices[0] && data.choices[0].delta && data.choices[0].delta.content) {
            const content = data.choices[0].delta.content;
            accumulatedHtml += content;

            // Check if we've encountered the first HTML tag
            if (!htmlStarted && containsHtmlTag(accumulatedHtml)) {
              htmlStarted = true;

              // If we've found HTML but haven't written the doctype yet, check if it's in the accumulated content
              if (!docTypeWritten) {
                const doctypeIndex = accumulatedHtml.indexOf('<!DOCTYPE html>');
                if (doctypeIndex !== -1) {
                  // Write everything from the doctype onwards
                  res.write(accumulatedHtml.substring(doctypeIndex));
                  docTypeWritten = true;
                } else {
                  // If no doctype found but we have HTML tags, add the doctype and write everything
                  res.write('<!DOCTYPE html>\n' + accumulatedHtml);
                  docTypeWritten = true;
                }
              }
            } else if (htmlStarted && docTypeWritten) {
              // Continue streaming HTML content
              res.write(content);
            }
          }
        } catch (error) {
          console.error('Error parsing SSE data:', error);
          console.error('Problematic data:', event.data);
        }
      }
    });

    // Feed the stream data to the parser
    apiResponse.body.on('data', (chunk) => {
      parser.feed(chunk.toString());
    });

    apiResponse.body.on('end', () => {
      // If we never started streaming HTML (no HTML tags found), send the accumulated content
      if (!htmlStarted && accumulatedHtml) {
        res.write('<!DOCTYPE html>\n<html>\n<body>\n');
        res.write(`<pre>${accumulatedHtml}</pre>`);
        res.write('\n</body>\n</html>');
      }

      res.end();
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).send(`Error: ${error.message}`);
  }
});

app.listen(PORT, () => {
  console.log(`HTML wrapper service running on port ${PORT}`);
});
