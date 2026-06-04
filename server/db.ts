import { createPool } from 'mariadb';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables before creating the pool
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });
dotenv.config({ path: path.resolve(__dirname, '..', '.env.local') });

// C-02 & C-06: Strict DB configuration validation without weak defaults
const DB_HOST = process.env.DB_HOST;
const DB_PORT = process.env.DB_PORT ? Number(process.env.DB_PORT) : undefined;
const DB_USER = process.env.DB_USER;
const DB_PASSWORD = process.env.DB_PASSWORD;
const DB_NAME = process.env.DB_NAME;

if (!DB_HOST || !DB_PORT || !DB_USER || DB_PASSWORD === undefined || !DB_NAME) {
  console.error('[DATABASE CONFIG ERROR] Falta configurar variables de entorno para la base de datos (DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME).');
  process.exit(1);
}

// Warning for root without password
if (DB_USER === 'root' && DB_PASSWORD === '') {
  console.warn('[SECURITY WARNING] La base de datos está conectada como root sin contraseña. Esto representa un riesgo alto en producción (C-06).');
}

const pool = createPool({
  host: DB_HOST,
  port: DB_PORT,
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  connectionLimit: 5,
});

export default pool;
