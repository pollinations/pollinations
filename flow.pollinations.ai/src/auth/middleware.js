/**
 * Authentication middleware
 */

/**
 * Create middleware that checks if the user is authenticated
 * @param {Object} options - Middleware options
 * @param {boolean} options.allowToken - Whether to allow token-based authentication
 * @param {boolean} options.requireReferrer - Whether to require referrer validation
 */
export function createAuthMiddleware(options = {}) {
  const { allowToken = false, requireReferrer = false } = options;
  
  return async (req, res, next) => {
    // If user is already authenticated via session, proceed
    if (req.isAuthenticated()) {
      // If referrer validation is required, check the referrer
      if (requireReferrer) {
        const referrer = req.get('Referer') || req.get('Origin');
        
        if (!referrer) {
          return res.status(403).json({
            success: false,
            message: 'Referrer validation required but no referrer provided'
          });
        }
        
        // Extract domain from referrer
        let referrerDomain;
        try {
          referrerDomain = new URL(referrer).hostname;
        } catch (error) {
          return res.status(403).json({
            success: false,
            message: 'Invalid referrer format'
          });
        }
        
        // Check if referrer is in user's whitelist
        const storage = req.app.get('storage');
        const isAuthorized = storage.isReferrerAuthorized(req.user.github_id, referrerDomain);
        
        if (!isAuthorized) {
          return res.status(403).json({
            success: false,
            message: 'Unauthorized referrer'
          });
        }
      }
      
      return next();
    }
    
    // If token-based auth is allowed, check for token
    if (allowToken) {
      const token = req.headers['x-pollinations-token'] || 
                   req.query.token || 
                   (req.body && req.body.token);
      
      if (!token) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }
      
      // Validate token
      const storage = req.app.get('storage');
      const user = storage.getUserByToken(token);
      
      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'Invalid or expired token'
        });
      }
      
      // Update last used timestamp
      user.last_used = new Date().toISOString();
      await storage.saveData();
      
      // Set user in request
      req.user = user;
      
      // If referrer validation is required, check the referrer
      if (requireReferrer) {
        const referrer = req.get('Referer') || req.get('Origin');
        
        if (!referrer) {
          return res.status(403).json({
            success: false,
            message: 'Referrer validation required but no referrer provided'
          });
        }
        
        // Extract domain from referrer
        let referrerDomain;
        try {
          referrerDomain = new URL(referrer).hostname;
        } catch (error) {
          return res.status(403).json({
            success: false,
            message: 'Invalid referrer format'
          });
        }
        
        // Check if referrer is in user's whitelist
        const isAuthorized = storage.isReferrerAuthorized(user.github_id, referrerDomain);
        
        if (!isAuthorized) {
          return res.status(403).json({
            success: false,
            message: 'Unauthorized referrer'
          });
        }
      }
      
      return next();
    }
    
    // Not authenticated
    return res.status(401).json({
      success: false,
      message: 'Authentication required'
    });
  };
}

/**
 * Create middleware that validates API tokens
 */
export function createTokenMiddleware() {
  return createAuthMiddleware({ allowToken: true });
}

/**
 * Create middleware that validates referrers
 */
export function createReferrerMiddleware() {
  return createAuthMiddleware({ requireReferrer: true });
}

/**
 * Create middleware that validates both tokens and referrers
 */
export function createFullAuthMiddleware() {
  return createAuthMiddleware({ allowToken: true, requireReferrer: true });
}
