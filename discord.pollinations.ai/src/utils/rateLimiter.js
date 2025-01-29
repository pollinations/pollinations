class RateLimiter {
  constructor(maxRequests, timeWindow) {
    this.maxRequests = maxRequests;
    this.timeWindow = timeWindow;
    this.requests = new Map();
  }

  tryRequest(userId) {
    const now = Date.now();
    const userRequests = this.requests.get(userId) || [];
    
    // Remove expired requests
    const validRequests = userRequests.filter(time => now - time < this.timeWindow);
    
    if (validRequests.length >= this.maxRequests) {
      this.requests.set(userId, validRequests);
      return false;
    }
    
    validRequests.push(now);
    this.requests.set(userId, validRequests);
    return true;
  }

  getTimeUntilReset(userId) {
    const userRequests = this.requests.get(userId) || [];
    if (userRequests.length === 0) return 0;
    
    const oldestRequest = userRequests[0];
    return Math.max(0, this.timeWindow - (Date.now() - oldestRequest));
  }

  clearUser(userId) {
    this.requests.delete(userId);
  }
}

module.exports = {
  RateLimiter
};