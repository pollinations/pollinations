import passport from 'passport';
import { Strategy as GitHubStrategy } from 'passport-github2';
import express from 'express';
import { createAuthMiddleware } from './middleware.js';

/**
 * Initialize authentication
 * @param {object} app - Express app
 * @param {object} storage - Storage instance
 */
export async function initializeAuth(app, storage) {
  // Configure GitHub strategy
  passport.use(
    new GitHubStrategy(
      {
        clientID: process.env.GITHUB_CLIENT_ID,
        clientSecret: process.env.GITHUB_CLIENT_SECRET,
        callbackURL: process.env.GITHUB_CALLBACK_URL || 'https://flow.pollinations.ai/github/callback'
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          // Store GitHub token and user info
          const user = await storage.setUser(profile.id, {
            github_id: profile.id,
            github_username: profile.username,
            github_token: accessToken,
            github_refresh_token: refreshToken,
            github_profile: {
              displayName: profile.displayName,
              username: profile.username,
              profileUrl: profile.profileUrl,
              photos: profile.photos
            }
          });
          
          return done(null, user);
        } catch (error) {
          return done(error);
        }
      }
    )
  );

  // Serialize user to session
  passport.serializeUser((user, done) => {
    done(null, user.github_id);
  });

  // Deserialize user from session
  passport.deserializeUser(async (githubId, done) => {
    try {
      const user = storage.getUser(githubId);
      if (!user) {
        return done(null, false);
      }
      return done(null, user);
    } catch (error) {
      return done(error);
    }
  });

  // Create auth router
  const authRouter = express.Router();

  // GitHub login route
  authRouter.get('/github/login', passport.authenticate('github', {
    scope: ['user:email']
  }));

  // GitHub callback route
  authRouter.get('/github/callback',
    passport.authenticate('github', {
      failureRedirect: '/github/login-failed'
    }),
    (req, res) => {
      // Successful authentication, redirect to dashboard
      res.redirect('/dashboard');
    }
  );

  // Login failed route
  authRouter.get('/github/login-failed', (req, res) => {
    res.status(401).json({
      success: false,
      message: 'GitHub authentication failed.'
    });
  });

  // Logout route
  authRouter.get('/logout', (req, res) => {
    req.logout((err) => {
      if (err) {
        return res.status(500).json({
          success: false,
          message: 'Error during logout'
        });
      }
      
      res.redirect('/');
    });
  });

  // Check authentication status
  authRouter.get('/status', (req, res) => {
    if (!req.isAuthenticated()) {
      return res.json({
        authenticated: false
      });
    }
    
    res.json({
      authenticated: true,
      user: {
        github_username: req.user.github_username,
        pollinations_token: req.user.pollinations_token,
        referrers: req.user.referrers || []
      }
    });
  });

  // User dashboard
  authRouter.get('/dashboard', createAuthMiddleware(), (req, res) => {
    res.json({
      user: {
        github_username: req.user.github_username,
        pollinations_token: req.user.pollinations_token,
        referrers: req.user.referrers || []
      }
    });
  });

  // Token management

  // Generate new token
  authRouter.post('/token/regenerate', createAuthMiddleware(), async (req, res) => {
    try {
      const token = await storage.regenerateToken(req.user.github_id);
      res.json({
        success: true,
        token
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  });

  // Referrer management

  // Add referrer
  authRouter.post('/referrer', createAuthMiddleware(), async (req, res) => {
    try {
      const { referrer } = req.body;
      
      if (!referrer) {
        return res.status(400).json({
          success: false,
          message: 'Referrer is required'
        });
      }
      
      const referrers = await storage.addReferrer(req.user.github_id, referrer);
      res.json({
        success: true,
        referrers
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  });

  // Remove referrer
  authRouter.delete('/referrer', createAuthMiddleware(), async (req, res) => {
    try {
      const { referrer } = req.body;
      
      if (!referrer) {
        return res.status(400).json({
          success: false,
          message: 'Referrer is required'
        });
      }
      
      const referrers = await storage.removeReferrer(req.user.github_id, referrer);
      res.json({
        success: true,
        referrers
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  });

  // List referrers
  authRouter.get('/referrers', createAuthMiddleware(), (req, res) => {
    res.json({
      success: true,
      referrers: req.user.referrers || []
    });
  });

  // Mount auth router
  app.use('/', authRouter);

  return {
    passport,
    createAuthMiddleware
  };
}
