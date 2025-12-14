/**
 * Fix for Issue #5909: High error rate on event delivery
 * 
 * Problem: Many events are not being delivered, likely due to rate limiting.
 * Solution: Add a small delay between delivery attempts to mitigate rate limiting.
 * 
 * IMPORTANT: This solution distinguishes between:
 * - Rate limiting (429): Uses delay to respect limits
 * - Network overload (503, 502, timeout): Minimal/no delay to avoid bottlenecks
 * 
 * This file demonstrates the fix that should be applied to the Pollinations repository.
 */

interface EventDeliveryOptions {
  maxRetries?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffMultiplier?: number;
  jitter?: boolean;
  requestTimeout?: number;
  maxQueueSize?: number;
  circuitBreakerThreshold?: number;
  circuitBreakerResetTime?: number;
}

export enum ErrorType {
  RATE_LIMIT = 'RATE_LIMIT',           // 429 - Needs delay
  NETWORK_OVERLOAD = 'NETWORK_OVERLOAD', // 503, 502, timeout - Minimal delay
  CLIENT_ERROR = 'CLIENT_ERROR',       // 4xx (except 429) - No retry
  SERVER_ERROR = 'SERVER_ERROR',       // 5xx (except 503/502) - Short delay
  NETWORK_ERROR = 'NETWORK_ERROR',     // Connection errors - Minimal delay
}

interface CircuitBreakerState {
  failures: number;
  lastFailureTime: number;
  isOpen: boolean;
}

interface Event {
  id: string;
  type: string;
  payload: any;
  timestamp: number;
}

class EventDeliveryService {
  private deliveryQueue: Event[] = [];
  private isProcessing: boolean = false;
  private options: Required<EventDeliveryOptions>;
  private circuitBreaker: CircuitBreakerState;
  private abortControllers: Map<string, AbortController> = new Map();

  constructor(options: EventDeliveryOptions = {}) {
    this.options = {
      maxRetries: options.maxRetries ?? 3,
      initialDelay: options.initialDelay ?? 1000, // 1 second initial delay
      maxDelay: options.maxDelay ?? 10000, // 10 seconds max delay
      backoffMultiplier: options.backoffMultiplier ?? 2,
      jitter: options.jitter ?? true,
      requestTimeout: options.requestTimeout ?? 5000, // 5 seconds timeout
      maxQueueSize: options.maxQueueSize ?? 1000, // Max queue size to prevent memory issues
      circuitBreakerThreshold: options.circuitBreakerThreshold ?? 5, // Open after 5 failures
      circuitBreakerResetTime: options.circuitBreakerResetTime ?? 30000, // Reset after 30s
    };
    
    this.circuitBreaker = {
      failures: 0,
      lastFailureTime: 0,
      isOpen: false,
    };
  }

  /**
   * Add event to delivery queue with automatic retry logic
   */
  async deliverEvent(event: Event): Promise<boolean> {
    return this.deliverWithRetry(event, 0);
  }

