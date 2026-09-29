import './config/env.js';
import cors from 'cors';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import authRoutes from './routes/auth.js';
import customersRoutes from './routes/customers.js';
import contactRoutes from './routes/contact.js';
import dashboardRoutes from './routes/dashboard.js';
import locationRoutes from './routes/locations.js';
import ordersRoutes from './routes/orders.js';
import { handlePayMongoWebhook } from './routes/paymongo.js';
import productsRoutes from './routes/products.js';
import ridersRoutes from './routes/riders.js';
import track123Routes from './routes/track123.js';
import { pool } from './config/db.js';

const app = express();
const PORT = Number(process.env.PORT || 3001);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.resolve(__dirname, '../uploads');

const allowedOrigins = String(process.env.FRONTEND_URL || '')
  .split(',')
  .map((origin) => origin.trim().replace(/\/$/, ''))
  .filter(Boolean);
app.use(cors({
  origin: allowedOrigins.length ? allowedOrigins : true,
  credentials: false,
}));
app.post('/api/paymongo/webhook', express.raw({ type: 'application/json' }), handlePayMongoWebhook);
app.use(express.json());
app.use('/uploads', express.static(uploadsDir));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/db-check', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get('/api/health/db', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, database: 'connected' });
  } catch {
    res.status(503).json({ ok: false, database: 'unavailable' });
  }
});

app.use(authRoutes);
app.use(contactRoutes);
app.use(dashboardRoutes);
app.use(customersRoutes);
app.use(productsRoutes);
app.use(locationRoutes);
app.use(ordersRoutes);
app.use(ridersRoutes);
app.use(track123Routes);

app.use((err, _req, res, _next) => {
  void _next;
  res.status(500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
