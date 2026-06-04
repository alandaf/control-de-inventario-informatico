import { createConnection } from 'mariadb';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

async function test() {
  console.log('--- TEST DE CONEXION ---');
  console.log('DB_HOST:', process.env.DB_HOST || '127.0.0.1');
  console.log('DB_PORT:', process.env.DB_PORT || '3306');
  console.log('DB_USER:', process.env.DB_USER);
  console.log('DB_NAME:', process.env.DB_NAME);
  
  try {
    const conn = await createConnection({
      host: process.env.DB_HOST || '127.0.0.1',
      port: Number(process.env.DB_PORT) || 3306,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME
    });
    console.log('\n✅ ¡CONEXIÓN EXITOSA CON MARIADB!');
    await conn.end();
  } catch (err) {
    console.error('\n❌ ERROR DE CONEXIÓN DETALLADO:\n', err);
  }
}

test();