  /**
   * Deliver event with intelligent retry based on error type
   */
  private async deliverWithRetry(event: Event, attempt: number): Promise<boolean> {
    if (attempt >= this.options.maxRetries) {
      console.error(`[EventDelivery] Max retries reached for event ${event.id}`);
      this.recordFailure();
      return false;
    }

    // Check circuit breaker
    if (this.isCircuitBreakerOpen()) {
      console.warn(`[EventDelivery] Circuit breaker is OPEN, rejecting event ${event.id}`);
      return false;
    }

    // Add delay before retry (except for first attempt)
    // Delay is determined by error type from previous attempt
    if (attempt > 0) {
      const errorType = this.getLastErrorType(event.id);
      let delay = this.calculateDelayForErrorType(errorType, attempt - 1);
      
      // Apply jitter if enabled
      if (this.options.jitter && delay > 0) {
        delay = this.addJitter(delay);
      }
      
      if (delay > 0) {
        console.log(`[EventDelivery] Waiting ${delay}ms before retry ${attempt + 1}/${this.options.maxRetries} for event ${event.id} (error type: ${errorType})`);
        await this.sleep(delay);
      } else if (errorType === ErrorType.NETWORK_OVERLOAD) {
        // Network overload - minimal delay to avoid bottleneck
        console.log(`[EventDelivery] Network overload detected, using minimal delay for event ${event.id}`);
        await this.sleep(50); // Very short delay
      }
    }

    try {
      const success = await this.attemptDelivery(event);
      
      if (success) {
        console.log(`[EventDelivery] Successfully delivered event ${event.id} on attempt ${attempt + 1}`);
        this.recordSuccess();
        // Clear error type cache on success
        this.errorTypeCache.delete(event.id);
        return true;
      }
      // attemptDelivery always returns true or throws, so this should never be reached
      // But kept for safety
      return false;
    } catch (error: any) {
      const errorType = this.classifyError(error);
      this.storeErrorType(event.id, errorType);
      
      // Different strategies based on error type
      switch (errorType) {
        case ErrorType.RATE_LIMIT:
          // Rate limiting: Use delay to respect limits
          console.warn(`[EventDelivery] Rate limit hit for event ${event.id}, will retry with delay`);
          // Delay will be applied at the start of next retry attempt
          return this.deliverWithRetry(event, attempt + 1);
          
        case ErrorType.NETWORK_OVERLOAD:
          // Network overload: Minimal delay to avoid creating bottleneck
          console.warn(`[EventDelivery] Network overload for event ${event.id}, minimal delay to avoid bottleneck`);
          this.recordFailure();
          // Delay will be applied at the start of next retry attempt (minimal)
          return this.deliverWithRetry(event, attempt + 1);
          
        case ErrorType.CLIENT_ERROR:
          // Client errors (4xx except 429): Don't retry
          console.error(`[EventDelivery] Client error for event ${event.id}, not retrying`);
          this.recordFailure();
          return false;
          
        case ErrorType.SERVER_ERROR:
          // Server errors (5xx except 503/502): Short delay
          console.warn(`[EventDelivery] Server error for event ${event.id}, will retry with short delay`);
          // Delay will be applied at the start of next retry attempt
          return this.deliverWithRetry(event, attempt + 1);
          
        case ErrorType.NETWORK_ERROR:
          // Network errors: Minimal delay
          console.warn(`[EventDelivery] Network error for event ${event.id}, minimal delay`);
          this.recordFailure();
          // Delay will be applied at the start of next retry attempt
          return this.deliverWithRetry(event, attempt + 1);
          
        default:
          // Unknown error: Use normal delay
          console.error(`[EventDelivery] Unknown error delivering event ${event.id}:`, error.message);
          this.recordFailure();
          return this.deliverWithRetry(event, attempt + 1);
      }
    }
  }

  /**
   * Calculate delay based on attempt number (exponential backoff)
   */
  private calculateDelay(attempt: number): number {
    const delay = this.options.initialDelay * Math.pow(this.options.backoffMultiplier, attempt);
    return Math.min(delay, this.options.maxDelay);
  }

  /**
   * Add jitter to prevent thundering herd problem
   */
  private addJitter(delay: number): number {
    const jitterAmount = delay * 0.1; // 10% jitter
    const jitter = (Math.random() * 2 - 1) * jitterAmount;
    return Math.max(0, delay + jitter);
  }

  /**
   * Classify error type to determine retry strategy
   */
  private classifyError(error: any): ErrorType {
    if (!error) return ErrorType.NETWORK_ERROR;
    
    const errorMessage = error.message?.toLowerCase() || '';
    const statusCode = error.status || error.statusCode || error.code;
    
    // Rate limiting (429)
    if (
      statusCode === 429 ||
      errorMessage.includes('rate limit') ||
      errorMessage.includes('too many requests') ||
      errorMessage.includes('429') ||
      errorMessage.includes('quota exceeded')
    ) {
      return ErrorType.RATE_LIMIT;
    }
    
    // Network overload (503, 502, timeout)
    if (
      statusCode === 503 ||
      statusCode === 502 ||
      statusCode === 504 ||
      errorMessage.includes('timeout') ||
      errorMessage.includes('503') ||
      errorMessage.includes('502') ||
      errorMessage.includes('504') ||
      errorMessage.includes('service unavailable') ||
      errorMessage.includes('bad gateway') ||
      errorMessage.includes('gateway timeout')
    ) {
      return ErrorType.NETWORK_OVERLOAD;
    }
    
    // Client errors (4xx except 429)
    if (statusCode >= 400 && statusCode < 500) {
      return ErrorType.CLIENT_ERROR;
    }
    
    // Server errors (5xx except 503/502/504)
    if (statusCode >= 500 && statusCode < 600) {
      return ErrorType.SERVER_ERROR;
    }
    
    // Network/connection errors
    if (
      errorMessage.includes('network') ||
      errorMessage.includes('connection') ||
      errorMessage.includes('failed to fetch') ||
      errorMessage.includes('networkerror') ||
      error.name === 'TypeError' // Often network errors
    ) {
      return ErrorType.NETWORK_ERROR;
    }
    
    return ErrorType.NETWORK_ERROR;
  }

