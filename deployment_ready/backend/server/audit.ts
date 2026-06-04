import { Request } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOGS_DIR = path.resolve(__dirname, '..', 'logs');
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}
const AUDIT_LOG_FILE = path.join(LOGS_DIR, 'audit.log');

/**
 * Structured audit logger helper for central monitoring in pm2 logs and local log files.
 * Captures user identity, client IP, action, timestamp, and details.
 */
export function auditLog(action: string, details: any, req?: Request) {
  const timestamp = new Date().toISOString();
  const username = (req as any)?.user?.username || 'system/anonymous';
  const ip = req?.ip || req?.socket?.remoteAddress || 'unknown';
  const logLine = `[AUDIT] [${timestamp}] User:${username} IP:${ip} Action:${action} Details:${JSON.stringify(details)}`;
  
  // Log to console (captured by PM2)
  console.log(logLine);

  // Append to persistent log file
  try {
    fs.appendFileSync(AUDIT_LOG_FILE, logLine + '\n', 'utf8');
  } catch (err) {
    console.error('Failed to write to audit log file:', err);
  }
}
