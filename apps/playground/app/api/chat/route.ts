import { createPollinations } from 'ai-sdk-pollinations';
import { convertToModelMessages, streamText, UIMessage } from 'ai';
import { NextRequest } from 'next/server';

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const {
      messages,
      model,
      apiKey,
    }: {
      messages: UIMessage[];
      model: string;
      apiKey?: string;
    } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return new Response('Messages array is required', { status: 400 });
    }

    if (!model) {
      return new Response('Model is required', { status: 400 });
    }

    const pollinations = createPollinations({
      apiKey: apiKey || undefined,
    });

    const languageModel = pollinations(model);

    const result = streamText({
      model: languageModel,
      messages: await convertToModelMessages(messages),
      system:
        'You are a helpful assistant that can answer questions and help with tasks.',
    });

    // Send sources and reasoning back to the client
    return result.toUIMessageStreamResponse({
      sendSources: true,
      sendReasoning: true,
    });
  } catch (error) {
    console.error('Chat API error:', error);
    return new Response(
      error instanceof Error ? error.message : 'An error occurred',
      { status: 500 },
    );
  }
}
