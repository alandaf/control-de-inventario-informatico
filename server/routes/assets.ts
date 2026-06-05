import { Router, Request, Response, NextFunction } from 'express';
import pool from '../db';
import { authenticateToken, requireRole } from '../auth';
import { auditLog } from '../audit';

const router = Router();

// Validation helper for Assets (M2)
function validateAssetInput(data: any): string | null {
  const categories = ['Computador', 'Portátil', 'Servidor', 'Redes', 'Impresora', 'Monitoreo / Seguridad', 'Otro'];
  const statuses = ['Operativo', 'En Mantenimiento', 'En Stock', 'Dado de Baja'];

  if (!data.id || typeof data.id !== 'string' || !/^TI-\d+$/.test(data.id)) {
    return 'Código de activo inválido (debe ser en formato TI-000).';
  }
  if (!data.category || !categories.includes(data.category)) {
    return 'Categoría de activo inválida o no soportada.';
  }
  if (!data.brand || typeof data.brand !== 'string' || data.brand.trim().length === 0 || data.brand.length > 150) {
    return 'La marca es requerida y debe tener menos de 150 caracteres.';
  }
  if (!data.model || typeof data.model !== 'string' || data.model.trim().length === 0 || data.model.length > 150) {
    return 'El modelo es requerido y debe tener menos de 150 caracteres.';
  }
  if (!data.serialNumber || typeof data.serialNumber !== 'string' || data.serialNumber.trim().length === 0 || data.serialNumber.length > 150) {
    return 'El número de serie es requerido y debe tener menos de 150 caracteres.';
  }
  if (data.ipAddress && typeof data.ipAddress === 'string' && data.ipAddress.trim() !== '') {
    const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    if (!ipv4Regex.test(data.ipAddress.trim())) {
      return 'Dirección IP inválida.';
    }
  }
  if (data.macAddress && typeof data.macAddress === 'string' && data.macAddress.trim() !== '') {
    const macRegex = /^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$/;
    if (!macRegex.test(data.macAddress.trim())) {
      return 'Dirección MAC inválida.';
    }
  }
  if (!data.status || !statuses.includes(data.status)) {
    return 'Estado de activo inválido.';
  }

  // Max length and validation checks for text fields (M-02)
  if (data.cargo !== undefined && (typeof data.cargo !== 'string' || data.cargo.length > 200)) {
    return 'El campo cargo no puede exceder los 200 caracteres.';
  }
  if (data.responsable !== undefined && (typeof data.responsable !== 'string' || data.responsable.length > 200)) {
    return 'El campo responsable no puede exceder los 200 caracteres.';
  }
  if (data.ubicacion !== undefined && (typeof data.ubicacion !== 'string' || data.ubicacion.length > 200)) {
    return 'El campo ubicación no puede exceder los 200 caracteres.';
  }
  if (data.specification !== undefined && (typeof data.specification !== 'string' || data.specification.length > 1000)) {
    return 'Las especificaciones técnicas no pueden exceder los 1000 caracteres.';
  }
  if (data.notes !== undefined && (typeof data.notes !== 'string' || data.notes.length > 1000)) {
    return 'Las observaciones no pueden exceder los 1000 caracteres.';
  }
  
  return null; // Valid
}

