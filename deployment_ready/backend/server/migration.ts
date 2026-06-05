import pool from './db';

export async function runMigration() {
  let conn;
  try {
    conn = await pool.getConnection();
    console.log('[MIGRATION] Iniciando migración de clave compuesta...');

    // Desactivar temporalmente FK checks para permitir el cambio de PK/FK sin conflictos
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');

    // 1. Eliminar claves foráneas antiguas de software_items
    try {
      await conn.query('ALTER TABLE software_items DROP FOREIGN KEY software_items_ibfk_1');
      console.log('[MIGRATION] Antigua clave foránea software_items_ibfk_1 eliminada.');
    } catch (e) {}
    try {
      await conn.query('ALTER TABLE software_items DROP FOREIGN KEY fk_software_assets_composite');
    } catch (e) {}

    // 2. Modificar la clave primaria de assets a compuesta (id, organizationId)
    try {
      await conn.query('ALTER TABLE assets DROP PRIMARY KEY');
      await conn.query('ALTER TABLE assets ADD PRIMARY KEY (id, organizationId)');
      console.log('[MIGRATION] Clave primaria compuesta (id, organizationId) creada en assets.');
    } catch (e: any) {
      if (e.message.includes('Multiple primary key defined')) {
        console.log('[MIGRATION] Nota: La clave primaria compuesta ya estaba definida.');
      } else {
        console.warn('[MIGRATION] Error alterando PK de assets:', e.message);
      }
    }

    // 2b. Modificar la clave única de serialNumber a compuesta (serialNumber, organizationId)
    try {
      try {
        await conn.query('ALTER TABLE assets DROP INDEX serialNumber');
        console.log('[MIGRATION] Antiguo índice único serialNumber eliminado.');
      } catch (e) {}
      try {
        await conn.query('ALTER TABLE assets DROP INDEX uq_assets_serial_org');
      } catch (e) {}

      await conn.query('ALTER TABLE assets ADD UNIQUE KEY uq_assets_serial_org (serialNumber, organizationId)');
      console.log('[MIGRATION] Nuevo índice único compuesto uq_assets_serial_org (serialNumber, organizationId) establecido.');
    } catch (e: any) {
      console.warn('[MIGRATION] Error alterando índice único de assets:', e.message);
    }

    // 3. Modificar software_items para incluir organizationId y la clave foránea compuesta
    const columns: any = await conn.query("SHOW COLUMNS FROM software_items LIKE 'organizationId'");
    if (columns.length === 0) {
      await conn.query('ALTER TABLE software_items ADD COLUMN organizationId INT NOT NULL DEFAULT 1');
      console.log('[MIGRATION] Columna organizationId añadida a software_items.');
    }

    // Sincronizar organizationId en software_items basándose en su asset respectivo
    await conn.query('UPDATE software_items s INNER JOIN assets a ON s.assetId = a.id SET s.organizationId = a.organizationId');
    console.log('[MIGRATION] Sincronizados organizationId en software_items.');

    // 4. Agregar clave foránea compuesta a software_items
    try {
      try {
        await conn.query('ALTER TABLE software_items DROP FOREIGN KEY fk_software_assets_composite');
      } catch (e) {}

      await conn.query(`
        ALTER TABLE software_items 
        ADD CONSTRAINT fk_software_assets_composite 
        FOREIGN KEY (assetId, organizationId) 
        REFERENCES assets(id, organizationId) 
        ON DELETE CASCADE
        ON UPDATE CASCADE
      `);
      console.log('[MIGRATION] Nueva clave foránea compuesta fk_software_assets_composite establecida.');
    } catch (e: any) {
      if (e.message.includes('Duplicate key name') || e.message.includes('already exists')) {
        console.log('[MIGRATION] Nota: La clave foránea compuesta ya existe.');
      } else {
        console.warn('[MIGRATION] Error creando la nueva FK compuesta:', e.message);
      }
    }

    // Reactivar FK checks
    await conn.query('SET FOREIGN_KEY_CHECKS = 1');

    console.log('[MIGRATION] Migración completada exitosamente.');
  } catch (err: any) {
    console.error('[MIGRATION] Error crítico durante la migración de base de datos:', err);
    throw err;
  } finally {
    if (conn) conn.release();
  }
}