  /**
   * Store error type for this event (to determine delay strategy)
   */
  private errorTypeCache: Map<string, ErrorType> = new Map();
  
  private storeErrorType(eventId: string, errorType: ErrorType): void {
    this.errorTypeCache.set(eventId, errorType);
    // Clean up after 1 minute
    setTimeout(() => this.errorTypeCache.delete(eventId), 60000);
  }
  
  private getLastErrorType(eventId: string): ErrorType {
    return this.errorTypeCache.get(eventId) || ErrorType.NETWORK_ERROR;
  }

  /**
   * Calculate delay based on error type
   */
  private calculateDelayForErrorType(errorType: ErrorType, attempt: number): number {
    switch (errorType) {
      case ErrorType.RATE_LIMIT:
        // Rate limiting: Full exponential backoff with multiplier
        return Math.min(
          this.calculateDelay(attempt) * 1.5,
          this.options.maxDelay
        );
        
      case ErrorType.NETWORK_OVERLOAD:
        // Network overload: Minimal delay to avoid bottleneck
        return 0; // No delay, or very minimal (handled separately)
        
      case ErrorType.SERVER_ERROR:
        // Server errors: Half delay
        return this.calculateDelay(attempt) * 0.5;
        
      case ErrorType.NETWORK_ERROR:
        // Network errors: Short delay
        return Math.min(this.calculateDelay(attempt) * 0.3, 2000);
        
      case ErrorType.CLIENT_ERROR:
        // Client errors: No retry (should not reach here)
        return 0;
        
      default:
        return this.calculateDelay(attempt);
    }
  }

  /**
   * Circuit breaker pattern to prevent cascading failures
   */
  private recordFailure(): void {
    this.circuitBreaker.failures++;
    this.circuitBreaker.lastFailureTime = Date.now();
    
    if (this.circuitBreaker.failures >= this.options.circuitBreakerThreshold) {
      this.circuitBreaker.isOpen = true;
      console.error(`[EventDelivery] Circuit breaker OPENED after ${this.circuitBreaker.failures} failures`);
      
      // Auto-reset after reset time
      setTimeout(() => {
        this.circuitBreaker.isOpen = false;
        this.circuitBreaker.failures = 0;
        console.log('[EventDelivery] Circuit breaker CLOSED (auto-reset)');
      }, this.options.circuitBreakerResetTime);
    }
  }
  
  private recordSuccess(): void {
    // Reset failure count on success
    if (this.circuitBreaker.failures > 0) {
      this.circuitBreaker.failures = Math.max(0, this.circuitBreaker.failures - 1);
    }
    
    // Close circuit breaker if it was open
    if (this.circuitBreaker.isOpen) {
      this.circuitBreaker.isOpen = false;
      console.log('[EventDelivery] Circuit breaker CLOSED (success detected)');
    }
  }
  
  private isCircuitBreakerOpen(): boolean {
    // Check if we should reset (time-based)
    if (this.circuitBreaker.isOpen) {
      const timeSinceLastFailure = Date.now() - this.circuitBreaker.lastFailureTime;
      if (timeSinceLastFailure > this.options.circuitBreakerResetTime) {
        this.circuitBreaker.isOpen = false;
        this.circuitBreaker.failures = 0;
        return false;
      }
    }
    
    return this.circuitBreaker.isOpen;
  }

  /**
   * Attempt to deliver a single event with timeout
   */
  private async attemptDelivery(event: Event): Promise<boolean> {
    // Create abort controller for timeout
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => {
      abortController.abort();
    }, this.options.requestTimeout);
    
