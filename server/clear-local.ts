import { createConnection } from 'mariadb';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

async function main() {
  console.log('Clearing local MariaDB database...');
  console.log('DB_HOST:', process.env.DB_HOST || '127.0.0.1');
  console.log('DB_NAME:', process.env.DB_NAME);

  try {
    const conn = await createConnection({
      host: process.env.DB_HOST || '127.0.0.1',
      port: Number(process.env.DB_PORT) || 3306,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME
    });

    console.log('Deleting software_items...');
    await conn.query('DELETE FROM software_items');

    console.log('Deleting assets...');
    await conn.query('DELETE FROM assets');

    console.log('✅ DB cleared successfully!');
    await conn.end();
  } catch (err) {
    console.error('Error clearing DB:', err);
  }
}

main();