// GET /api/assets - accessible by admin, auditor and super_admin roles (RBAC - A-05)
router.get('/', authenticateToken, requireRole(['admin', 'auditor', 'super_admin']), async (req: Request, res: Response, next: NextFunction) => {
  const user = (req as any).user;
  const isSuperAdmin = user.role === 'super_admin';
  const orgId = user.orgId;

  let conn;
  try {
    conn = await pool.getConnection();
    
    let assetsQuery = 'SELECT a.*, o.name AS organizationName FROM assets a LEFT JOIN organizations o ON a.organizationId = o.id';
    let softwareQuery = 'SELECT * FROM software_items ORDER BY id ASC';
    let params: any[] = [];

    if (!isSuperAdmin) {
      assetsQuery += ' WHERE a.organizationId = ?';
      softwareQuery = 'SELECT s.* FROM software_items s INNER JOIN assets a ON s.assetId = a.id WHERE a.organizationId = ? ORDER BY s.id ASC';
      params = [orgId];
    }
    assetsQuery += ' ORDER BY a.id ASC';

    const assets = await conn.query(assetsQuery, params);
    const softwareRows = await conn.query(softwareQuery, params);

    const softwareByAsset: Record<string, any[]> = {};
    for (const sw of softwareRows) {
      if (!softwareByAsset[sw.assetId]) softwareByAsset[sw.assetId] = [];
      softwareByAsset[sw.assetId].push({
        name: sw.name,
        version: sw.version,
        licensed: !!sw.licensed,
        licenseKey: sw.licenseKey || undefined,
        licenseType: sw.licenseType,
      });
    }

    const result = assets.map((a: any) => ({
      id: a.id,
      category: a.category,
      brand: a.brand,
      model: a.model,
      serialNumber: a.serialNumber,
      ipAddress: a.ipAddress || '',
      macAddress: a.macAddress || '',
      status: a.status,
      specification: a.specification || '',
      purchaseDate: a.purchaseDate ? a.purchaseDate.toISOString().substring(0, 10) : '',
      cargo: a.cargo || '',
      responsable: a.responsable || '',
      ubicacion: a.ubicacion || '',
      organizationId: Number(a.organizationId),
      organizationName: a.organizationName || '',
      notes: a.notes || '',
      aiReport: a.ai_report || '',
      aiReportDate: a.ai_report_date ? a.ai_report_date.toISOString() : '',
      software: softwareByAsset[a.id] || [],
    }));

    res.json(result);
  } catch (err: any) {
    next(err);
  } finally {
    if (conn) conn.release();
  }
});

// POST /api/assets - requires admin or super_admin role (RBAC - A-05)
router.post('/', authenticateToken, requireRole(['admin', 'super_admin']), async (req: Request, res: Response, next: NextFunction) => {
  const valError = validateAssetInput(req.body);
  if (valError) {
    auditLog('CREATE_ASSET_FAILED', { error: valError, id: req.body.id }, req);
    res.status(400).json({ error: valError });
    return;
  }

  const user = (req as any).user;
  const isSuperAdmin = user.role === 'super_admin';
  const orgId = user.orgId;

  // Enforce correct organization id based on role
  let targetOrgId = 1;
  if (isSuperAdmin) {
    targetOrgId = req.body.organizationId ? Number(req.body.organizationId) : 1;
  } else {
    targetOrgId = orgId;
  }

  let conn;
  try {
    const { id, category, brand, model, serialNumber, ipAddress, macAddress, status, specification, purchaseDate, cargo, responsable, ubicacion, software, notes } = req.body;
    conn = await pool.getConnection();

    // Check if organization exists if we are super_admin
    if (isSuperAdmin) {
      const orgCheck = await conn.query('SELECT id FROM organizations WHERE id = ?', [targetOrgId]);
      if (orgCheck.length === 0) {
        res.status(400).json({ error: 'La organización seleccionada no existe.' });
        return;
      }
    }

    await conn.query(
      `INSERT INTO assets (id, category, brand, model, serialNumber, ipAddress, macAddress, status, specification, purchaseDate, cargo, responsable, ubicacion, organizationId, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, category, brand, model, serialNumber, ipAddress || '', macAddress || '', status, specification || '', purchaseDate, cargo || '', responsable || '', ubicacion || '', targetOrgId, notes || '']
    );
    if (software?.length) {
      for (const sw of software) {
        // Enforce maximum length validation for software name and key (M-02)
        if (!sw.name || typeof sw.name !== 'string' || sw.name.length > 150) {
          throw new Error('El nombre de software es inválido o excede los 150 caracteres.');
        }
        if (sw.licenseKey && (typeof sw.licenseKey !== 'string' || sw.licenseKey.length > 200)) {
          throw new Error('La clave de licencia del software excede los 200 caracteres.');
        }
        await conn.query(
          `INSERT INTO software_items (assetId, organizationId, name, version, licensed, licenseKey, licenseType) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [id, targetOrgId, sw.name, sw.version || '', sw.licensed ? 1 : 0, sw.licenseKey || null, sw.licenseType || '']
        );
      }
    }
    auditLog('CREATE_ASSET_SUCCESS', { id, category, brand, model, organizationId: targetOrgId }, req);
    res.status(201).json({ success: true });
  } catch (err: any) {
    next(err);
  } finally {
    if (conn) conn.release();
  }
});

