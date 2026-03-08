import type { LanguageModelV3Content } from '@ai-sdk/provider';
import { PollinationsResponse } from '../pollinations-types';

/**
 * Shared helper to extract grounded sources from grounding metadata, following
 * the pattern used by the Google Generative AI provider:
 * https://raw.githubusercontent.com/vercel/ai/refs/heads/main/packages/google/src/google-generative-ai-language-model.ts
 */
export function extractGroundingSourcesFromMetadata(
  groundingMetadata: PollinationsResponse['choices'][number]['groundingMetadata'],
  generateId: () => string,
): LanguageModelV3Content[] | undefined {
  const groundingChunks = groundingMetadata?.groundingChunks;
  if (!Array.isArray(groundingChunks) || groundingChunks.length === 0) {
    return undefined;
  }

  const sources: LanguageModelV3Content[] = [];

  for (const chunk of groundingChunks) {
    // Web chunks → URL sources
    if (chunk.web?.uri) {
      sources.push({
        type: 'source',
        sourceType: 'url',
        id: generateId(),
        url: chunk.web.uri,
        title: chunk.web.title ?? undefined,
      });
      continue;
    }

    // Retrieved context chunks (RAG-style)
    if (chunk.retrievedContext) {
      const uri = chunk.retrievedContext.uri as string | null | undefined;
      const fileSearchStore = chunk.retrievedContext.fileSearchStore as
        | string
        | null
        | undefined;

      if (uri && (uri.startsWith('http://') || uri.startsWith('https://'))) {
        // HTTP/HTTPS URL
        sources.push({
          type: 'source',
          sourceType: 'url',
          id: generateId(),
          url: uri,
          title: chunk.retrievedContext.title ?? undefined,
        });
      } else if (uri) {
        // Document path (gs://, etc.) → document source
        const title = chunk.retrievedContext.title ?? 'Unknown Document';
        let mediaType = 'application/octet-stream';
        let filename: string | undefined = uri.split('/').pop();

        if (uri.endsWith('.pdf')) {
          mediaType = 'application/pdf';
        } else if (uri.endsWith('.txt')) {
          mediaType = 'text/plain';
        } else if (uri.endsWith('.docx')) {
          mediaType =
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        } else if (uri.endsWith('.doc')) {
          mediaType = 'application/msword';
        } else if (uri.match(/\.(md|markdown)$/)) {
          mediaType = 'text/markdown';
        }

        sources.push({
          type: 'source',
          sourceType: 'document',
          id: generateId(),
          mediaType,
          title,
          filename,
        });
      } else if (fileSearchStore) {
        // File Search with fileSearchStore (no uri)
        const title = chunk.retrievedContext.title ?? 'Unknown Document';
        const filename = fileSearchStore.split('/').pop();

        sources.push({
          type: 'source',
          sourceType: 'document',
          id: generateId(),
          mediaType: 'application/octet-stream',
          title,
          filename,
        });
      }
      continue;
    }

    // Maps chunks → URL sources
    if (chunk.maps?.uri) {
      sources.push({
        type: 'source',
        sourceType: 'url',
        id: generateId(),
        url: chunk.maps.uri,
        title: chunk.maps.title ?? undefined,
      });
    }
  }

  return sources.length > 0 ? sources : undefined;
}
