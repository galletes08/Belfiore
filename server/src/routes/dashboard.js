import { Router } from 'express';
import { pool } from '../config/db.js';

const router = Router();

router.get('/api/admin/dashboard', async (_req, res) => {
  try {
    const salesQuery = `
      WITH months AS (
        SELECT generate_series(
          date_trunc('month', now()) - interval '5 months',
          date_trunc('month', now()),
          interval '1 month'
        ) AS month_start
      )
      SELECT
        to_char(m.month_start, 'Mon') AS month,
        COALESCE(SUM(o.total_amount), 0)::float AS value
      FROM months m
      LEFT JOIN orders o
        ON date_trunc('month', o.created_at) = m.month_start
      GROUP BY m.month_start
      ORDER BY m.month_start;
    `;

    const lowStockQuery = `
      SELECT
        name,
        stock AS qty
      FROM products
      WHERE stock <= 5
      ORDER BY stock ASC, name ASC
      LIMIT 8;
    `;

    const recentOrdersQuery = `
      SELECT
        id,
        customer_name AS customer,
        created_at AS date,
        status,
        total_amount AS total
      FROM orders
      ORDER BY created_at DESC
      LIMIT 5;
    `;

    const monthlyTotalsQuery = `
      SELECT
        COALESCE(SUM(total_amount), 0)::float AS monthly_sales,
        COUNT(*)::int AS monthly_orders
      FROM orders
      WHERE created_at >= date_trunc('month', now());
    `;

    const [salesData, lowStock, recentOrders, totalsResult] = await Promise.all([
      pool.query(salesQuery),
      pool.query(lowStockQuery),
      pool.query(recentOrdersQuery),
      pool.query(monthlyTotalsQuery),
    ]);

    const totalsRow = totalsResult.rows[0] || {};

    res.json({
      salesData: salesData.rows,
      lowStock: lowStock.rows,
      recentOrders: recentOrders.rows,
      totals: {
        monthlySales: Number(totalsRow.monthly_sales || 0),
        monthlyOrders: Number(totalsRow.monthly_orders || 0),
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to load dashboard' });
  }
});

export default router;
