import express from 'express';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import passport from 'passport';
import helmet from 'helmet';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';

// Import our modules
import { initializeAuth } from './auth/auth.js';
import { initializeStorage } from './storage/storage.js';
import { initializeMcpServer } from './mcp/mcpServer.js';

// Load environment variables
dotenv.config();

// Get the directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Set up middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      imgSrc: ["'self'", "data:", "https://ui-avatars.com", "https://avatars.githubusercontent.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      connectSrc: ["'self'"]
    }
  }
})); // Security headers with adjusted CSP for our needs

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, curl requests)
    if (!origin) return callback(null, true);
    
    // Simple function to normalize and extract domain
    const extractDomain = (url) => {
      try {
        // For URLs like https://example.com/path, extract example.com
        const hostname = new URL(url).hostname;
        return hostname;
      } catch (error) {
        // If it's not a valid URL, just return the original
        return url;
      }
    };
    
    const originDomain = extractDomain(origin);
    
    // For demo purposes, we'll allow Pollinations domains
    if (originDomain.endsWith('pollinations.ai')) {
      return callback(null, true);
    }
    
    // In a real implementation, we would check against the user's stored allowed referrers
    callback(new Error('Not allowed by CORS'), false);
  },
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser(process.env.COOKIE_SECRET));
app.use(session({
  secret: process.env.SESSION_SECRET || 'pollinations-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.COOKIE_SECURE === 'true',
    httpOnly: process.env.COOKIE_HTTP_ONLY === 'true',
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Initialize passport
app.use(passport.initialize());
app.use(passport.session());

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// Initialize our modules
const storage = await initializeStorage();
await initializeAuth(app, storage);
await initializeMcpServer(app, storage);

// Create data directory if it doesn't exist
try {
  await fs.mkdir(path.join(__dirname, '../data'), { recursive: true });
} catch (err) {
  console.error('Error creating data directory:', err);
}

// Serve the frontend when accessing root path
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Pollinations Flow Authentication & MCP Server' });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV}`);
  console.log(`Visit http://localhost:${PORT} to access the Flow UI`);
});

// Handle shutdown gracefully
process.on('SIGINT', () => {
  console.log('Shutting down server...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('Shutting down server...');
  process.exit(0);
});

export default app;
