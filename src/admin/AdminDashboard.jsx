import { useEffect, useMemo, useState } from 'react';
import { apiDashboard } from '../api/client';

const statusStyles = {
  shipped: 'bg-green-100 text-green-800',
  delivered: 'bg-green-100 text-green-800',
  processing: 'bg-amber-100 text-amber-800',
  pending: 'bg-amber-100 text-amber-800',
};

export default function AdminDashboard() {
  const [chartView, setChartView] = useState('monthly');
  const [salesData, setSalesData] = useState([]);
  const [lowStock, setLowStock] = useState([]);
  const [recentOrders, setRecentOrders] = useState([]);
  const [totals, setTotals] = useState({ monthlySales: 0, monthlyOrders: 0 });
  const [error, setError] = useState('');

  const maxSales = useMemo(() => {
    if (!salesData.length) return 1;
    return Math.max(...salesData.map((d) => Number(d.value) || 0), 1);
  }, [salesData]);

  useEffect(() => {
    let isMounted = true;

    async function loadDashboard() {
      try {
        const data = await apiDashboard();
        if (!isMounted) return;

        setSalesData(Array.isArray(data.salesData) ? data.salesData : []);
        setLowStock(Array.isArray(data.lowStock) ? data.lowStock : []);
        setRecentOrders(Array.isArray(data.recentOrders) ? data.recentOrders : []);
        setTotals({
          monthlySales: Number(data.totals?.monthlySales) || 0,
          monthlyOrders: Number(data.totals?.monthlyOrders) || 0,
        });
        setError('');
      } catch (err) {
        if (!isMounted) return;
        setError(err.message || 'Failed to load dashboard');
      }
    }

    loadDashboard();
    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className="max-w-300 mx-auto">
      {error ? (
        <div className="mb-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-6 mb-6">
        <div className="bg-white rounded-[10px] p-6 shadow-sm">
          <h3 className="m-0 mb-2 text-[0.95rem] font-semibold text-gray-500">Total Sales</h3>
          <p className="m-0 text-2xl font-bold text-[#2d5a45]">
            ${totals.monthlySales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="mt-1 text-sm text-gray-500">This Month</p>
        </div>
        <div className="bg-white rounded-[10px] p-6 shadow-sm">
          <h3 className="m-0 mb-2 text-[0.95rem] font-semibold text-gray-500">Total Orders</h3>
          <p className="m-0 text-2xl font-bold text-gray-800">{totals.monthlyOrders}</p>
          <p className="mt-1 text-sm text-gray-500">This Month</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 mb-6">
        <div className="bg-white rounded-[10px] p-6 shadow-sm">
          <h3 className="m-0 mb-4 text-[1.1rem] font-bold text-gray-800">Sales Chart</h3>
          <div className="flex gap-2 mb-4">
            <button
              type="button"
              onClick={() => setChartView('daily')}
              className={`px-4 py-1.5 border rounded-md text-sm cursor-pointer ${chartView === 'daily' ? 'bg-[#2d5a45] text-white border-[#2d5a45]' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}
            >
              Daily
            </button>
            <button
              type="button"
              onClick={() => setChartView('monthly')}
              className={`px-4 py-1.5 border rounded-md text-sm cursor-pointer ${chartView === 'monthly' ? 'bg-[#2d5a45] text-white border-[#2d5a45]' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}
            >
              Monthly
            </button>
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex justify-end gap-4 text-xs text-gray-500 h-4">
              <span>$0</span>
              <span>$1k</span>
              <span>$2k</span>
              <span>$4k</span>
            </div>
            <div className="h-[140px] w-full">
              <svg viewBox="0 0 400 120" className="w-full h-full" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="chartGradient" x1="0" x2="0" y1="1" y2="0">
                    <stop offset="0%" stopColor="#2d5a45" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="#2d5a45" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path
                  fill="none"
                  stroke="#2d5a45"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d={salesData.map((d, i) => {
                    const x = (i / Math.max(salesData.length - 1, 1)) * 400;
                    const y = 100 - (Number(d.value) / maxSales) * 80;
                    return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
                  }).join(' ')}
                />
                <path
                  fill="url(#chartGradient)"
                  d={`${salesData.map((d, i) => {
                    const x = (i / Math.max(salesData.length - 1, 1)) * 400;
                    const y = 100 - (Number(d.value) / maxSales) * 80;
                    return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
                  }).join(' ')} L 400 100 L 0 100 Z`}
                />
                {salesData.map((d, i) => {
                  const x = (i / Math.max(salesData.length - 1, 1)) * 400;
                  const y = 100 - (Number(d.value) / maxSales) * 80;
                  return (
                    <circle
                      key={`${d.month}-${i}`}
                      cx={x}
                      cy={y}
                      r="4"
                      fill="#2d5a45"
                    />
                  );
                })}
              </svg>
            </div>
            <div className="flex justify-between text-xs text-gray-500 pr-8">
              {salesData.map((d, i) => (
                <span key={`${d.month}-${i}`}>{d.month}</span>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-[10px] p-6 shadow-sm">
          <h3 className="m-0 mb-2 text-[1.1rem] font-bold text-gray-800">Low Stock Alert</h3>
          <p className="text-red-600 text-sm font-semibold m-0 mb-4">Restock Needed</p>
          <div className="grid grid-cols-2 gap-3">
            {lowStock.map((item, i) => (
              <div key={`${item.name}-${i}`} className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg">
                <span className="text-2xl">P</span>
                <div>
                  <p className="m-0 text-sm font-semibold text-gray-800">{item.name}</p>
                  <p className="m-0.5 mt-0 text-[0.8rem] text-gray-600">{item.qty} Left</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-[10px] p-6 shadow-sm">
        <h3 className="m-0 mb-4 text-[1.1rem] font-bold text-gray-800">Recent Orders</h3>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="text-left py-3 px-4 font-semibold text-gray-500 bg-gray-50 border-b border-gray-200">Order ID</th>
              <th className="text-left py-3 px-4 font-semibold text-gray-500 bg-gray-50 border-b border-gray-200">Customer</th>
              <th className="text-left py-3 px-4 font-semibold text-gray-500 bg-gray-50 border-b border-gray-200">Date</th>
              <th className="text-left py-3 px-4 font-semibold text-gray-500 bg-gray-50 border-b border-gray-200">Status</th>
              <th className="text-left py-3 px-4 font-semibold text-gray-500 bg-gray-50 border-b border-gray-200">Total</th>
            </tr>
          </thead>
          <tbody>
            {recentOrders.map((order) => (
              <tr key={order.id} className="hover:bg-gray-50 border-b border-gray-100">
                <td className="py-3 px-4">{String(order.id).startsWith('#') ? order.id : `#${order.id}`}</td>
                <td className="py-3 px-4">{order.customer}</td>
                <td className="py-3 px-4">{new Date(order.date).toLocaleDateString()}</td>
                <td className="py-3 px-4">
                  <span className={`inline-block py-1 px-2.5 rounded-full text-xs font-medium ${statusStyles[String(order.status).toLowerCase()] || 'bg-gray-100 text-gray-700'}`}>
                    {order.status}
                  </span>
                </td>
                <td className="py-3 px-4">${Number(order.total || 0).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
