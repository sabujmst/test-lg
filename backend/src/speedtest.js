import crypto from 'crypto';

// Pre-generate a 1MB buffer of random-like bytes to write quickly to clients during download tests
const CHUNK_SIZE = 1024 * 1024; // 1 MB
const testBuffer = crypto.randomBytes(CHUNK_SIZE);

/**
 * Handles the speedtest ping endpoint.
 * Returns immediately with client IP information.
 */
export function handlePing(req, res) {
  // Get client IP address
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
  // Standardise IPv6 loopback or IPv4-mapped IPv6 to readable IPv4 if local
  let clientIp = ip;
  if (clientIp === '::1' || clientIp === '::ffff:127.0.0.1') {
    clientIp = '127.0.0.1';
  }
  res.json({
    status: 'ok',
    clientIp,
    timestamp: Date.now()
  });
}

/**
 * Streams dummy bytes to the client to measure download speeds.
 * Supports size parameter (in MB) or falls back to standard 50MB max.
 */
export function handleDownload(req, res) {
  // Disable caching
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Content-Type', 'application/octet-stream');

  const sizeMb = parseInt(req.query.size, 10) || 50; // Default 50 MB
  const totalBytes = sizeMb * 1024 * 1024;
  let bytesSent = 0;

  res.setHeader('Content-Length', totalBytes);

  function writeChunk() {
    // Check if client disconnected
    if (res.writableEnded || res.destroyed) return;

    const remaining = totalBytes - bytesSent;
    if (remaining <= 0) {
      res.end();
      return;
    }

    const currentChunkSize = Math.min(CHUNK_SIZE, remaining);
    const chunk = currentChunkSize === CHUNK_SIZE ? testBuffer : testBuffer.subarray(0, currentChunkSize);

    const fits = res.write(chunk);
    bytesSent += currentChunkSize;

    if (fits) {
      // Continue writing in next tick
      process.nextTick(writeChunk);
    } else {
      // Wait for drain event if buffer is full
      res.once('drain', writeChunk);
    }
  }

  writeChunk();
}

/**
 * Discards upload bytes from the client to measure upload speeds.
 */
export function handleUpload(req, res) {
  let bytesReceived = 0;

  req.on('data', (chunk) => {
    bytesReceived += chunk.length;
  });

  req.on('end', () => {
    res.json({
      status: 'ok',
      bytesReceived,
      duration: req.query.duration || 0
    });
  });

  req.on('error', (err) => {
    console.error('Upload error:', err);
    res.status(500).json({ error: err.message });
  });
}