// PUT /api/assets/:id - requires admin or super_admin role (RBAC - A-05)
router.put('/:id', authenticateToken, requireRole(['admin', 'super_admin']), async (req: Request, res: Response, next: NextFunction) => {
  const { id } = req.params;
  const valError = validateAssetInput({ ...req.body, id });
  if (valError) {
    auditLog('UPDATE_ASSET_FAILED', { error: valError, id }, req);
    res.status(400).json({ error: valError });
    return;
  }

  const user = (req as any).user;
  const isSuperAdmin = user.role === 'super_admin';
  const orgId = user.orgId;

  let conn;
  try {
    const { category, brand, model, serialNumber, ipAddress, macAddress, status, specification, purchaseDate, cargo, responsable, ubicacion, software, notes, organizationId } = req.body;
    conn = await pool.getConnection();

    // Check if asset exists and check tenant isolation
    const assetCheck = await conn.query('SELECT organizationId FROM assets WHERE id = ?', [id]);
    if (assetCheck.length === 0) {
      res.status(404).json({ error: 'Activo no encontrado.' });
      return;
    }

    if (!isSuperAdmin && Number(assetCheck[0].organizationId) !== orgId) {
      res.status(403).json({ error: 'Acceso denegado. El activo pertenece a otra organización.' });
      return;
    }

    let targetOrgId = Number(assetCheck[0].organizationId);
    if (isSuperAdmin && organizationId) {
      targetOrgId = Number(organizationId);
      // Check if target organization exists
      const orgCheck = await conn.query('SELECT id FROM organizations WHERE id = ?', [targetOrgId]);
      if (orgCheck.length === 0) {
        res.status(400).json({ error: 'La organización seleccionada no existe.' });
        return;
      }
    }

    await conn.query(
      `UPDATE assets SET category=?, brand=?, model=?, serialNumber=?, ipAddress=?, macAddress=?, status=?, specification=?, purchaseDate=?, cargo=?, responsable=?, ubicacion=?, organizationId=?, notes=? WHERE id=?`,
      [category, brand, model, serialNumber, ipAddress || '', macAddress || '', status, specification || '', purchaseDate, cargo || '', responsable || '', ubicacion || '', targetOrgId, notes || '', id]
    );
    // Replace software
    await conn.query('DELETE FROM software_items WHERE assetId=? AND organizationId=?', [id, targetOrgId]);
    if (software?.length) {
      for (const sw of software) {
        if (!sw.name || typeof sw.name !== 'string' || sw.name.length > 150) {
          throw new Error('El nombre de software es inválido o excede los 150 caracteres.');
        }
        if (sw.licenseKey && (typeof sw.licenseKey !== 'string' || sw.licenseKey.length > 200)) {
          throw new Error('La clave de licencia del software excede los 200 caracteres.');
        }
        await conn.query(
          `INSERT INTO software_items (assetId, organizationId, name, version, licensed, licenseKey, licenseType) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [id, targetOrgId, sw.name, sw.version || '', sw.licensed ? 1 : 0, sw.licenseKey || null, sw.licenseType || '']
        );
      }
    }
    auditLog('UPDATE_ASSET_SUCCESS', { id, category, brand, model, organizationId: targetOrgId }, req);
    res.json({ success: true });
  } catch (err: any) {
    next(err);
  } finally {
    if (conn) conn.release();
  }
});

// DELETE /api/assets/:id - requires admin or super_admin role (RBAC - A-05)
router.delete('/:id', authenticateToken, requireRole(['admin', 'super_admin']), async (req: Request, res: Response, next: NextFunction) => {
  const user = (req as any).user;
  const isSuperAdmin = user.role === 'super_admin';
  const orgId = user.orgId;
  const { id } = req.params;

  let conn;
  try {
    conn = await pool.getConnection();

    // Check if asset exists and check tenant isolation
    const assetCheck = await conn.query('SELECT organizationId FROM assets WHERE id = ?', [id]);
    if (assetCheck.length === 0) {
      res.status(404).json({ error: 'Activo no encontrado.' });
      return;
    }

    if (!isSuperAdmin && Number(assetCheck[0].organizationId) !== orgId) {
      res.status(403).json({ error: 'Acceso denegado. El activo pertenece a otra organización.' });
      return;
    }

    await conn.query('DELETE FROM assets WHERE id=?', [id]);
    auditLog('DELETE_ASSET_SUCCESS', { id }, req);
    res.json({ success: true });
  } catch (err: any) {
    next(err);
  } finally {
    if (conn) conn.release();
  }
});

// Helper to verify asset existence and tenant isolation
async function checkAssetOwnership(assetId: string, user: any, conn: any): Promise<{ exists: boolean; authorized: boolean; asset?: any }> {
  const rows = await conn.query('SELECT organizationId, category FROM assets WHERE id = ?', [assetId]);
  if (rows.length === 0) {
    return { exists: false, authorized: false };
  }
  const isSuperAdmin = user.role === 'super_admin';
  if (!isSuperAdmin && Number(rows[0].organizationId) !== user.orgId) {
    return { exists: true, authorized: false, asset: rows[0] };
  }
  return { exists: true, authorized: true, asset: rows[0] };
}

// PATCH /api/assets/:id/manual - requires admin or super_admin role (RBAC - A-05)
router.patch('/:id/manual', authenticateToken, requireRole(['admin', 'super_admin']), async (req: Request, res: Response, next: NextFunction) => {
  const { cargo, responsable, ubicacion } = req.body;
  if (
    (cargo !== undefined && (typeof cargo !== 'string' || cargo.length > 200)) ||
    (responsable !== undefined && (typeof responsable !== 'string' || responsable.length > 200)) ||
    (ubicacion !== undefined && (typeof ubicacion !== 'string' || ubicacion.length > 200))
  ) {
    res.status(400).json({ error: 'Valores de columnas manuales inválidos o exceden los 200 caracteres.' });
    return;
  }

  const user = (req as any).user;
  const { id } = req.params;

  let conn;
  try {
    conn = await pool.getConnection();
    const ownership = await checkAssetOwnership(id, user, conn);
    if (!ownership.exists) {
      res.status(404).json({ error: 'Activo no encontrado.' });
      return;
    }
    if (!ownership.authorized) {
      res.status(403).json({ error: 'Acceso denegado. El activo pertenece a otra organización.' });
      return;
    }

    await conn.query('UPDATE assets SET cargo=?, responsable=?, ubicacion=? WHERE id=?', [cargo || '', responsable || '', ubicacion || '', id]);
    auditLog('UPDATE_ASSET_MANUAL_SUCCESS', { id, cargo, responsable, ubicacion }, req);
    res.json({ success: true });
  } catch (err: any) {
    next(err);
  } finally {
    if (conn) conn.release();
  }
});

// POST /api/assets/:id/software - requires admin or super_admin role (RBAC - A-05)
router.post('/:id/software', authenticateToken, requireRole(['admin', 'super_admin']), async (req: Request, res: Response, next: NextFunction) => {
  const { name, version, licensed, licenseKey, licenseType } = req.body;
  if (!name || typeof name !== 'string' || name.trim().length === 0 || name.length > 150) {
    res.status(400).json({ error: 'Nombre de software requerido y menor a 150 caracteres.' });
    return;
  }
  if (licenseKey && (typeof licenseKey !== 'string' || licenseKey.length > 200)) {
    res.status(400).json({ error: 'La clave de licencia excede los 200 caracteres.' });
    return;
  }

  const user = (req as any).user;
  const { id } = req.params;

  let conn;
  try {
    conn = await pool.getConnection();
    const ownership = await checkAssetOwnership(id, user, conn);
    if (!ownership.exists) {
      res.status(404).json({ error: 'Activo no encontrado.' });
      return;
    }
    if (!ownership.authorized) {
      res.status(403).json({ error: 'Acceso denegado. El activo pertenece a otra organización.' });
      return;
    }

    await conn.query(
      `INSERT INTO software_items (assetId, organizationId, name, version, licensed, licenseKey, licenseType) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, Number(ownership.asset.organizationId), name, version || '', licensed ? 1 : 0, licenseKey || null, licenseType || '']
    );
    auditLog('ADD_SOFTWARE_SUCCESS', { assetId: id, softwareName: name }, req);
    res.status(201).json({ success: true });
  } catch (err: any) {
    next(err);
  } finally {
    if (conn) conn.release();
  }
});

// DELETE /api/assets/:id/software/:name - requires admin or super_admin role (RBAC - A-05)
router.delete('/:id/software/:name', authenticateToken, requireRole(['admin', 'super_admin']), async (req: Request, res: Response, next: NextFunction) => {
  const user = (req as any).user;
  const { id, name } = req.params;

  let conn;
  try {
    conn = await pool.getConnection();
    const ownership = await checkAssetOwnership(id, user, conn);
    if (!ownership.exists) {
      res.status(404).json({ error: 'Activo no encontrado.' });
      return;
    }
    if (!ownership.authorized) {
      res.status(403).json({ error: 'Acceso denegado. El activo pertenece a otra organización.' });
      return;
    }

    await conn.query('DELETE FROM software_items WHERE assetId=? AND name=?', [id, name]);
    auditLog('REMOVE_SOFTWARE_SUCCESS', { assetId: id, softwareName: name }, req);
    res.json({ success: true });
  } catch (err: any) {
    next(err);
  } finally {
    if (conn) conn.release();
  }
});

// PATCH /api/assets/:id/software/:name/toggle - requires admin or super_admin role (RBAC - A-05)
router.patch('/:id/software/:name/toggle', authenticateToken, requireRole(['admin', 'super_admin']), async (req: Request, res: Response, next: NextFunction) => {
  const user = (req as any).user;
  const { id, name } = req.params;

  let conn;
  try {
    conn = await pool.getConnection();
    const ownership = await checkAssetOwnership(id, user, conn);
    if (!ownership.exists) {
      res.status(404).json({ error: 'Activo no encontrado.' });
      return;
    }
    if (!ownership.authorized) {
      res.status(403).json({ error: 'Acceso denegado. El activo pertenece a otra organización.' });
      return;
    }

    const rows = await conn.query('SELECT licensed FROM software_items WHERE assetId=? AND name=?', [id, name]);
    if (rows.length) {
      const newLicensed = rows[0].licensed ? 0 : 1;
      const newType = newLicensed ? 'Comercial/Licencia Activa' : 'Sin Licenciar/Demo';
      await conn.query('UPDATE software_items SET licensed=?, licenseType=? WHERE assetId=? AND name=?', [newLicensed, newType, id, name]);
      auditLog('TOGGLE_SOFTWARE_LICENSE_SUCCESS', { assetId: id, softwareName: name, newLicensed }, req);
    }
    res.json({ success: true });
  } catch (err: any) {
    next(err);
  } finally {
    if (conn) conn.release();
  }
});

// POST /api/assets/:id/software/provision - requires admin or super_admin role (RBAC - A-05)
router.post('/:id/software/provision', authenticateToken, requireRole(['admin', 'super_admin']), async (req: Request, res: Response, next: NextFunction) => {
  const user = (req as any).user;
  const { id } = req.params;

  let conn;
  try {
    conn = await pool.getConnection();
    const ownership = await checkAssetOwnership(id, user, conn);
    if (!ownership.exists) {
      res.status(404).json({ error: 'Activo no encontrado.' });
      return;
    }
    if (!ownership.authorized) {
      res.status(403).json({ error: 'Acceso denegado. El activo pertenece a otra organización.' });
      return;
    }

    const category = ownership.asset.category;
    const recommendations: any[] = [];
    if (category === 'Servidor') {
      recommendations.push(
        { name: "Windows Server 2022 Core", version: "21H2", licensed: true, licenseType: "Comercial/Licencia Activa", licenseKey: "XXXXX-XXXXX-XXXXX-XXXXX-XXXXX" },
        { name: "Microsoft SQL Server 2019", version: "15.0 Enterprise", licensed: true, licenseType: "Suscripción Corp", licenseKey: "SQL-XXXXX-XXXXX" },
        { name: "Docker Daemon CE", version: "25.0.3", licensed: true, licenseType: "Libre/Gratuito" },
        { name: "Veeam Standalone Agent", version: "v12.1", licensed: true, licenseType: "Suscripción Corp", licenseKey: "VEEM-XXXXX-XXXXX" }
      );
    } else {
      recommendations.push(
        { name: "Windows 11 Pro Enterprise", version: "23H2", licensed: true, licenseType: "OEM/Bios", licenseKey: "XXXXX-XXXXX-XXXXX-XXXXX-XXXXX" },
        { name: "Microsoft 365 Apps", version: "v16.0", licensed: true, licenseType: "Suscripción Corp", licenseKey: "O365-XXXXX-XXXXX" },
        { name: "AutoCAD Map 3D", version: "2024.2", licensed: true, licenseType: "Comercial/Licencia Activa", licenseKey: "ACAD-XXXXX-XXXXX" },
        { name: "Google Chrome", version: "125.0.1", licensed: true, licenseType: "Libre/Gratuito" },
        { name: "Slack Desktop Client", version: "4.36", licensed: true, licenseType: "Libre/Gratuito" },
        { name: "WinRAR File Utility", version: "6.24 Trial", licensed: false, licenseType: "Sin Licenciar/Demo" }
      );
    }

    const assetOrgId = Number(ownership.asset.organizationId);
    await conn.query('DELETE FROM software_items WHERE assetId=? AND organizationId=?', [id, assetOrgId]);
    for (const sw of recommendations) {
      await conn.query(
        `INSERT INTO software_items (assetId, organizationId, name, version, licensed, licenseKey, licenseType) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, assetOrgId, sw.name, sw.version, sw.licensed ? 1 : 0, sw.licenseKey || null, sw.licenseType]
      );
    }
    auditLog('PROVISION_RECOMMENDED_SOFTWARE_SUCCESS', { assetId: id }, req);
    res.json({ success: true, software: recommendations });
  } catch (err: any) {
    next(err);
  } finally {
    if (conn) conn.release();
  }
});

// POST /api/assets/audit - Protected by Audit API Key verification (C-01)
router.post('/audit', async (req: Request, res: Response, next: NextFunction) => {
  // C-01: Verify shared API Key for automated audit uploads
  const auditApiKey = process.env.AUDIT_API_KEY;
  if (!auditApiKey) {
    res.status(500).json({ error: 'Configuración del servidor incompleta (falta AUDIT_API_KEY).' });
    return;
  }
  const clientKey = req.headers['x-audit-api-key'];
  if (clientKey !== auditApiKey) {
    auditLog('AUTOMATED_AUDIT_DENIED', { reason: 'API Key de auditoría inválida o faltante' }, req);
    res.status(401).json({ error: 'Acceso no autorizado. API Key de auditoría inválida o faltante.' });
    return;
  }

  const { category, brand, model, serialNumber, ipAddress, macAddress, status, specification, purchaseDate, cargo, responsable, ubicacion, software, notes, organizationId, organizationName } = req.body;
  if (!serialNumber || typeof serialNumber !== 'string' || serialNumber.trim().length === 0) {
    res.status(400).json({ error: 'serialNumber is required' });
    return;
  }

  // Sanitize IP and MAC if they are supplied
  if (ipAddress && typeof ipAddress === 'string' && ipAddress.trim() !== '') {
    const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    if (!ipv4Regex.test(ipAddress.trim())) {
      res.status(400).json({ error: 'Dirección IP inválida.' });
      return;
    }
  }
  if (macAddress && typeof macAddress === 'string' && macAddress.trim() !== '') {
    const macRegex = /^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$/;
    if (!macRegex.test(macAddress.trim())) {
      res.status(400).json({ error: 'Dirección MAC inválida.' });
      return;
    }
  }

  // Length checks for audit uploads (M-02)
  if (cargo && cargo.length > 200) {
    res.status(400).json({ error: 'El campo cargo excede los 200 caracteres.' });
    return;
  }
  if (responsable && responsable.length > 200) {
    res.status(400).json({ error: 'El campo responsable excede los 200 caracteres.' });
    return;
  }
  if (ubicacion && ubicacion.length > 200) {
    res.status(400).json({ error: 'El campo ubicación excede los 200 caracteres.' });
    return;
  }
  if (specification && specification.length > 1000) {
    res.status(400).json({ error: 'Las especificaciones técnicas exceden los 1000 caracteres.' });
    return;
  }
  if (notes && notes.length > 1000) {
    res.status(400).json({ error: 'Las observaciones exceden los 1000 caracteres.' });
    return;
  }

  let conn;
  try {
    conn = await pool.getConnection();

    // Resolve organizationId
    let targetOrgId = 1; // Default
    if (organizationId) {
      const orgCheck = await conn.query('SELECT id FROM organizations WHERE id = ?', [organizationId]);
      if (orgCheck.length > 0) {
        targetOrgId = Number(organizationId);
      }
    } else if (organizationName && typeof organizationName === 'string' && organizationName.trim().length > 0) {
      const orgCheck = await conn.query('SELECT id FROM organizations WHERE name = ?', [organizationName.trim()]);
      if (orgCheck.length > 0) {
        targetOrgId = Number(orgCheck[0].id);
      } else {
        // Create the organization automatically!
        const insertRes = await conn.query('INSERT INTO organizations (name, description) VALUES (?, ?)', [organizationName.trim(), 'Creada automáticamente mediante script de auditoría.']);
        targetOrgId = Number(insertRes.insertId);
      }
    }
    
    // Check if asset already exists by serialNumber in target organization
    const existing = await conn.query('SELECT id, cargo, responsable, ubicacion, organizationId FROM assets WHERE serialNumber = ? AND organizationId = ?', [serialNumber, targetOrgId]);
    let assetId: string;
    let action: 'updated' | 'inserted';
    
    if (existing.length > 0) {
      // Exist: update details (retaining manual columns if they are empty in current request)
      assetId = existing[0].id;
      action = 'updated';
      const currentCargo = existing[0].cargo || '';
      const currentResponsable = existing[0].responsable || '';
      const currentUbicacion = existing[0].ubicacion || '';
      const currentOrgId = Number(existing[0].organizationId);

      await conn.query(
        `UPDATE assets SET category=?, brand=?, model=?, ipAddress=?, macAddress=?, status=?, specification=?, purchaseDate=?, cargo=?, responsable=?, ubicacion=?, organizationId=?, notes=? WHERE id=?`,
        [
          category || 'Computador',
          brand || 'Genérica',
          model || 'Desconocido',
          ipAddress || '',
          macAddress || '',
          status || 'Operativo',
          specification || '',
          purchaseDate || new Date().toISOString().substring(0, 10),
          cargo || currentCargo,
          responsable || currentResponsable,
          ubicacion || currentUbicacion,
          targetOrgId,
          notes || '',
          assetId
        ]
      );
    } else {
      // Does not exist: insert new asset. Retrieve next TI-xxx ID.
      action = 'inserted';
      const rows = await conn.query('SELECT id FROM assets WHERE organizationId = ?', [targetOrgId]);
      let nextIdVal = 'TI-001';
      if (rows.length > 0) {
        const ids = rows.map((r: any) => {
          const num = parseInt(r.id.replace('TI-', ''), 10);
          return isNaN(num) ? 0 : num;
        });
        const maxNum = Math.max(...ids);
        nextIdVal = `TI-${String(maxNum + 1).padStart(3, '0')}`;
      }
      assetId = nextIdVal;

      await conn.query(
        `INSERT INTO assets (id, category, brand, model, serialNumber, ipAddress, macAddress, status, specification, purchaseDate, cargo, responsable, ubicacion, organizationId, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          assetId,
          category || 'Computador',
          brand || 'Genérica',
          model || 'Desconocido',
          serialNumber,
          ipAddress || '',
          macAddress || '',
          status || 'Operativo',
          specification || '',
          purchaseDate || new Date().toISOString().substring(0, 10),
          cargo || '',
          responsable || '',
          ubicacion || '',
          targetOrgId,
          notes || ''
        ]
      );
    }

    // Replace software list for this asset
    await conn.query('DELETE FROM software_items WHERE assetId = ? AND organizationId = ?', [assetId, targetOrgId]);
    if (software && software.length > 0) {
      for (const sw of software) {
        if (!sw.name || typeof sw.name !== 'string' || sw.name.length > 150) {
          throw new Error('El nombre de software es inválido o excede los 150 caracteres.');
        }
        if (sw.licenseKey && (typeof sw.licenseKey !== 'string' || sw.licenseKey.length > 200)) {
          throw new Error('La clave de licencia del software excede los 200 caracteres.');
        }
        await conn.query(
          `INSERT INTO software_items (assetId, organizationId, name, version, licensed, licenseKey, licenseType) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            assetId,
            targetOrgId,
            sw.name,
            sw.version || '',
            sw.licensed ? 1 : 0,
            sw.licenseKey || null,
            sw.licenseType || 'Libre/Gratuito'
          ]
        );
      }
    }

    auditLog('AUTOMATED_AUDIT_UPLOAD_SUCCESS', { serialNumber, assetId, action, organizationId: targetOrgId }, req);
    res.json({ success: true, assetId, action });
  } catch (err: any) {
    next(err);
  } finally {
    if (conn) conn.release();
  }
});

export default router;
