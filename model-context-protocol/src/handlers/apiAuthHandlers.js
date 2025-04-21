// API authentication handlers for the Pollinations MCP server

/**
 * Creates API authentication handlers for Express
 * @param {Object} options - Configuration options
 * @param {Function} options.verifyToken - Function to verify tokens
 * @param {Function} options.verifyReferrer - Function to verify referrers
 * @returns {Object} API authentication handlers
 */
export function createApiAuthHandlers({ verifyToken, verifyReferrer }) {
  /**
   * Token verification handler
   */
  const handleVerifyToken = async (req, res) => {
    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({ valid: false, error: 'Token is required' });
    }
    
    try {
      const result = await verifyToken(token);
      res.json(result);
    } catch (error) {
      console.error('Error verifying token:', error);
      res.status(500).json({ valid: false, error: 'Internal server error' });
    }
  };

  /**
   * Referrer verification handler
   */
  const handleVerifyReferrer = async (req, res) => {
    const { userId, referrer } = req.body;
    
    if (!userId || !referrer) {
      return res.status(400).json({ 
        valid: false, 
        error: 'User ID and referrer are required' 
      });
    }
    
    try {
      const result = await verifyReferrer(userId, referrer);
      res.json(result);
    } catch (error) {
      console.error('Error verifying referrer:', error);
      res.status(500).json({ valid: false, error: 'Internal server error' });
    }
  };

  /**
   * Health check handler
   */
  const handleHealthCheck = (req, res) => {
    res.json({ status: 'ok' });
  };

  return {
    handleVerifyToken,
    handleVerifyReferrer,
    handleHealthCheck
  };
}
