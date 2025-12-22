/**
 * Real-time feed subscriptions for Pollinations
 * Uses Server-Sent Events (SSE) to stream live generation events
 */

import type { ImageFeedEvent, TextFeedEvent, FeedOptions } from './types.js';

const IMAGE_FEED_URL = 'https://image.pollinations.ai/feed';
const TEXT_FEED_URL = 'https://text.pollinations.ai/feed';

/** Feed subscription that can be closed */
export interface FeedSubscription {
  /** Close the feed connection */
  close: () => void;
}

/**
 * Subscribe to the real-time image generation feed
 *
 * @example
 * ```ts
 * const feed = subscribeToImageFeed((event) => {
 *   console.log('New image:', event.prompt);
 *   console.log('URL:', event.imageURL);
 * });
 *
 * // Later: close the connection
 * feed.close();
 * ```
 */
export function subscribeToImageFeed(
  onEvent: (event: ImageFeedEvent) => void,
  options?: FeedOptions & {
    onError?: (error: Error) => void;
    onOpen?: () => void;
  }
): FeedSubscription {
  const params = new URLSearchParams();
  if (options?.password) {
    params.set('password', options.password);
  }
  if (options?.pastResults !== undefined) {
    params.set('past_results', String(options.pastResults));
  }

  const url = params.toString() ? `${IMAGE_FEED_URL}?${params}` : IMAGE_FEED_URL;
  const eventSource = new EventSource(url);

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data) as ImageFeedEvent;
      // Only emit completed generations
      if (data.imageURL && data.status === 'end_generating') {
        onEvent(data);
      }
    } catch {
      // Skip invalid JSON
    }
  };

  eventSource.onerror = () => {
    options?.onError?.(new Error('Image feed connection error'));
  };

  eventSource.onopen = () => {
    options?.onOpen?.();
  };

  return {
    close: () => eventSource.close(),
  };
}

/**
 * Subscribe to the real-time text generation feed
 *
 * @example
 * ```ts
 * const feed = subscribeToTextFeed((event) => {
 *   console.log('Model:', event.parameters.model);
 *   console.log('Response:', event.response.slice(0, 100));
 * });
 *
 * // Later: close the connection
 * feed.close();
 * ```
 */
export function subscribeToTextFeed(
  onEvent: (event: TextFeedEvent) => void,
  options?: FeedOptions & {
    onError?: (error: Error) => void;
    onOpen?: () => void;
  }
): FeedSubscription {
  const params = new URLSearchParams();
  if (options?.password) {
    params.set('password', options.password);
  }

  const url = params.toString() ? `${TEXT_FEED_URL}?${params}` : TEXT_FEED_URL;
  const eventSource = new EventSource(url);

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data) as TextFeedEvent;
      if (data.response) {
        onEvent(data);
      }
    } catch {
      // Skip invalid JSON
    }
  };

  eventSource.onerror = () => {
    options?.onError?.(new Error('Text feed connection error'));
  };

  eventSource.onopen = () => {
    options?.onOpen?.();
  };

  return {
    close: () => eventSource.close(),
  };
}

/**
 * Create an async iterator for the image feed
 *
 * @example
 * ```ts
 * for await (const event of imageFeed()) {
 *   console.log('New image:', event.prompt);
 *   if (someCondition) break; // stops the feed
 * }
 * ```
 */
export async function* imageFeed(
  options?: FeedOptions
): AsyncGenerator<ImageFeedEvent> {
  const params = new URLSearchParams();
  if (options?.password) {
    params.set('password', options.password);
  }
  if (options?.pastResults !== undefined) {
    params.set('past_results', String(options.pastResults));
  }

  const url = params.toString() ? `${IMAGE_FEED_URL}?${params}` : IMAGE_FEED_URL;

  // Use fetch with streaming for async iteration
  const response = await fetch(url, {
    headers: { 'Accept': 'text/event-stream' },
  });

  if (!response.ok) {
    throw new Error(`Failed to connect to image feed: ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('No response body');
  }

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('data: ')) {
          try {
            const data = JSON.parse(trimmed.slice(6)) as ImageFeedEvent;
            if (data.imageURL && data.status === 'end_generating') {
              yield data;
            }
          } catch {
            // Skip invalid JSON
          }
        }
      }
    }
  } finally {
    reader.cancel();
  }
}

/**
 * Create an async iterator for the text feed
 *
 * @example
 * ```ts
 * for await (const event of textFeed()) {
 *   console.log('Model:', event.parameters.model);
 *   if (someCondition) break; // stops the feed
 * }
 * ```
 */
export async function* textFeed(
  options?: FeedOptions
): AsyncGenerator<TextFeedEvent> {
  const params = new URLSearchParams();
  if (options?.password) {
    params.set('password', options.password);
  }

  const url = params.toString() ? `${TEXT_FEED_URL}?${params}` : TEXT_FEED_URL;

  const response = await fetch(url, {
    headers: { 'Accept': 'text/event-stream' },
  });

  if (!response.ok) {
    throw new Error(`Failed to connect to text feed: ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('No response body');
  }

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('data: ')) {
          try {
            const data = JSON.parse(trimmed.slice(6)) as TextFeedEvent;
            if (data.response) {
              yield data;
            }
          } catch {
            // Skip invalid JSON
          }
        }
      }
    }
  } finally {
    reader.cancel();
  }
}
