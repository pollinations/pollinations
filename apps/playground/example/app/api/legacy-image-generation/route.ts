import { generateImage } from 'ai';
import { createPollinations } from 'ai-sdk-pollinations';
import { NextResponse } from 'next/server';

export const runtime = 'edge';

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const pollinations = createPollinations({
      useLegacyUrls: true,
    });
    const { model: modelId, prompt, ...rest } = body;
    const model = pollinations.imageModel(modelId);

    const result = await generateImage({
      model,
      prompt,
      ...rest,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'An error occurred' },
      { status: 500 },
    );
  }
}
