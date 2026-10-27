import './config/env.js';
import cors from 'cors';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import authRoutes from './routes/auth.js';
import operationsStaffRoutes from './routes/operations-staff.js';
import customersRoutes from './routes/customers.js';
import customerAccountRoutes from './routes/customer-account.js';
import contactRoutes from './routes/contact.js';
import dashboardRoutes from './routes/dashboard.js';
import reportsRoutes from './routes/reports.js';
import locationRoutes from './routes/locations.js';
import logsRoutes from './routes/logs.js';
import ordersRoutes from './routes/orders.js';
import notificationRoutes from './routes/notifications.js';
import { reconcileNotifications } from './utils/notifications.js';
import { syncCourierOrders } from './utils/courierTracking.js';
import {rejectDisabledCustomer} from './utils/auth.js';
import { handlePayMongoWebhook } from './routes/paymongo.js';
import productsRoutes from './routes/products.js';
import ridersRoutes from './routes/riders.js';
import track123Routes from './routes/track123.js';
import { pool } from './config/db.js';
import { expireReservations } from './utils/inventory.js';
import { refreshHarvest } from './utils/harvest.js';
import {createAdminAlertQueue} from './utils/adminAlertQueue.js';

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
app.use('/api/customer/account',express.json({limit:'2mb'}));
app.use(express.json());
app.use(rejectDisabledCustomer);
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
app.use(operationsStaffRoutes);
app.use(contactRoutes);
app.use(dashboardRoutes);
app.use(reportsRoutes);
app.use(customersRoutes);
app.use(customerAccountRoutes);
app.use(productsRoutes);
app.use(locationRoutes);
app.use(logsRoutes);
app.use(ordersRoutes);
app.use(notificationRoutes);
app.use(ridersRoutes);
app.use(track123Routes);

app.use((err, _req, res, _next) => {
  void _next;
  res.status(500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

// Browser-independent expiry; row locks permit multiple server instances.
const sweepReservations = () => expireReservations(pool).catch(error => console.error('Inventory expiry:', error.message));
const sweepHarvest=()=>refreshHarvest(pool).catch(error=>console.error('Harvest monitoring:',error.message));
sweepHarvest();
setInterval(sweepHarvest,60000).unref();
sweepReservations();
setInterval(sweepReservations, 30000).unref();
const sweepNotifications=()=>reconcileNotifications().catch(error=>console.error('Notification reconciliation failed; will retry:',error.message));
sweepNotifications();
setInterval(sweepNotifications,30000).unref();
const sweepCourier=()=>syncCourierOrders().catch(error=>console.error('Courier polling:',error.message));
sweepCourier();
setInterval(sweepCourier,60000).unref();
const adminAlertQueue=createAdminAlertQueue();
const sweepAdminAlerts=()=>adminAlertQueue.runPending().catch(()=>console.error('Authentication alert queue unavailable; pending work retained'));
sweepAdminAlerts();
setInterval(sweepAdminAlerts,30000).unref();
