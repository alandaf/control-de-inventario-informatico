import { Router, Request, Response, NextFunction } from 'express';
import pool from '../db';
import { authenticateToken, requireRole } from '../auth';
import { auditLog } from '../audit';

const router = Router();

// GET /api/organizations - Public endpoint (no token required) to populate login dropdown
router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  let conn;
  try {
    conn = await pool.getConnection();
    const rows = await conn.query('SELECT id, name, username, description, created_at FROM organizations ORDER BY name ASC');
    const result = rows.map((r: any) => ({
      id: Number(r.id),
      name: r.name,
      username: r.username,
      description: r.description || '',
      created_at: r.created_at
    }));
    res.json(result);
  } catch (err) {
    next(err);
  } finally {
    if (conn) conn.release();
  }
});

// POST /api/organizations - Protected, only super_admin can create
router.post('/', authenticateToken, requireRole(['super_admin']), async (req: Request, res: Response, next: NextFunction) => {
  const { name, username, password, description } = req.body;
  if (!name || typeof name !== 'string' || name.trim().length === 0 || name.length > 150) {
    res.status(400).json({ error: 'El nombre de la organización es requerido y debe tener menos de 150 caracteres.' });
    return;
  }
  if (!username || typeof username !== 'string' || username.trim().length === 0 || username.length > 100) {
    res.status(400).json({ error: 'El nombre de usuario para el login es requerido.' });
    return;
  }
  if (!password || typeof password !== 'string' || password.trim().length === 0) {
    res.status(400).json({ error: 'La contraseña para el login es requerida.' });
    return;
  }

  let conn;
  try {
    conn = await pool.getConnection();
    
    // Check if name already exists
    const existing = await conn.query('SELECT id FROM organizations WHERE name = ?', [name.trim()]);
    if (existing.length > 0) {
      res.status(400).json({ error: 'Ya existe una organización con ese nombre.' });
      return;
    }

    // Check if username already exists
    const existingUser = await conn.query('SELECT id FROM organizations WHERE username = ?', [username.trim()]);
    if (existingUser.length > 0) {
      res.status(400).json({ error: 'Ya existe una organización con ese nombre de usuario.' });
      return;
    }

    const result = await conn.query(
      'INSERT INTO organizations (name, username, password, description) VALUES (?, ?, ?, ?)',
      [name.trim(), username.trim(), password, description || '']
    );
    const newId = Number(result.insertId);

    auditLog('CREATE_ORGANIZATION_SUCCESS', { name: name.trim(), id: newId }, req);
    res.status(201).json({ success: true, id: newId });
  } catch (err) {
    next(err);
  } finally {
    if (conn) conn.release();
  }
});

// PUT /api/organizations/:id - Protected, only super_admin can edit
router.put('/:id', authenticateToken, requireRole(['super_admin']), async (req: Request, res: Response, next: NextFunction) => {
  const { id } = req.params;
  const { name, username, password, description } = req.body;
  if (!name || typeof name !== 'string' || name.trim().length === 0 || name.length > 150) {
    res.status(400).json({ error: 'El nombre de la organización es requerido y debe tener menos de 150 caracteres.' });
    return;
  }
  if (!username || typeof username !== 'string' || username.trim().length === 0 || username.length > 100) {
    res.status(400).json({ error: 'El nombre de usuario administrador es requerido.' });
    return;
  }

  let conn;
  try {
    conn = await pool.getConnection();

    // Check if name is taken by other organization
    const existing = await conn.query('SELECT id FROM organizations WHERE name = ? AND id != ?', [name.trim(), id]);
    if (existing.length > 0) {
      res.status(400).json({ error: 'Ya existe otra organización con ese nombre.' });
      return;
    }

    // Check if username is taken by other organization
    const existingUser = await conn.query('SELECT id FROM organizations WHERE username = ? AND id != ?', [username.trim(), id]);
    if (existingUser.length > 0) {
      res.status(400).json({ error: 'Ya existe otra organización con ese nombre de usuario.' });
      return;
    }

    let query = 'UPDATE organizations SET name = ?, username = ?, description = ?';
    const params = [name.trim(), username.trim(), description || ''];
    if (password && typeof password === 'string' && password.trim().length > 0) {
      query += ', password = ?';
      params.push(password);
    }
    query += ' WHERE id = ?';
    params.push(id);

    const result = await conn.query(query, params);

    if (result.affectedRows === 0) {
      res.status(404).json({ error: 'Organización no encontrada.' });
      return;
    }

    auditLog('UPDATE_ORGANIZATION_SUCCESS', { id, name: name.trim() }, req);
    res.json({ success: true });
  } catch (err) {
    next(err);
  } finally {
    if (conn) conn.release();
  }
});

// DELETE /api/organizations/:id - Protected, only super_admin can delete
router.delete('/:id', authenticateToken, requireRole(['super_admin']), async (req: Request, res: Response, next: NextFunction) => {
  const { id } = req.params;

  let conn;
  try {
    conn = await pool.getConnection();
    const result = await conn.query('DELETE FROM organizations WHERE id = ?', [id]);

    if (result.affectedRows === 0) {
      res.status(404).json({ error: 'Organización no encontrada.' });
      return;
    }

    // Due to FOREIGN KEY CASCADE, all linked assets and software items will be deleted automatically by MariaDB
    auditLog('DELETE_ORGANIZATION_SUCCESS', { id }, req);
    res.json({ success: true });
  } catch (err) {
    next(err);
  } finally {
    if (conn) conn.release();
  }
});

export default router;
