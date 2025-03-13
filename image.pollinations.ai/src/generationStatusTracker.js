import debug from 'debug';

const logStatus = debug('pollinations:status');

/**
 * Status tracker for image generation processes
 * Ensures that multiple requests for the same image get consistent results
 */
class GenerationStatusTracker {
  constructor() {
    this.inProgressGenerations = new Map();
    this.completedGenerations = new Map();
    
    // Cleanup completed generations after 1 hour
    setInterval(() => {
      const now = Date.now();
      for (const [key, data] of this.completedGenerations.entries()) {
        if (now - data.completedAt > 3600000) {
          this.completedGenerations.delete(key);
          logStatus(`Removed expired completed generation: ${key}`);
        }
      }
    }, 300000); // Check every 5 minutes
  }

  /**
   * Generate a unique key for tracking based on prompt and parameters
   * @param {string} prompt - The image prompt
   * @param {Object} params - Generation parameters
   * @returns {string} The unique tracking key
   */
  generateKey(prompt, params) {
    return `${prompt}_${JSON.stringify(params)}`;
  }

  /**
   * Start tracking a new generation process
   * @param {string} prompt - The image prompt
   * @param {Object} params - Generation parameters
   * @param {string} requestId - The unique request ID
   * @returns {Object} Status object with tracking info
   */
  startGeneration(prompt, params, requestId) {
    const key = this.generateKey(prompt, params);
    
    // Check if generation is already in progress
    if (this.inProgressGenerations.has(key)) {
      logStatus(`Generation already in progress for ${key}, attaching to existing process`);
      return { 
        key, 
        status: 'in_progress',
        alreadyInProgress: true,
        existingData: this.inProgressGenerations.get(key)
      };
    }
    
    // Check if generation is already completed
    if (this.completedGenerations.has(key)) {
      logStatus(`Generation already completed for ${key}, returning cached result`);
      return {
        key,
        status: 'completed',
        alreadyCompleted: true,
        result: this.completedGenerations.get(key)
      };
    }
    
    // Start new generation tracking
    const generationData = {
      prompt,
      params,
      requestId,
      startedAt: Date.now(),
      progress: {
        percent: 0,
        stage: 'Starting',
        message: 'Initializing generation process'
      },
      waitingClients: new Set(),
      imageUrl: null,
      error: null
    };
    
    this.inProgressGenerations.set(key, generationData);
    logStatus(`Started tracking generation for ${key}`);
    
    return { key, status: 'started', generationData };
  }

  /**
   * Update the progress of a generation
   * @param {string} key - The tracking key
   * @param {number} percent - Progress percentage (0-100)
   * @param {string} stage - Current generation stage
   * @param {string} message - Progress message
   */
  updateProgress(key, percent, stage, message) {
    const generation = this.inProgressGenerations.get(key);
    if (!generation) {
      logStatus(`Cannot update progress for unknown generation: ${key}`);
      return false;
    }
    
    generation.progress = { percent, stage, message };
    logStatus(`Updated progress for ${key}: ${percent}% - ${stage} - ${message}`);
    return true;
  }

  /**
   * Complete a generation with success
   * @param {string} key - The tracking key
   * @param {string} imageUrl - URL to the generated image
   * @param {Buffer} imageBuffer - The image buffer
   * @param {Object} maturity - Maturity information
   * @returns {boolean} Success status
   */
  completeGeneration(key, imageUrl, imageBuffer, maturity = {}) {
    const generation = this.inProgressGenerations.get(key);
    if (!generation) {
      logStatus(`Cannot complete unknown generation: ${key}`);
      return false;
    }
    
    generation.imageUrl = imageUrl;
    generation.imageBuffer = imageBuffer;
    generation.maturity = maturity;
    generation.completedAt = Date.now();
    generation.progress = { percent: 100, stage: 'Completed', message: 'Generation successful' };
    
    // Move from in-progress to completed
    this.completedGenerations.set(key, generation);
    this.inProgressGenerations.delete(key);
    
    // Notify all waiting clients
    this._notifyWaitingClients(generation);
    
    logStatus(`Completed generation for ${key}: ${imageUrl}`);
    return true;
  }

