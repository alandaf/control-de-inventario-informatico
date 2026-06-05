import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize env variables
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });
dotenv.config({ path: path.resolve(__dirname, '..', '.env.local') });

// C-02: Strict admin & super admin user & pass validation (fail startup if not configured)
const adminUser = process.env.ADMIN_USER;
const adminPass = process.env.ADMIN_PASS;
const superAdminUser = process.env.SUPER_ADMIN_USER;
const superAdminPass = process.env.SUPER_ADMIN_PASS;

if (!adminUser || !adminPass || !superAdminUser || !superAdminPass) {
  console.error('[SECURITY CONFIG ERROR] Falta configurar las variables de entorno ADMIN_USER, ADMIN_PASS, SUPER_ADMIN_USER o SUPER_ADMIN_PASS.');
  process.exit(1);
}

import pool from './db';
import assetsRouter from './routes/assets';
import organizationsRouter from './routes/organizations';
import aiRouter from './routes/ai';
import { seedDatabase } from './seed';
import { generateToken, authenticateToken, loginRateLimiter, revokeToken, parseCookies, requireRole } from './auth';
import { auditLog } from './audit';

const app = express();
const PORT = Number(process.env.API_PORT) || 3001;

// Trust reverse proxy headers (e.g. for client IP behind Webmin/cPanel/LiteSpeed proxies)
app.set('trust proxy', true);

// C-01 & C-08: Restrict CORS, allowing credentials (cookies) in cross-origin requests
app.use(cors({
  origin: ['https://inventarioti.simarp.net', 'http://localhost:3000', 'http://127.0.0.1:3000'],
  credentials: true
}));

// C2: Apply secure HTTP security headers and remove X-Powered-By
app.disable('x-powered-by');
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy', "default-src 'self'; font-src 'self' https://fonts.gstatic.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data:; connect-src 'self' ws: wss: http://localhost:3000 http://localhost:3001 https://inventarioti.simarp.net; frame-ancestors 'none';");
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

// Public login route with Rate Limiter (A1) and Cookie emission (C-08)
app.post('/api/login', loginRateLimiter, async (req, res) => {
  const { username, password, loginType, organizationId } = req.body;

  if (loginType === 'super_admin') {
    if (username === superAdminUser && password === superAdminPass) {
      const token = generateToken(username, 'super_admin');
      auditLog('SUPER_ADMIN_LOGIN_SUCCESS', { username }, req);

      const isProduction = process.env.NODE_ENV === 'production';
      const secureFlag = isProduction ? 'Secure;' : '';
      res.setHeader(
        'Set-Cookie',
        `admin_token=${token}; Path=/; HttpOnly; ${secureFlag} SameSite=Strict; Max-Age=86400`
      );

      res.json({ success: true, token, role: 'super_admin' });
    } else {
      auditLog('SUPER_ADMIN_LOGIN_FAILED', { username }, req);
      res.status(401).json({ error: 'Usuario o contraseña de Super Administrador incorrectos.' });
    }
  } else if (loginType === 'organization') {
    if (!organizationId) {
      res.status(400).json({ error: 'Debe seleccionar una organización para ingresar.' });
      return;
    }

    let conn;
    try {
      conn = await pool.getConnection();
      const orgs = await conn.query('SELECT name, username, password FROM organizations WHERE id = ?', [organizationId]);
      if (orgs.length === 0) {
        res.status(400).json({ error: 'La organización seleccionada no es válida.' });
        return;
      }

      const org = orgs[0];
      if (username === org.username && password === org.password) {
        const token = generateToken(username, 'admin', Number(organizationId));
        auditLog('LOGIN_SUCCESS', { username, organizationId, organizationName: org.name }, req);

        const isProduction = process.env.NODE_ENV === 'production';
        const secureFlag = isProduction ? 'Secure;' : '';
        res.setHeader(
          'Set-Cookie',
          `admin_token=${token}; Path=/; HttpOnly; ${secureFlag} SameSite=Strict; Max-Age=86400`
        );

        res.json({ success: true, token, role: 'admin', orgId: Number(organizationId) });
      } else {
        auditLog('LOGIN_FAILED', { username, organizationId, organizationName: org.name }, req);
        res.status(401).json({ error: 'Usuario o contraseña de la organización incorrectos.' });
      }
    } catch (err: any) {
      console.error('Login DB error:', err);
      res.status(500).json({ error: 'Error interno de base de datos durante el login.' });
    } finally {
      if (conn) conn.release();
    }
  } else {
    res.status(400).json({ error: 'Tipo de inicio de sesión no válido.' });
  }
});

