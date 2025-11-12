import { DurableObject } from "cloudflare:workers";
import { getLogger } from "@logtape/logtape";

/**
 * RequestDeduplicator Durable Object
 *
 * Prevents duplicate requests from hitting the backend by tracking inflight requests.
 * When multiple identical requests arrive concurrently, only the first one proceeds
 * to the backend - others wait for and share the same response.
 *
 * Design:
 * - In-memory Map tracks inflight requests by key
 * - Same key = same DO instance (guaranteed by Cloudflare)
 * - Automatic cleanup when request completes
 * - Response cloning for concurrent consumers
 *
 * Use cases:
 * - Browser duplicate image requests (ORB error prevention)
 * - Concurrent requests for same resource
 * - Cache stampede prevention
 */
export class RequestDeduplicator extends DurableObject {
	private inflightRequests = new Map<string, Promise<Response>>();
	private readonly log = getLogger(["durable", "deduplicator"]);

	/**
	 * Deduplicate a request by key
	 * @param key - Unique identifier for the request (e.g., URL hash)
	 * @param handler - Function that executes the actual request
	 * @returns Response (either from handler or shared from inflight request)
	 */
	async deduplicate(
		key: string,
		handler: () => Promise<Response>,
	): Promise<Response> {
		// Check if request already in flight
		if (this.inflightRequests.has(key)) {
			this.log.debug("[DEDUP] Waiting for inflight request: {key}", {
				key,
			});
			const existingPromise = this.inflightRequests.get(key)!;
			const response = await existingPromise;
			return response.clone(); // Clone so body can be read multiple times
		}

		// Start new request
		this.log.debug("[DEDUP] Starting new request: {key}", { key });
		const promise = handler().then((response) => {
			// Clone immediately so the original can be consumed
			// Store the clone for future duplicate requests
			return response.clone();
		});
		this.inflightRequests.set(key, promise);

		// Cleanup after completion (success or failure)
		promise.finally(() => {
			this.inflightRequests.delete(key);
			this.log.debug("[DEDUP] Cleaned up request: {key}", { key });
		});

		const response = await promise;
		// Return another clone for this request
		return response.clone();
	}

	/**
	 * Get current inflight request count (for monitoring/debugging)
	 */
	async getInflightCount(): Promise<number> {
		return this.inflightRequests.size;
	}
}