  /**
   * Mark a generation as failed
   * @param {string} key - The tracking key
   * @param {Error} error - The error that occurred
   * @returns {boolean} Success status
   */
  failGeneration(key, error) {
    const generation = this.inProgressGenerations.get(key);
    if (!generation) {
      logStatus(`Cannot fail unknown generation: ${key}`);
      return false;
    }
    
    generation.error = error;
    generation.completedAt = Date.now();
    generation.progress = { percent: 100, stage: 'Failed', message: error.message };
    
    // Move to completed even though it failed (with error flag)
    this.completedGenerations.set(key, generation);
    this.inProgressGenerations.delete(key);
    
    // Reject all waiting clients
    this._rejectWaitingClients(generation, error);
    
    logStatus(`Failed generation for ${key}: ${error.message}`);
    return true;
  }

  /**
   * Notifies all waiting clients about a completed generation
   * @private
   * @param {Object} generation - The generation data
   */
  _notifyWaitingClients(generation) {
    if (!generation.waitingClients || generation.waitingClients.size === 0) {
      return;
    }
    
    logStatus(`Notifying ${generation.waitingClients.size} waiting clients for ${generation.prompt}`);
    
    for (const client of generation.waitingClients) {
      try {
        client.resolve(generation);
      } catch (error) {
        logStatus(`Error notifying client: ${error.message}`);
      }
    }
    
    // Clear waiting clients
    generation.waitingClients.clear();
  }

  /**
   * Rejects all waiting clients when a generation fails
   * @private
   * @param {Object} generation - The generation data
   * @param {Error} error - The error that occurred
   */
  _rejectWaitingClients(generation, error) {
    if (!generation.waitingClients || generation.waitingClients.size === 0) {
      return;
    }
    
    logStatus(`Rejecting ${generation.waitingClients.size} waiting clients for ${generation.prompt}`);
    
    for (const client of generation.waitingClients) {
      try {
        client.reject(error);
      } catch (error) {
        logStatus(`Error rejecting client: ${error.message}`);
      }
    }
    
    // Clear waiting clients
    generation.waitingClients.clear();
  }

  /**
   * Get the current status of a generation
   * @param {string} key - The tracking key
   * @returns {Object|null} The generation status or null if not found
   */
  getStatus(key) {
    // Check in-progress first
    if (this.inProgressGenerations.has(key)) {
      const data = this.inProgressGenerations.get(key);
      return {
        status: 'in_progress',
        progress: data.progress,
        startedAt: data.startedAt,
        elapsedMs: Date.now() - data.startedAt,
        generationId: key,
        prompt: data.prompt
      };
    }
    
    // Then check completed
    if (this.completedGenerations.has(key)) {
      const data = this.completedGenerations.get(key);
      return {
        status: data.error ? 'failed' : 'completed',
        progress: data.progress,
        startedAt: data.startedAt,
        completedAt: data.completedAt,
        elapsedMs: data.completedAt - data.startedAt,
        imageUrl: data.imageUrl,
        error: data.error ? data.error.message : null,
        maturity: data.maturity,
        generationId: key,
        prompt: data.prompt
      };
    }
    
    // Not found
    return null;
  }

  /**
   * Get the status for a specific prompt and parameters
   * @param {string} prompt - The image prompt
   * @param {Object} params - Generation parameters
   * @returns {Object|null} The generation status or null if not found
   */
  getStatusByPrompt(prompt, params) {
    const key = this.generateKey(prompt, params);
    return this.getStatus(key);
  }

  /**
   * Add a client waiting for the result of a generation
   * @param {string} key - The tracking key
   * @param {Function} resolveCallback - Function to call when generation completes
   * @param {Function} rejectCallback - Function to call if generation fails
   * @returns {boolean} Success status
   */
  addWaitingClient(key, resolveCallback, rejectCallback) {
    // First check if the generation is already completed
    if (this.completedGenerations.has(key)) {
      const completed = this.completedGenerations.get(key);
      if (completed.error) {
        rejectCallback(completed.error);
      } else {
        resolveCallback(completed);
      }
      return true;
    }
    
    const generation = this.inProgressGenerations.get(key);
    if (!generation) {
      rejectCallback(new Error(`No in-progress generation found for key: ${key}`));
      return false;
    }
    
    generation.waitingClients.add({ resolve: resolveCallback, reject: rejectCallback });
    logStatus(`Added waiting client for ${key}, total waiting: ${generation.waitingClients.size}`);
    return true;
  }

  /**
   * Get the image buffer for a completed generation
   * @param {string} key - The tracking key
   * @returns {Buffer|null} The image buffer or null if not available
   */
  getImageBuffer(key) {
    const completed = this.completedGenerations.get(key);
    if (!completed || completed.error) return null;
    return completed.imageBuffer;
  }
}

// Create a singleton instance
const statusTracker = new GenerationStatusTracker();

export default statusTracker;