// Revoke token on logout (A3) and clear Cookie (C-08)
app.post('/api/logout', (req, res) => {
  const cookies = parseCookies(req.headers.cookie);
  const cookieToken = cookies['admin_token'];
  
  const authHeader = req.headers['authorization'];
  const headerToken = authHeader && authHeader.split(' ')[1];
  
  const token = cookieToken || headerToken;

  if (token) {
    const success = revokeToken(token);
    auditLog('LOGOUT', { tokenRevoked: success }, req);
  }

  // Clear cookie
  res.setHeader('Set-Cookie', 'admin_token=; Path=/; HttpOnly; Max-Age=0');
  res.json({ success: true });
});

// Assets router (manages its own auth internally for public vs protected routes)
app.use('/api/assets', assetsRouter);

// Organizations router
app.use('/api/organizations', organizationsRouter);

// Endpoint to fetch audit API Key for authenticated admins (C-01)
app.get('/api/audit-key', authenticateToken, requireRole(['admin', 'super_admin']), (req, res) => {
  res.json({ apiKey: process.env.AUDIT_API_KEY || '' });
});

// Protected administrative endpoints (accessible by both admin and auditor roles - RBAC A-05)
app.get('/api/stats', authenticateToken, requireRole(['admin', 'auditor', 'super_admin']), async (req, res, next) => {
  const user = (req as any).user;
  const isSuperAdmin = user.role === 'super_admin';
  const orgId = user.orgId;

  let conn;
  try {
    conn = await pool.getConnection();

    let totalAssetsQuery = 'SELECT COUNT(*) as count FROM assets';
    let assignedQuery = "SELECT COUNT(*) as count FROM assets WHERE cargo!='' AND responsable!='' AND ubicacion!=''";
    let pendingQuery = "SELECT COUNT(*) as count FROM assets WHERE cargo='' OR responsable='' OR ubicacion=''";
    let byCategoryQuery = 'SELECT category, COUNT(*) as count FROM assets GROUP BY category';
    let byStatusQuery = 'SELECT status, COUNT(*) as count FROM assets GROUP BY status';
    
    let params: any[] = [];
    if (!isSuperAdmin) {
      totalAssetsQuery += ' WHERE organizationId = ?';
      assignedQuery += ' AND organizationId = ?';
      pendingQuery += ' AND organizationId = ?';
      byCategoryQuery = 'SELECT category, COUNT(*) as count FROM assets WHERE organizationId = ? GROUP BY category';
      byStatusQuery = 'SELECT status, COUNT(*) as count FROM assets WHERE organizationId = ? GROUP BY status';
      params = [orgId];
    }

    const totalAssets = await conn.query(totalAssetsQuery, params);
    const assigned = await conn.query(assignedQuery, params);
    const pending = await conn.query(pendingQuery, params);
    const byCategory = await conn.query(byCategoryQuery, params);
    const byStatus = await conn.query(byStatusQuery, params);

    const categoryMap: Record<string, number> = {};
    byCategory.forEach((r: any) => { categoryMap[r.category] = Number(r.count); });
    const statusMap: Record<string, number> = {};
    byStatus.forEach((r: any) => { statusMap[r.status] = Number(r.count); });
    const totalVal = Number(totalAssets[0].count);
    const assignedVal = Number(assigned[0].count);

    res.json({
      totalAssets: totalVal,
      assignedCount: assignedVal,
      unassignedCount: totalVal - assignedVal,
      pendingClassification: Number(pending[0].count),
      byCategory: categoryMap,
      byStatus: statusMap,
    });
  } catch (err: any) {
    next(err);
  } finally {
    if (conn) conn.release();
  }
});

