import { spawn } from 'child_process';
import { Client } from 'ssh2';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load the commands configuration
const configPath = path.resolve(__dirname, '../config/default.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

/**
 * Sanitizes the user input target (IP or hostname) to prevent shell injection.
 * Allows only alphanumeric characters, dots, dashes, and colons (for IPv6).
 */
export function sanitizeTarget(target) {
  if (!target || typeof target !== 'string') {
    throw new Error('Invalid target format');
  }
  const clean = target.trim();
  // Match IPv4, IPv6, and standard hostnames safely
  const safeRegex = /^[a-zA-Z0-9.:-]+$/;
  if (!safeRegex.test(clean)) {
    throw new Error('Target contains invalid characters (only alphanumeric, dots, dashes, and colons allowed)');
  }
  return clean;
}

/**
 * Executes a network diagnostic command.
 * Streams output back through the onData callback.
 * 
 * @param {string} type - ping, traceroute, mtr, bgp, ping6
 * @param {string} target - target IP or hostname
 * @param {function} onData - callback for streaming text output
 * @param {function} onClose - callback when execution completes
 */
export function executeDiagnostic(type, target, onData, onClose) {
  let sanitizedTarget;
  try {
    sanitizedTarget = sanitizeTarget(target);
  } catch (err) {
    onData(`ERROR: ${err.message}\n`);
    onClose(1);
    return () => {}; // Return empty cancel function
  }

  const source = process.env.EXECUTION_SOURCE || 'local';

  if (source === 'router') {
    return runOnRouter(type, sanitizedTarget, onData, onClose);
  } else {
    return runLocally(type, sanitizedTarget, onData, onClose);
  }
}

/**
 * Runs the diagnostic command locally on the backend server.
 */
function runLocally(type, target, onData, onClose) {
  const isWin = process.platform === 'win32';
  const platformKey = isWin ? 'win32' : 'posix';
  const commandTemplate = config.localCommands[platformKey][type];

  if (!commandTemplate) {
    onData(`ERROR: Diagnostic tool "${type}" not supported on this platform.\n`);
    onClose(1);
    return () => {};
  }

  // Construct the command string
  const commandStr = commandTemplate.replace('{target}', target);
  
  onData(`Running local ${type} for target: ${target}...\n`);
  onData(`> ${commandStr}\n\n`);

  let proc;
  if (isWin) {
    // On Windows, run cmd.exe /c "command" to ensure piping and utilities work
    proc = spawn('cmd.exe', ['/c', commandStr]);
  } else {
    // On POSIX, run via sh
    proc = spawn('sh', ['-c', commandStr]);
  }

  proc.stdout.on('data', (data) => {
    onData(data.toString());
  });

  proc.stderr.on('data', (data) => {
    onData(data.toString());
  });

  proc.on('close', (code) => {
    onData(`\nProcess finished with exit code ${code}\n`);
    onClose(code);
  });

  proc.on('error', (err) => {
    onData(`\nExecution Error: ${err.message}\n`);
    onClose(1);
  });

  // Return cancellation callback
  return () => {
    if (proc && !proc.killed) {
      onData('\n[Test execution aborted by user]\n');
      proc.kill();
    }
  };
}

/**
 * Runs the diagnostic command on the Arista EOS router via SSH.
 */
function runOnRouter(type, target, onData, onClose) {
  const commandTemplate = config.routerCommands[type];
  if (!commandTemplate) {
    onData(`ERROR: Diagnostic tool "${type}" not supported on router.\n`);
    onClose(1);
    return () => {};
  }

  const commandStr = commandTemplate.replace('{target}', target);

  const conn = new Client();
  let streamRef = null;
  let isAborted = false;

  onData(`Connecting to Arista EOS router (${process.env.ROUTER_HOST})...\n`);

  const connectionConfig = {
    host: process.env.ROUTER_HOST || '192.168.1.1',
    port: parseInt(process.env.ROUTER_PORT || '22', 10),
    username: process.env.ROUTER_USER || 'admin',
  };

  if (process.env.ROUTER_KEY_PATH) {
    try {
      connectionConfig.privateKey = fs.readFileSync(process.env.ROUTER_KEY_PATH);
    } catch (err) {
      onData(`ERROR: Failed to read private key from ${process.env.ROUTER_KEY_PATH}: ${err.message}\n`);
      onClose(1);
      return () => {};
    }
  } else {
    connectionConfig.password = process.env.ROUTER_PASSWORD || 'admin';
  }

  conn.on('ready', () => {
    if (isAborted) {
      conn.end();
      return;
    }
    onData(`Connected. Running command: "${commandStr}"\n\n`);

    conn.exec(commandStr, (err, stream) => {
      if (err) {
        onData(`Execution Error: ${err.message}\n`);
        conn.end();
        onClose(1);
        return;
      }
      streamRef = stream;

      stream.on('data', (data) => {
        onData(data.toString());
      });

      stream.stderr.on('data', (data) => {
        onData(data.toString());
      });

      stream.on('close', (code) => {
        onData(`\nCommand completed with exit code ${code}\n`);
        conn.end();
        onClose(code);
      });
    });
  });

  conn.on('error', (err) => {
    onData(`\nSSH Connection Error: ${err.message}\n`);
    onClose(1);
  });

  conn.on('close', () => {
    // Connection closed
  });

  try {
    conn.connect(connectionConfig);
  } catch (err) {
    onData(`\nSSH Connection Trigger Error: ${err.message}\n`);
    onClose(1);
  }

  // Return cancellation callback
  return () => {
    isAborted = true;
    if (streamRef) {
      onData('\n[Test execution aborted by user]\n');
      streamRef.end();
    }
    conn.end();
  };
}
