import './env.js';
import pg from 'pg';

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    'DATABASE_URL is missing. Create server/.env from server/.env.example and set your real PostgreSQL credentials.'
  );
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});