// Reset Database protected by specific confirm header and passcode (A4, M-03, requireRole admin/super_admin)
app.post('/api/reset', authenticateToken, requireRole(['admin', 'super_admin']), async (req, res, next) => {
  const confirmHeader = req.headers['x-confirm-reset'];
  const resetPasscode = req.headers['x-reset-passcode'];
  const serverPasscode = process.env.RESET_PASSCODE;
  const user = (req as any).user;
  const isSuperAdmin = user.role === 'super_admin';
  const orgId = user.orgId;

  if (confirmHeader !== 'confirm-delete-all-assets') {
    auditLog('RESET_ATTEMPT_DENIED', { reason: 'Cabecera de confirmación incorrecta o faltante' }, req);
    res.status(400).json({ error: 'Falta cabecera de confirmación de seguridad para resetear la base de datos.' });
    return;
  }

  if (!serverPasscode) {
    auditLog('RESET_ATTEMPT_DENIED', { reason: 'RESET_PASSCODE no configurado en el servidor' }, req);
    res.status(500).json({ error: 'Configuración del servidor incompleta (falta RESET_PASSCODE).' });
    return;
  }

  if (resetPasscode !== serverPasscode) {
    auditLog('RESET_ATTEMPT_DENIED', { reason: 'Código de reset de base de datos incorrecto' }, req);
    res.status(401).json({ error: 'Código de verificación de restablecimiento inválido.' });
    return;
  }

  let conn;
  try {
    conn = await pool.getConnection();
    if (isSuperAdmin) {
      // Borrar todo el inventario global y dejar vacío (sin datos ficticios)
      await conn.query('DELETE FROM software_items');
      await conn.query('DELETE FROM assets');
      auditLog('RESET_DATABASE_SUCCESS_GLOBAL', {}, req);
    } else {
      // Borrar solo los activos de la organización del admin y dejar vacío
      await conn.query('DELETE FROM software_items WHERE assetId IN (SELECT id FROM assets WHERE organizationId = ?)', [orgId]);
      await conn.query('DELETE FROM assets WHERE organizationId = ?', [orgId]);
      auditLog('RESET_DATABASE_SUCCESS_ORG', { orgId }, req);
    }
    res.json({ success: true });
  } catch (err: any) {
    auditLog('RESET_DATABASE_FAILED', { error: err.message }, req);
    next(err);
  } finally {
    if (conn) conn.release();
  }
});

// requireRole admin for next ID generation
app.get('/api/next-id', authenticateToken, requireRole(['admin']), async (req, res, next) => {
  let conn;
  try {
    const user = (req as any).user;
    const orgId = user?.orgId;
    if (!orgId) {
      res.status(400).json({ error: 'Identificador de organización faltante en la sesión.' });
      return;
    }

    conn = await pool.getConnection();
    const rows = await conn.query('SELECT id FROM assets WHERE organizationId = ?', [orgId]);
    if (!rows.length) {
      res.json({ nextId: 'TI-001' });
      return;
    }
    const ids = rows.map((r: any) => {
      const num = parseInt(r.id.replace('TI-', ''), 10);
      return isNaN(num) ? 0 : num;
    });
    const maxNum = Math.max(...ids);
    res.json({ nextId: `TI-${String(maxNum + 1).padStart(3, '0')}` });
  } catch (err: any) {
    next(err);
  } finally {
    if (conn) conn.release();
  }
});

// C3, A2 & A-07: Global Error Handler Middleware (Hides internal DB structure or message details on status 500)
// ── Routers de API ──────────────────────────────────────────────────────────
app.use('/api/assets', authenticateToken, assetsRouter);
app.use('/api/organizations', authenticateToken, organizationsRouter);
app.use('/api/ai', authenticateToken, aiRouter);

app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[SERVER ERROR]', err);
  console.error('[SERVER ERROR] Stack:', err.stack);

  const status = err.status || err.statusCode || 500;
  const isDbOrInternal = status === 500 || err.sqlState || err.code || err.errno;
  res.status(status).json({
    error: isDbOrInternal ? 'Error interno del servidor.' : (err.message || 'Error en la petición.')
  });
});

async function start() {
  // Try to seed database on startup
  await seedDatabase();
  
  // C-09: Bind to 127.0.0.1 in production to protect endpoints from direct public network access
  const BIND_IP = process.env.BIND_IP || (process.env.NODE_ENV === 'production' ? '127.0.0.1' : '0.0.0.0');

  app.listen(PORT, BIND_IP, () => {
    console.log(`API server running on http://${BIND_IP}:${PORT}`);
  });
}

start();

