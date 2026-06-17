import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import { rateLimit } from 'express-rate-limit';
import { handlePing, handleDownload, handleUpload } from './speedtest.js';
import { executeDiagnostic, sanitizeTarget } from './router.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Resolve directory-independent paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const configPath = path.resolve(__dirname, '../config/default.json');
const frontendDistPath = path.resolve(__dirname, '../../frontend/dist');

// Enable trust proxy for correct client IP parsing behind reverse proxies (Nginx/Cloudflare)
app.set('trust proxy', true);

// Standard HTTP request logging
app.use(morgan('combined'));

// Set up security headers with custom CSP to allow local styling and fonts
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      "default-src": ["'self'"],
      "font-src": ["'self'", "https://fonts.gstatic.com"],
      "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      "connect-src": ["'self'", "ws:", "wss:", "*"], // Allows local/cross-origin speedtest sockets
      "img-src": ["'self'", "data:", "blob:"],
      "script-src": ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
    }
  }
}));

// Gzip compression for performance optimization
app.use(compression());

// Enable CORS for frontend development
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Global API rate limiter (150 requests per 15 minutes per IP)
const apiGlobalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 150,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' }
});

// Strict rate limiter for resource-heavy / speedtest endpoints (15 runs per minute per IP)
const heavyLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Rate limit exceeded. Please wait a minute before running another test.' }
});

// Apply rate limiters
app.use('/api/', apiGlobalLimiter);
app.use('/api/diagnose', heavyLimiter);
app.use('/api/speedtest/download', heavyLimiter);
app.use('/api/speedtest/upload', heavyLimiter);

// Load speedtest config configuration safely
let config = {};
try {
  config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} catch (err) {
  console.error(`Failed to read config from ${configPath}:`, err);
}

/**
 * API Endpoint: Fetch site configurations and client IP info.
 */
app.get('/api/config', (req, res) => {
  let clientIp = req.ip || '127.0.0.1';
  if (clientIp === '::1' || clientIp === '::ffff:127.0.0.1') {
    clientIp = '127.0.0.1';
  }
  
  res.json({
    speedtest: config.speedtest || {},
    clientIp,
    executionSource: process.env.EXECUTION_SOURCE || 'local'
  });
});

/**
 * Speedtest Endpoints
 */
app.get('/api/speedtest/ping', handlePing);
app.get('/api/speedtest/download', handleDownload);
app.post('/api/speedtest/upload', handleUpload);

/**
 * Diagnostic streaming endpoint (SSE / chunked text)
 */
app.get('/api/diagnose', (req, res) => {
  const { type, target } = req.query;

  if (!type || !target) {
    return res.status(400).json({ error: 'Missing type or target parameters' });
  }

  // Set response headers for chunked streaming text
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Transfer-Encoding', 'chunked');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Connection', 'keep-alive');

  res.write(`--- Starting Diagnostic [${type.toUpperCase()}] for target ${target} ---\n\n`);

  let cancelExecution = null;

  const onData = (data) => {
    if (!res.writableEnded) {
      res.write(data);
    }
  };

  const onClose = (code) => {
    if (!res.writableEnded) {
      res.write(`\n--- Diagnostic Complete (Exit Code: ${code}) ---\n`);
      res.end();
    }
  };

  // Run the diagnostic execution
  cancelExecution = executeDiagnostic(type, target, onData, onClose);

  // If the client disconnects/aborts the request, clean up the process/SSH channel
  req.on('close', () => {
    if (cancelExecution) {
      console.log(`Diagnostic client connection closed. Aborting command.`);
      cancelExecution();
    }
  });
});

// Serve static frontend files in production
if (fs.existsSync(frontendDistPath)) {
  console.log(`Serving static files from ${frontendDistPath}`);
  app.use(express.static(frontendDistPath));
  
  // Fallback to index.html for React SPA routing
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) {
      return next();
    }
    res.sendFile(path.join(frontendDistPath, 'index.html'));
  });
} else {
  console.log(`Frontend build directory not found at ${frontendDistPath}. API server running standalone.`);
}

// Global express error handler to prevent internal detail leakage
app.use((err, req, res, next) => {
  console.error('Unhandled Exception occurred:', err);
  res.status(500).json({ error: 'An unexpected internal server error occurred.' });
});

// Start listening
const server = app.listen(PORT, () => {
  console.log(`Looking Glass backend listening on port ${PORT}`);
  console.log(`Execution Mode: ${process.env.EXECUTION_SOURCE || 'local'}`);
});

// Graceful Shutdown implementation
function gracefulShutdown(signal) {
  console.log(`\nReceived ${signal}. Starting graceful shutdown...`);
  
  server.close(() => {
    console.log('HTTP server closed. Exiting process.');
    process.exit(0);
  });

  // Force shutdown after 10 seconds if connections fail to close
  setTimeout(() => {
    console.error('Graceful shutdown timeout exceeded. Force exiting.');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
