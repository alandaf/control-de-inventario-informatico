import pool from './db';
import { INITIAL_ASSET_TEMPLATES } from './defaultInventory';

export async function seedDatabase() {
  let conn;
  try {
    conn = await pool.getConnection();

    // 1. Create organizations table if it doesn't exist
    await conn.query(`
      CREATE TABLE IF NOT EXISTS organizations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(150) NOT NULL UNIQUE,
        username VARCHAR(100) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Ensure columns username and password exist (migration for existing database)
    const checkUsernameCol = await conn.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'organizations' 
        AND COLUMN_NAME = 'username'
    `);
    if (checkUsernameCol.length === 0) {
      await conn.query(`
        ALTER TABLE organizations 
        ADD COLUMN username VARCHAR(100) NOT NULL DEFAULT 'admin',
        ADD COLUMN password VARCHAR(255) NOT NULL DEFAULT 'Chito001_'
      `);
      // Update values for existing rows using process.env
      await conn.query(`UPDATE organizations SET username = ?, password = ? WHERE id = 1`, [process.env.ADMIN_USER || 'admin', process.env.ADMIN_PASS || 'Chito001_']);
      // Remove defaults after adding so they are not hardcoded
      await conn.query("ALTER TABLE organizations ALTER COLUMN username DROP DEFAULT");
      await conn.query("ALTER TABLE organizations ALTER COLUMN password DROP DEFAULT");
    }

    // 2. Insert default Organization (ID 1) if not present
    const orgs = await conn.query('SELECT COUNT(*) as count FROM organizations WHERE id = 1');
    if (Number(orgs[0].count) === 0) {
      await conn.query(
        "INSERT INTO organizations (id, name, username, password, description) VALUES (1, 'Organización de TI Principal', ?, ?, 'Organización inicial del inventario.')",
        [process.env.ADMIN_USER || 'admin', process.env.ADMIN_PASS || 'Chito001_']
      );
    }

    // 3. Check for organizationId in assets table
    const checkOrgCol = await conn.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'assets' 
        AND COLUMN_NAME = 'organizationId'
    `);
    if (checkOrgCol.length === 0) {
      // Add column
      await conn.query("ALTER TABLE assets ADD COLUMN organizationId INT NOT NULL DEFAULT 1");
      // Add foreign key constraint with CASCADE delete
      await conn.query("ALTER TABLE assets ADD CONSTRAINT fk_assets_organization FOREIGN KEY (organizationId) REFERENCES organizations(id) ON DELETE CASCADE");
    }

    // 4. Check for notes in assets table
    const checkNotesCol = await conn.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'assets' 
        AND COLUMN_NAME = 'notes'
    `);
    if (checkNotesCol.length === 0) {
      await conn.query("ALTER TABLE assets ADD COLUMN notes TEXT DEFAULT ''");
    }

    // 5. Check for ai_report in assets table
    const checkAIReportCol = await conn.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'assets' 
        AND COLUMN_NAME = 'ai_report'
    `);
    if (checkAIReportCol.length === 0) {
      await conn.query("ALTER TABLE assets ADD COLUMN ai_report TEXT DEFAULT NULL");
    }

    // 6. Check for ai_report_date in assets table
    const checkAIReportDateCol = await conn.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'assets' 
        AND COLUMN_NAME = 'ai_report_date'
    `);
    if (checkAIReportDateCol.length === 0) {
      await conn.query("ALTER TABLE assets ADD COLUMN ai_report_date DATETIME DEFAULT NULL");
    }

    // Initial assets seeding is disabled to allow starting with a clean empty database
    // as requested by the user.
    console.log('Database schema and migrations loaded. Seeding skipped to maintain empty state.');
  } catch (err) {
    console.error('Seed error:', err);
  } finally {
    if (conn) conn.release();
  }
}
