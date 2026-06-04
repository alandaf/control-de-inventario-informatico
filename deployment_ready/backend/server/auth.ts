import crypto from 'crypto';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { Request, Response, NextFunction } from 'express';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure env variables are loaded before accessing the secret
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });
dotenv.config({ path: path.resolve(__dirname, '..', '.env.local') });

// C-02 & C-07: Require JWT_SECRET to be configured (no weak hardcoded fallback)
const SECRET = process.env.JWT_SECRET;
if (!SECRET) {
  console.error('[SECURITY CONFIG ERROR] Falta configurar la variable de entorno JWT_SECRET. El servidor no puede iniciar de forma segura.');
  process.exit(1);
}

function base64UrlEncode(str: string): string {
  return Buffer.from(str)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64').toString('utf8');
}

/**
 * Manual cookie parser utility (C-08)
 */
export function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const list: Record<string, string> = {};
  if (!cookieHeader) return list;
  cookieHeader.split(';').forEach(cookie => {
    const parts = cookie.split('=');
    const name = parts.shift()?.trim();
    if (name) {
      list[name] = decodeURIComponent(parts.join('='));
    }
  });
  return list;
}

// Ensure logs directory exists for persistent state files
const LOGS_DIR = path.resolve(__dirname, '..', 'logs');
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

const BLACKLIST_FILE = path.join(LOGS_DIR, 'token_blacklist.json');
const RATELIMIT_FILE = path.join(LOGS_DIR, 'ratelimit.json');

/**
 * Token blacklist with persistent file fallback (A-04)
 */
const revokedTokens = new Map<string, number>();

function saveBlacklist() {
  try {
    const entries = Array.from(revokedTokens.entries());
    fs.writeFileSync(BLACKLIST_FILE, JSON.stringify(entries), 'utf8');
  } catch (e) {
    console.error('Error saving token blacklist:', e);
  }
}

function loadBlacklist() {
  try {
    if (fs.existsSync(BLACKLIST_FILE)) {
      const raw = fs.readFileSync(BLACKLIST_FILE, 'utf8');
      const entries = JSON.parse(raw);
      for (const [jti, exp] of entries) {
        revokedTokens.set(jti, exp);
      }
    }
  } catch (e) {
    console.error('Error loading token blacklist:', e);
  }
}

loadBlacklist();

// Periodic cleanup of expired entries from the blacklist to prevent memory growth
setInterval(() => {
  const now = Math.floor(Date.now() / 1000);
  let changed = false;
  for (const [jti, exp] of revokedTokens.entries()) {
    if (exp < now) {
      revokedTokens.delete(jti);
      changed = true;
    }
  }
  if (changed) saveBlacklist();
}, 30 * 60 * 1000).unref(); // every 30 minutes, unref to not block tests/server exit

/**
 * Revokes a token by adding its unique JTI and expiration to the blacklist.
 */
export function revokeToken(token: string): boolean {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    const [, encodedPayload] = parts;
    const payload = JSON.parse(base64UrlDecode(encodedPayload));
    if (payload.jti && payload.exp) {
      revokedTokens.set(payload.jti, payload.exp);
      saveBlacklist();
      return true;
    }
  } catch (err) {
    // Ignore invalid formats
  }
  return false;
}

/**
 * Generates a standard JWT token valid for 24 hours signed with HMAC-SHA256.
 * Includes iat, exp, role, and a unique cryptographic jti (JWT ID).
 */
export function generateToken(username: string, role: string, orgId?: number): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    username,
    iat: now,
    exp: now + 24 * 60 * 60, // 24 hours
    jti: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2) + now.toString(),
    role,
    orgId
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));

  const signature = crypto
    .createHmac('sha256', SECRET!)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64url');

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

/**
 * Verifies a JWT token's signature, expiration and revocation status.
 * Returns the decoded payload or null if invalid/expired/revoked.
 */
export function verifyToken(token: string): { username: string; role?: string; jti?: string; orgId?: number } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [encodedHeader, encodedPayload, signature] = parts;

    const expectedSignature = crypto
      .createHmac('sha256', SECRET!)
      .update(`${encodedHeader}.${encodedPayload}`)
      .digest('base64url');

    if (signature !== expectedSignature) {
      return null;
    }

    const payload = JSON.parse(base64UrlDecode(encodedPayload));
    
    // Check expiration
    if (payload.exp && Date.now() / 1000 > payload.exp) {
      return null; // Expired
    }

    // Check revocation (blacklist)
    if (payload.jti && revokedTokens.has(payload.jti)) {
      return null; // Revoked / Logged out
    }

    return { 
      username: payload.username,
      role: payload.role,
      jti: payload.jti,
      orgId: payload.orgId
    };
  } catch (err) {
    return null;
  }
}

/**
 * Express middleware to authenticate protected routes using JWT token.
 * Inspects both cookies (C-08) and standard Authorization header.
 */
export function authenticateToken(req: Request, res: Response, next: NextFunction) {
  // Try Cookie first, then fall back to Authorization header
  const cookies = parseCookies(req.headers.cookie);
  const cookieToken = cookies['admin_token'];
  
  const authHeader = req.headers['authorization'];
  const headerToken = authHeader && authHeader.split(' ')[1]; // Format: Bearer <token>
  
  const token = cookieToken || headerToken;

  if (!token) {
    res.status(401).json({ error: 'Acceso no autorizado. Token faltante.' });
    return;
  }

  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: 'Acceso no autorizado. Token inválido o expirado.' });
    return;
  }

  (req as any).user = payload;
  next();
}

/**
 * Custom rate limiter middleware with persistent file fallback (A-03)
 */
interface RateLimitInfo {
  attempts: number;
  resetTime: number;
}
const loginRateLimitMap = new Map<string, RateLimitInfo>();

function saveRateLimits() {
  try {
    const entries = Array.from(loginRateLimitMap.entries());
    fs.writeFileSync(RATELIMIT_FILE, JSON.stringify(entries), 'utf8');
  } catch (e) {
    console.error('Error saving rate limits:', e);
  }
}

function loadRateLimits() {
  try {
    if (fs.existsSync(RATELIMIT_FILE)) {
      const raw = fs.readFileSync(RATELIMIT_FILE, 'utf8');
      const entries = JSON.parse(raw);
      for (const [ip, info] of entries) {
        loginRateLimitMap.set(ip, info);
      }
    }
  } catch (e) {
    console.error('Error loading rate limits:', e);
  }
}

loadRateLimits();

export function loginRateLimiter(req: Request, res: Response, next: NextFunction) {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const limitWindow = 15 * 60 * 1000; // 15 minutes
  const maxAttempts = 5;

  let info = loginRateLimitMap.get(ip);
  if (!info || now > info.resetTime) {
    info = {
      attempts: 0,
      resetTime: now + limitWindow
    };
  }

  if (info.attempts >= maxAttempts) {
    const minutesLeft = Math.ceil((info.resetTime - now) / 60000);
    res.status(429).json({
      error: `Demasiados intentos de acceso. Intente de nuevo en ${minutesLeft} minuto(s).`
    });
    return;
  }

  info.attempts++;
  loginRateLimitMap.set(ip, info);
  saveRateLimits();
  next();
}

/**
 * Access control middleware (RBAC) (A-05)
 */
export function requireRole(roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;
    if (!user || !user.role || !roles.includes(user.role)) {
      res.status(403).json({ error: 'Permisos insuficientes. Se requiere rol de ' + roles.join(' o ') });
      return;
    }
    next();
  };
}
