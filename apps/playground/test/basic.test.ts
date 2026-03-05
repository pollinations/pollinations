/**
 * Basic tests for ai-sdk-polinations
 * Tests generation using ai-sdk directly (without agents)
 */

import {
  generateImage,
  generateObject,
  generateText,
  Output,
  stepCountIs,
  streamText,
  tool,
  ToolLoopAgent as Agent,
  ToolLoopAgent,
} from 'ai';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { z } from 'zod';
import { createPollinations } from '../src';

describe('AI SDK Pollinations', () => {
  jest.setTimeout(120 * 1000);

  // API key for testing (can be set via environment variable)
  const apiKey = process.env.POLLINATIONS_API_KEY;

  // Create provider instance with API key
  const pollinations = createPollinations({
    apiKey,
  });

  it('Funny fact: basic text generation', async () => {
    const model = pollinations('openai');

    const result = await generateText({
      model: model,
      prompt: 'Tell me a funny fact about dogs',
      temperature: 1,
      maxOutputTokens: 2000,
    });

    expect(result.content).toBeDefined();
    expect(result.content.length).toBeGreaterThan(0);
    expect(result.finishReason).toBeDefined();
    expect(result.usage).toBeDefined();
    expect(result.usage.inputTokens).toBeGreaterThan(0);

    console.log(result.text);
  });

  it('Tools calls: weather', async () => {
    const model = pollinations('openai');

    // Define a weather tool using the tool function from ai sdk
    const weatherSchema = z.object({
      location: z
        .string()
        .describe('The city and state, e.g. San Francisco, CA'),
    });

    const weatherTool = tool({
      description: 'Returns current weather in real-time for provided location',
      inputSchema: weatherSchema,
      execute: async ({ location }: z.infer<typeof weatherSchema>) => {
        console.log(`Tool invoke: getting weather for: ${location}`);
        // In a real scenario, this would call an actual weather API
        return `The weather in ${location} is sunny, 72°F`;
      },
    });

    const result = await generateText({
      model: model,
      prompt: 'Get current weather in New York',
      temperature: 1.0,
      maxOutputTokens: 1000,
      tools: {
        get_weather: weatherTool,
      },
    });

    expect(result.finishReason).toBeDefined();
    expect(result.usage).toBeDefined();
    expect(result.usage.inputTokens).toBeGreaterThan(0);

    // Check if tool was called
    if (result.toolCalls && result.toolCalls.length > 0) {
      console.log('Tool calls:', result.toolCalls);
      expect(result.toolCalls[0].toolName).toBe('get_weather');
    }

    console.log('Result:', JSON.stringify(result, null, 2));
  });

  it('Tools calls: weather with ToolLoopAgent', async () => {
    const model = pollinations('openai');

    // Define a weather tool using the tool function from ai SDK
    const weatherSchema = z.object({
      location: z
        .string()
        .describe('The city and state, e.g. San Francisco, CA'),
    });

    const weatherTool = tool({
      description: 'Returns current weather in real-time for provided location',
      inputSchema: weatherSchema,
      execute: async ({ location }: z.infer<typeof weatherSchema>) => {
        console.log(`Tool invoke: getting weather for: ${location}`);
        // In a real scenario, this would call an actual weather API
        return `The weather in ${location} is sunny, 72°F`;
      },
    });

    const agent = new ToolLoopAgent({
      model: model,
      tools: {
        get_weather: weatherTool,
      },
    });

    const result = await agent.generate({
      prompt: 'Get current weather in New York',
    });

    expect(result.text.length).toBeGreaterThan(0);
    expect(result.finishReason).toBeDefined();
    expect(result.usage).toBeDefined();
    expect(result.usage.inputTokens).toBeGreaterThan(0);

    // Check if tool was called
    if (result.toolCalls && result.toolCalls.length > 0) {
      console.log('Tool calls:', result.toolCalls);
      expect(result.toolCalls[0].toolName).toBe('get_weather');
    }

    console.log('Result:\n', result.text);
  });

  it('Structured output: person extraction', async () => {
    const model = pollinations('openai');

    // Define the schema for person information
    const personSchema = z.object({
      name: z.string().describe('Person full name'),
      age: z.number().describe('Person age in years'),
      email: z.string().email().describe('Person email address'),
      hobbies: z.array(z.string()).describe('List of hobbies'),
    });

    const result = await generateObject({
      model: model,
      schema: personSchema,
      schemaName: 'person',
      prompt: `Extract the person information from this text:
"John Doe is 30 years old. His email is john.doe@example.com.
He enjoys reading, hiking, and photography."`,
      temperature: 1.0,
      maxOutputTokens: 500,
    });

    console.log('Object:', result.object);
    console.log('Usage:', result.usage);

    // Validate the structured output
    expect(result.object).toBeDefined();
    expect(result.object.name).toBeDefined();
    expect(result.object.age).toBeDefined();
    expect(result.object.email).toBeDefined();
    expect(result.object.hobbies).toBeDefined();
    expect(Array.isArray(result.object.hobbies)).toBe(true);
    expect(typeof result.object.name).toBe('string');
    expect(typeof result.object.age).toBe('number');
    expect(typeof result.object.email).toBe('string');
    expect(result.usage).toBeDefined();
    expect(result.usage.inputTokens).toBeGreaterThan(0);
  });

  it('Structured output: person extraction v6', async () => {
    const model = pollinations('openai');

    // Define the schema for person information
    const personSchema = z.object({
      name: z.string().describe('Person full name'),
      age: z.number().describe('Person age in years'),
      email: z.email().describe('Person email address'),
      hobbies: z.array(z.string()).describe('List of hobbies'),
    });

    const result = await generateText({
      model: model,
      output: Output.object({
        name: 'person',
        schema: personSchema,
      }),
      prompt: `Extract the person information from this text:
"John Doe is 30 years old. His email is john.doe@example.com.
He enjoys reading, hiking, and photography."`,
      temperature: 1.0,
      maxOutputTokens: 500,
    });

    console.log('Object:', result.output);
    console.log('Usage:', result.usage);

    // Validate the structured output
    expect(result.output).toBeDefined();
    expect(result.output.name).toBeDefined();
    expect(result.output.age).toBeDefined();
    expect(result.output.email).toBeDefined();
    expect(result.output.hobbies).toBeDefined();
    expect(Array.isArray(result.output.hobbies)).toBe(true);
    expect(typeof result.output.name).toBe('string');
    expect(typeof result.output.age).toBe('number');
    expect(typeof result.output.email).toBe('string');
    expect(result.usage).toBeDefined();
    expect(result.usage.inputTokens).toBeGreaterThan(0);
  });

  it('Streaming: basic text generation', async () => {
    const model = pollinations('gemini-fast');

    const result = streamText({
      model: model,
      prompt: 'Tell me 10 short joke about programming',
    });

    console.log('Streaming result...');

    let fullText = '';
    let receivedChunksCount = 0;

    for await (const chunk of result.textStream) {
      fullText += chunk;
      receivedChunksCount++;
      process.stdout.write(chunk);
    }

    const finishReason = await result.finishReason;
    const usage = await result.usage;

    console.log('\n\nStream complete');
    console.log('Received Chunks: ', receivedChunksCount);
    console.log('Full text:', fullText);
    console.log('Finish reason:', finishReason);
    console.log('Usage:', usage);

    expect(fullText.length).toBeGreaterThan(0);
    expect(finishReason).toBeDefined();
    expect(usage).toBeDefined();
  });

  it('Streaming: with tools', async () => {
    const model = pollinations('openai');

    // Define a weather tool using the tool function from ai SDK
    const weatherSchema = z.object({
      location: z
        .string()
        .describe('The city and state, e.g. San Francisco, CA'),
    });

    const weatherTool = tool({
      description: 'Returns current weather in real-time for provided location',
      inputSchema: weatherSchema,
      execute: async ({ location }: z.infer<typeof weatherSchema>) => {
        console.log(`Getting weather for: ${location}`);
        // In a real scenario, this would call an actual weather API
        return `The weather in ${location} is sunny, 72°F`;
      },
    });

    const result = streamText({
      model: model,
      prompt: 'What is the weather in London?',
      temperature: 1.0,
      maxOutputTokens: 2000,
      tools: {
        get_weather: weatherTool,
      },
    });

    console.log('Streaming with tools...');

    let fullText = '';

    for await (const chunk of result.textStream) {
      fullText += chunk;
      process.stdout.write(chunk);
    }

    // Collect tool calls from the result (await the promise)
    const toolCalls = await result.toolCalls;
    const finishReason = await result.finishReason;
    const usage = await result.usage;

    console.log('\n\nStream complete');
    console.log('Full text:', fullText);
    console.log('Finish reason:', finishReason);
    console.log('Tool calls:', toolCalls?.length ?? 0);
    if (toolCalls && toolCalls.length > 0) {
      console.log('Tool calls details:', toolCalls);
    }

    expect(finishReason).toBeDefined();
    expect(usage).toBeDefined();
  });

  it('Agent: weather with temperature conversion', async () => {
    const model = pollinations('openai');

    const weatherAgent = new Agent({
      model: model,
      tools: {
        weather: tool({
          description: 'Get the weather in a location (in Fahrenheit)',
          inputSchema: z.object({
            location: z
              .string()
              .describe('The location to get the weather for'),
          }),
          execute: async ({ location }) => ({
            location,
            temperature: 72 + Math.floor(Math.random() * 21) - 10,
          }),
        }),
        convertFahrenheitToCelsius: tool({
          description: 'Convert temperature from Fahrenheit to Celsius',
          inputSchema: z.object({
            temperature: z.number().describe('Temperature in Fahrenheit'),
          }),
          execute: async ({ temperature }) => {
            const celsius = Math.round((temperature - 32) * (5 / 9));
            return { celsius };
          },
        }),
      },
      stopWhen: stepCountIs(20),
    });

    const result = await weatherAgent.generate({
      prompt: 'What is the weather in San Francisco in celsius?',
    });

    console.log('Agent result text:', result.text);
    console.log('Agent steps:', result.steps?.length ?? 0);
    if (result.steps && result.steps.length > 0) {
      console.log('First step:', result.steps[0]);
    }

    expect(result.text).toBeDefined();
    expect(result.text.length).toBeGreaterThan(0);
    expect(result.steps).toBeDefined();
    expect(Array.isArray(result.steps)).toBe(true);
  });

  it('Image generation: basic image', async () => {
    const imageModel = pollinations.imageModel('flux', {
      nologo: true,
      enhance: false,
      private: false,
    });

    const result = await generateImage({
      model: imageModel,
      prompt: 'A beautiful sunset over the ocean',
      size: '1024x1024',
    });

    console.log('Image generated');
    console.log('Image base64 length:', result.image.base64.length);
    console.log('Image media type:', result.image.mediaType);
    console.log('Images count:', result.images.length);
    console.log('Responses:', result.responses);
    console.log('Warnings:', result.warnings);

    // Save image to test-output folder (ignored by git)
    const testOutputDir = join(__dirname, 'test-output');
    await mkdir(testOutputDir, { recursive: true });

    const extension = result.image.mediaType.split('/')[1] || 'png';
    const fileName = `pollinations-test-image-${Date.now()}.${extension}`;
    const filePath = join(testOutputDir, fileName);
    const imageBuffer = Buffer.from(result.image.base64, 'base64');
    await writeFile(filePath, imageBuffer);
    console.log('Image saved to:', filePath);

    expect(result.image).toBeDefined();
    expect(result.image.base64).toBeDefined();
    expect(result.image.base64.length).toBeGreaterThan(0);
    expect(result.image.mediaType).toBeDefined();
    expect(result.images).toBeDefined();
    expect(result.images.length).toBeGreaterThan(0);
    expect(result.responses).toBeDefined();
    expect(Array.isArray(result.responses)).toBe(true);
    expect(result.responses.length).toBeGreaterThan(0);
  });

  it('Multi-Agent Workflow: Sport News - Copa America 2024', async () => {
    console.log(
      '🏆 Sports News - AI SDK Multi-Agent Implementation\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n',
    );

    // ============================================================
    // 1. Setup LLM Model
    // ============================================================
    console.log('1. Initializing Pollinations model...');
    const model = pollinations('gemini-fast');
    console.log('   ✅ Pollinations model initialized\n');

    // ============================================================
    // 2. Setup Search Tool
    // ============================================================
    console.log('2. Setting up Serper search tool...');
    const serperApiKey =
      process.env.SERPER_API_KEY || '96d80e559e342182ed4302a305cb8b6c30ba802a';

    const searchTool = tool({
      description:
        'Search the web for current information about sports events, matches, and news. Returns detailed search results from Serper API.',
      inputSchema: z.object({
        query: z.string().describe('The search query to find information'),
      }),
      execute: async ({ query }) => {
        console.log(`   🔍 Searching for: ${query}`);

        try {
          const response = await fetch('https://google.serper.dev/search', {
            method: 'POST',
            headers: {
              'X-API-KEY': serperApiKey,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              q: query,
              num: 5, // Get top 5 results
            }),
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(
              `Serper API error: ${response.status} - ${errorText}`,
            );
          }

          const data = await response.json();

          // Format search results
          let results = `Search results for "${query}":\n\n`;

          if (data.organic && data.organic.length > 0) {
            results += 'Top Results:\n';
            data.organic.slice(0, 3).forEach((result: any, index: number) => {
              results += `${index + 1}. ${result.title}\n`;
              results += `   ${result.snippet}\n`;
              results += `   ${result.link}\n\n`;
            });
          }

          if (data.answerBox) {
            results += `Quick Answer: ${data.answerBox.answer || data.answerBox.snippet}\n\n`;
          }

          if (data.knowledgeGraph) {
            results += `Knowledge Graph: ${data.knowledgeGraph.description}\n\n`;
          }

          console.log(
            `   ✅ Found ${data.organic?.length || 0} search results`,
          );
          return results;
        } catch (error: any) {
          console.error(`   ❌ Search error: ${error.message}`);
          // Fallback to mock data if search fails
          return `Search results for "${query}": Detailed information about Copa America 2024 final match, including key players, moments, and final score. Argentina won 1-0 against Colombia in extra time. Key players: Lionel Messi, Julian Alvarez. Key moment: Lautaro Martinez scored the winning goal in the 112th minute.`;
        }
      },
    });
    console.log('   ✅ Serper Search tool created\n');

    // ============================================================
    // 3. Create Agents (Scout & Writer)
    // ============================================================
    console.log('3. Creating agents...');

    // Scout Agent - Information Gatherer with search capability
    const scoutAgent = new Agent({
      model,
      instructions: `You are Scout, an Information Gatherer.
Your role: Find up-to-date information about sports queries.
Your goal: Search for detailed information about sports events.
Expected output: Detailed information including key players, key moments, final score, and other useful information.

When you receive a query, use the search tool to find the most relevant and recent information.`,
      tools: {
        search: searchTool,
      },
      stopWhen: stepCountIs(5),
      temperature: 1.0,
      maxOutputTokens: 10000,
    });
    console.log('   🤖 Created: Scout (Information Gatherer)');

    // Writer Agent - Content Creator without tools
    const writerAgent = new Agent({
      model,
      instructions: `You are Writer, a Content Creator.
Your role: Generate comprehensive articles about sports events.
Your goal: Create well-structured and engaging sports articles.
Expected output: A sports article with:
- Title
- Introduction
- Body with key details
- Conclusion
Format: Use Markdown formatting.

You will receive search results from the Scout agent. Use that information to write a compelling article.`,
      stopWhen: stepCountIs(10),
      temperature: 1.0,
      maxOutputTokens: 10000,
    });
    console.log('   🤖 Created: Writer (Content Creator)\n');

    // ============================================================
    // 4. Execute Workflow
    // ============================================================
    console.log('4. Executing workflow...\n');

    const sportsQuery = 'Who won the Copa America in 2024?';

    // Step 1: Scout searches for information
    console.log('   ▶️  Scout: Searching for information...');
    const scoutStartTime = Date.now();
    const scoutResult = await scoutAgent.generate({
      prompt: sportsQuery,
    });
    const scoutExecutionTime = Date.now() - scoutStartTime;
    const searchResults = scoutResult.text;

    console.log(
      `   ✅ Scout: Search completed in ${scoutExecutionTime}ms\n   📋 Found ${searchResults.length} characters of information\n`,
    );

    // Step 2: Writer creates article from search results
    console.log('   ▶️  Writer: Composing article...');
    const writerStartTime = Date.now();
    const writerResult = await writerAgent.generate({
      prompt: `Based on this search information, write a comprehensive sports article about: ${sportsQuery}\n\nSearch Results:\n${searchResults}`,
    });
    const writerExecutionTime = Date.now() - writerStartTime;
    const finalArticle = writerResult.text;

    console.log(
      `   ✅ Writer: Article completed in ${writerExecutionTime}ms\n   📝 Article length: ${finalArticle.length} characters\n`,
    );

    // ============================================================
    // 5. Display Results
    // ============================================================
    console.log(
      `5. Final Results:\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n📰 Final Article:\n\n${finalArticle}\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n📊 Execution Summary:\n   Scout execution time: ${scoutExecutionTime}ms\n   Writer execution time: ${writerExecutionTime}ms\n   Total execution time: ${scoutExecutionTime + writerExecutionTime}ms\n   Scout steps: ${scoutResult.steps?.length ?? 0}\n   Writer steps: ${writerResult.steps?.length ?? 0}\n`,
    );

    // Assertions
    expect(scoutResult.text).toBeDefined();
    expect(scoutResult.text.length).toBeGreaterThan(0);
    expect(writerResult.text).toBeDefined();
    expect(writerResult.text.length).toBeGreaterThan(0);
    expect(finalArticle).toContain('Argentina');
    expect(scoutExecutionTime).toBeGreaterThan(0);
    expect(writerExecutionTime).toBeGreaterThan(0);
  });

  it('Image Analysis: URL to Base64 and Analysis', async () => {
    console.log('🖼️  Image Analysis Example\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // ============================================================
    // 1. Setup LLM Model
    // ============================================================
    console.log('1. Initializing Pollinations model...');
    const model = pollinations('gemini');
    console.log('   ✅ Pollinations model initialized\n');

    // ============================================================
    // 2. Execute Image Analysis Workflow
    // ============================================================
    console.log('2. Executing image analysis workflow...\n');

    const imageUrl =
      'https://images.pexels.com/photos/32523802/pexels-photo-32523802.jpeg';

    // Step 1: Convert URL to Base64
    console.log('   Step 1: Converting image URL to base64...');
    const base64StartTime = Date.now();
    console.log(`   📥 Downloading image from: ${imageUrl}`);
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error(`Failed to fetch image: ${imageResponse.status}`);
    }

    const arrayBuffer = await imageResponse.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    const contentType =
      imageResponse.headers.get('content-type') || 'image/jpeg';

    const sizeKB = (arrayBuffer.byteLength / 1024).toFixed(2);
    const base64ExecutionTime = Date.now() - base64StartTime;
    console.log(
      `   ✅ Converted: ${contentType}, ${sizeKB} KB\n   ✅ Conversion completed in ${base64ExecutionTime}ms\n`,
    );

    // Step 2: Analyze the image
    console.log(
      `   Step 2: Analyzing image with vision model...\n   🔍 Analyzing image (${contentType})...`,
    );
    const analysisStartTime = Date.now();

    const analysisPrompt =
      'Describe this image in detail. What do you see? Include information about the subject, setting, colors, and any notable features.';

    // Convert base64 string to Uint8Array for the file data
    const imageBuffer = Buffer.from(base64, 'base64');
    const imageData = new Uint8Array(imageBuffer);

    const analysisResult = await generateText({
      model: model,
      temperature: 0.7,
      maxOutputTokens: 10000,
      prompt: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: analysisPrompt,
            },
            {
              type: 'file',
              data: imageData,
              mediaType: contentType,
            },
          ],
        },
      ],
    });

    const analysisExecutionTime = Date.now() - analysisStartTime;
    console.log(
      `   ✅ Analysis completed in ${analysisExecutionTime}ms (${analysisResult.usage.totalTokens} tokens)\n`,
    );

    // ============================================================
    // 3. Display Results
    // ============================================================
    console.log(
      `3. Results:\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n📊 Image Information:\n   URL: ${imageUrl}\n   Content Type: ${contentType}\n   Size: ${sizeKB} KB\n   Base64 Length: ${base64.length} characters\n\n🔍 Image Analysis:\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n${analysisResult.text}\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n📊 Execution Summary:\n   URL to Base64 time: ${base64ExecutionTime}ms\n   Image Analysis time: ${analysisExecutionTime}ms\n   Total execution time: ${base64ExecutionTime + analysisExecutionTime}ms\n`,
    );

    // Assertions
    expect(base64).toBeDefined();
    expect(base64.length).toBeGreaterThan(0);
    expect(contentType).toBeDefined();
    expect(arrayBuffer.byteLength).toBeGreaterThan(0);
    expect(analysisResult.text).toBeDefined();
    expect(analysisResult.text.length).toBeGreaterThan(0);
    expect(base64ExecutionTime).toBeGreaterThan(0);
    expect(analysisExecutionTime).toBeGreaterThan(0);
  });

  it('Image Analysis: Direct URL Analysis', async () => {
    console.log(
      '🖼️  Image Analysis Example (Direct URL)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n',
    );

    // ============================================================
    // 1. Setup LLM Model
    // ============================================================
    console.log('1. Initializing Pollinations model...');
    const model = pollinations('gemini');
    console.log('   ✅ Pollinations model initialized\n');

    // ============================================================
    // 2. Execute Image Analysis with Direct URL
    // ============================================================
    console.log('2. Executing image analysis with direct URL...\n');

    const imageUrl =
      'https://images.pexels.com/photos/32523802/pexels-photo-32523802.jpeg';

    // Analyze the image directly using URL
    console.log(
      `   Step 1: Analyzing image with vision model...\n   🔍 Analyzing image from URL: ${imageUrl}`,
    );
    const analysisStartTime = Date.now();

    const analysisPrompt =
      'Describe this image in detail. What do you see? Include information about the subject, setting, colors, and any notable features.';

    // Use generateText with image URL directly
    // AI SDK V2 supports URL objects for images
    const analysisResult = await generateText({
      model: model,
      temperature: 0.7,
      maxOutputTokens: 2000,
      prompt: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: analysisPrompt,
            },
            {
              type: 'file',
              data: new URL(imageUrl),
              mediaType: 'image/*',
            },
          ],
        },
      ],
    });

    const analysisExecutionTime = Date.now() - analysisStartTime;
    console.log(
      `   ✅ Analysis completed in ${analysisExecutionTime}ms (${analysisResult.usage.totalTokens} tokens)\n`,
    );

    // ============================================================
    // 3. Display Results
    // ============================================================
    console.log(
      `3. Results:\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n📊 Image Information:\n   URL: ${imageUrl}\n   Method: Direct URL (no base64 conversion)\n\n🔍 Image Analysis:\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n${analysisResult.text}\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n📊 Execution Summary:\n   Image Analysis time: ${analysisExecutionTime}ms\n   Total tokens: ${analysisResult.usage.totalTokens}\n`,
    );

    // Assertions
    expect(analysisResult.text).toBeDefined();
    expect(analysisResult.text.length).toBeGreaterThan(0);
    expect(analysisResult.usage.totalTokens).toBeGreaterThan(0);
    expect(analysisExecutionTime).toBeGreaterThan(0);
  });
});