    this.abortControllers.set(event.id, abortController);
    
    try {
      // TODO: Replace with actual Pollinations event delivery API call
      const response = await fetch('https://api.pollinations.ai/events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(event),
        signal: abortController.signal,
      });

      clearTimeout(timeoutId);
      this.abortControllers.delete(event.id);

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        const error: any = new Error(`HTTP ${response.status}: ${errorText}`);
        error.status = response.status;
        throw error;
      }

      return true;
    } catch (error: any) {
      clearTimeout(timeoutId);
      this.abortControllers.delete(event.id);
      
      // Handle timeout/abort
      if (error.name === 'AbortError' || error.message?.includes('timeout')) {
        const timeoutError: any = new Error('Request timeout');
        timeoutError.status = 504;
        throw timeoutError;
      }
      
      throw error;
    }
  }

  /**
   * Process delivery queue with adaptive delay based on error types
   */
  async processQueue(): Promise<void> {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    while (this.deliveryQueue.length > 0) {
      const event = this.deliveryQueue.shift();
      if (!event) break;

      // Check circuit breaker before processing
      if (this.isCircuitBreakerOpen()) {
        console.warn('[EventDelivery] Circuit breaker open, pausing queue processing');
        // Wait before checking again
        await this.sleep(this.options.circuitBreakerResetTime);
        // Re-add event to front of queue
        this.deliveryQueue.unshift(event);
        continue;
      }

      await this.deliverEvent(event);

      // Adaptive delay between events based on recent error types
      if (this.deliveryQueue.length > 0) {
        const lastErrorType = this.getLastErrorType(event.id);
        
        // Only add delay if it was rate limiting
        // For network overload, process quickly to avoid bottleneck
        if (lastErrorType === ErrorType.RATE_LIMIT) {
          await this.sleep(this.options.initialDelay);
        } else if (lastErrorType === ErrorType.NETWORK_OVERLOAD) {
          // Minimal delay for network overload
          await this.sleep(50);
        } else {
          // Short delay for other cases
          await this.sleep(200);
        }
      }
    }

    this.isProcessing = false;
  }

  /**
   * Add event to queue for batch processing
   */
  queueEvent(event: Event): void {
    // Prevent queue from growing too large (memory protection)
    if (this.deliveryQueue.length >= this.options.maxQueueSize) {
      console.warn(`[EventDelivery] Queue full (${this.options.maxQueueSize}), dropping oldest event`);
      this.deliveryQueue.shift(); // Remove oldest
    }
    
    this.deliveryQueue.push(event);
    
    // Auto-start processing if not already running
    if (!this.isProcessing) {
      this.processQueue().catch(error => {
        console.error('[EventDelivery] Error processing queue:', error);
        this.isProcessing = false;
      });
    }
  }
  
  /**
   * Get queue status
   */
  getQueueStatus(): { size: number; isProcessing: boolean; circuitBreakerOpen: boolean } {
    return {
      size: this.deliveryQueue.length,
      isProcessing: this.isProcessing,
      circuitBreakerOpen: this.isCircuitBreakerOpen(),
    };
  }
  
  /**
   * Clear queue (useful for cleanup)
   */
  clearQueue(): void {
    this.deliveryQueue = [];
    // Cancel all pending requests
    this.abortControllers.forEach(controller => controller.abort());
    this.abortControllers.clear();
  }

  /**
   * Utility: Sleep function
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export for use in Pollinations codebase
export default EventDeliveryService;

/**
 * Example usage:
 * 
 * const deliveryService = new EventDeliveryService({
 *   maxRetries: 3,
 *   initialDelay: 1000, // 1 second
 *   maxDelay: 10000,    // 10 seconds max
 *   backoffMultiplier: 2,
 *   jitter: true
 * });
 * 
 * // Deliver single event
 * await deliveryService.deliverEvent({
 *   id: 'event-123',
 *   type: 'user_action',
 *   payload: { action: 'click' },
 *   timestamp: Date.now()
 * });
 * 
 * // Or queue for batch processing
 * deliveryService.queueEvent({
 *   id: 'event-124',
 *   type: 'user_action',
 *   payload: { action: 'view' },
 *   timestamp: Date.now()
 * });
 */
