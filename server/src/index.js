import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import authRoutes from './routes/auth.js';
import dashboardRoutes from './routes/dashboard.js';
import ordersRoutes from './routes/orders.js';
import productsRoutes from './routes/products.js';
import { pool } from './config/db.js';

const app = express();
const PORT = Number(process.env.PORT || 3001);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.resolve(__dirname, '../uploads');

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(uploadsDir));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/db-check', async (_req, res) => {
  try {
    const result = await pool.query('SELECT current_database() AS db, NOW() AS now');
    res.json({ ok: true, ...result.rows[0] });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.use(authRoutes);
app.use(dashboardRoutes);
app.use(productsRoutes);
app.use(ordersRoutes);

app.use((err, _req, res, _next) => {
  res.status(500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
