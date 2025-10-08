/**
 * Streaming Cache Handler
 * 
 * Provides reusable logic for capturing streaming responses while they flow to the client,
 * then caching them in the background after the stream completes.
 * 
 * This matches the master branch behavior using TransformStream to capture chunks.
 */

export interface StreamingCacheOptions {
	cacheKey: string;
	bucket: R2Bucket;
	executionCtx: ExecutionContext;
	maxSizeBytes?: number;
}

export interface StreamingCacheResult {
	transformedStream: ReadableStream;
	originalHeaders: Headers;
}

/**
 * Determines if a response should be treated as streaming based on Content-Length header
 * Matches master branch logic: no Content-Length OR > 10MB = streaming
 */
export function isStreamingResponse(response: Response, maxSizeBytes = 10 * 1024 * 1024): boolean {
	const contentLength = response.headers.get("content-length");
	return !contentLength || parseInt(contentLength) > maxSizeBytes;
}

/**
 * Wraps a streaming response with a TransformStream that captures chunks for caching
 * while passing them through to the client unchanged.
 * 
 * The cache operation happens in the background after the stream completes.
 */
export function wrapStreamingResponse(
	response: Response,
	options: StreamingCacheOptions,
): StreamingCacheResult {
	if (!response.body) {
		console.log("[STREAMING] No body to stream");
		return {
			transformedStream: new ReadableStream(),
			originalHeaders: response.headers,
		};
	}

	console.log("[STREAMING] Setting up capture stream for cache key:", options.cacheKey);

	// Collect chunks as they pass through
	const chunks: Uint8Array[] = [];
	let totalSize = 0;

	// Create transform stream to capture chunks (matches master branch)
	const captureStream = new TransformStream<Uint8Array, Uint8Array>({
		transform(chunk, controller) {
			// Save a copy of the chunk for caching later
			chunks.push(new Uint8Array(chunk));
			totalSize += chunk.byteLength;

			// Pass the chunk through unchanged to the client
			controller.enqueue(chunk);
		},
		flush() {
			console.log(
				`[STREAMING] 🏁 Stream complete: ${chunks.length} chunks, ${totalSize} bytes`,
			);

			// Cache the response in the background once streaming is done
			options.executionCtx.waitUntil(
				cacheStreamedResponse(chunks, totalSize, options.cacheKey, options.bucket),
			);
		},
	});

	// Pipe the response through our capture stream
	const transformedStream = response.body.pipeThrough(captureStream);

	return {
		transformedStream,
		originalHeaders: response.headers,
	};
}

/**
 * Caches the complete streamed response by combining all chunks into a single buffer
 * This runs in the background after the stream completes
 */
async function cacheStreamedResponse(
	chunks: Uint8Array[],
	totalSize: number,
	cacheKey: string,
	bucket: R2Bucket,
): Promise<void> {
	try {
		// Combine all chunks into a single buffer (matches master branch)
		const completeResponse = new Uint8Array(totalSize);
		let offset = 0;

		for (const chunk of chunks) {
			completeResponse.set(chunk, offset);
			offset += chunk.byteLength;
		}

		console.log(`[STREAMING] 📦 Caching complete response (${totalSize} bytes)`);

		// Store in R2
		await bucket.put(cacheKey, completeResponse);

		console.log(`[STREAMING] ✅ Response cached successfully: ${cacheKey}`);

		// Free memory
		chunks.length = 0;
	} catch (err) {
		console.error("[STREAMING] ❌ Caching failed:", err);
	}
}

/**
 * Caches a non-streaming response immediately
 */
export async function cacheNonStreamingResponse(
	response: Response,
	cacheKey: string,
	bucket: R2Bucket,
): Promise<void> {
	try {
		const responseClone = response.clone();
		const body = await responseClone.arrayBuffer();
		await bucket.put(cacheKey, body);
		console.log(`[STREAMING] ✅ Cached non-streaming response: ${body.byteLength} bytes`);
	} catch (err) {
		console.error("[STREAMING] ❌ Cache error:", err);
	}
}
