import { useEffect, useMemo, useState } from 'react';
import { apiAdminOrders, apiAdminRiders, apiSyncOrderTrack123, apiUpdateOrder } from '../api/client';

const STATUS_FILTERS = [
  { key: 'All', label: 'All' },
  { key: 'Pending', label: 'Pending' },
  { key: 'Preparing', label: 'Preparing' },
  { key: 'Out for Delivery', label: 'Out of Delivery' },
  { key: 'Cancelled', label: 'Cancelled' },
  { key: 'Delivered', label: 'Delivered' },
];

const ORDER_STATUS_OPTIONS = ['Pending', 'Preparing', 'Out for Delivery', 'Delivered', 'Cancelled'];
const TRACKING_STATUS_OPTIONS = ['Pending', 'Preparing', 'Packed', 'In Transit', 'Out for Delivery', 'Delivered', 'Cancelled'];

const badgeStyles = {
  Pending: 'bg-amber-100 text-amber-800',
  Preparing: 'bg-sky-100 text-sky-800',
  'Out for Delivery': 'bg-violet-100 text-violet-800',
  Delivered: 'bg-emerald-100 text-emerald-800',
  Cancelled: 'bg-rose-100 text-rose-700',
  Packed: 'bg-cyan-100 text-cyan-800',
  'In Transit': 'bg-indigo-100 text-indigo-800',
};

const emptyForm = {
  status: 'Pending',
  deliveryMode: 'rider',
  riderId: '',
  trackingCode: '',
  trackingCourierCode: '',
  trackingStatus: 'Pending',
};

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function badgeClass(value) {
  return badgeStyles[value] || 'bg-gray-100 text-gray-700';
}

function buildDriverPortalUrl(token) {
  if (!token || typeof window === 'undefined') return '';
  return `${window.location.origin}/driver/${token}`;
}

export default function AdminOrders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [riders, setRiders] = useState([]);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('All');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [syncingTrack123, setSyncingTrack123] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadOrders() {
      setLoading(true);
      try {
        const [ordersData, ridersData] = await Promise.all([apiAdminOrders(), apiAdminRiders()]);
        if (!isMounted) return;
        setOrders(Array.isArray(ordersData) ? ordersData : []);
        setRiders(Array.isArray(ridersData) ? ridersData : []);
        setError('');
      } catch (err) {
        if (!isMounted) return;
        setError(err.message || 'Failed to load orders');
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadOrders();
    return () => {
      isMounted = false;
    };
  }, []);

  const counts = useMemo(() => {
    const next = { All: orders.length };
    for (const filter of STATUS_FILTERS) {
      if (filter.key === 'All') continue;
      next[filter.key] = orders.filter((order) => order.status === filter.key).length;
    }
    return next;
  }, [orders]);

  const filteredOrders = useMemo(() => {
    const query = search.trim().toLowerCase();
    return orders.filter((order) => {
      if (activeFilter !== 'All' && order.status !== activeFilter) return false;
      if (!query) return true;

      const haystack = [
        order.orderCode,
        order.customerName,
        order.gmail,
        order.mobileNumber,
        order.location,
        order.courierName,
        order.trackingCode,
        order.trackingStatus,
        order.status,
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [activeFilter, orders, search]);

  const openEditor = (order) => {
    setSelectedOrder(order);
    setForm({
      status: order.status || 'Pending',
      deliveryMode: order.deliveryMode || 'rider',
      riderId: order.riderId ? String(order.riderId) : '',
      trackingCode: order.trackingCode || '',
      trackingCourierCode: order.trackingCourierCode || '',
      trackingStatus: order.trackingStatus || 'Pending',
    });
    setError('');
  };

  const closeEditor = () => {
    setSelectedOrder(null);
    setForm(emptyForm);
    setSaving(false);
    setSyncingTrack123(false);
  };

  const handleSave = async (event) => {
    event.preventDefault();
    if (!selectedOrder) return;

    setSaving(true);
    setError('');

    try {
      const updatedOrder = await apiUpdateOrder(selectedOrder.id, form);
      setOrders((current) => current.map((order) => (order.id === updatedOrder.id ? updatedOrder : order)));
      setSelectedOrder(updatedOrder);
      setForm({
        status: updatedOrder.status,
        deliveryMode: updatedOrder.deliveryMode || 'rider',
        riderId: updatedOrder.riderId ? String(updatedOrder.riderId) : '',
        trackingCode: updatedOrder.trackingCode || '',
        trackingCourierCode: updatedOrder.trackingCourierCode || '',
        trackingStatus: updatedOrder.trackingStatus || 'Pending',
      });
    } catch (err) {
      setError(err.message || 'Failed to update order');
    } finally {
      setSaving(false);
    }
  };

  const handleTrack123Sync = async () => {
    if (!selectedOrder) return;

    setSyncingTrack123(true);
    setError('');

    try {
      const savedOrder = await apiUpdateOrder(selectedOrder.id, form);
      const updatedOrder = await apiSyncOrderTrack123(savedOrder.id);
      setOrders((current) => current.map((order) => (order.id === updatedOrder.id ? updatedOrder : order)));
      setSelectedOrder(updatedOrder);
      setForm({
        status: updatedOrder.status,
        deliveryMode: updatedOrder.deliveryMode || 'rider',
        riderId: updatedOrder.riderId ? String(updatedOrder.riderId) : '',
        trackingCode: updatedOrder.trackingCode || '',
        trackingCourierCode: updatedOrder.trackingCourierCode || '',
        trackingStatus: updatedOrder.trackingStatus || 'Pending',
      });
    } catch (err) {
      setError(err.message || 'Failed to sync Track123 tracking');
    } finally {
      setSyncingTrack123(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-semibold text-gray-900">Order Management</h1>
        <p className="mt-2 text-sm text-gray-500">Review orders, update the status, and maintain tracking details.</p>
      </div>

      {error && !selectedOrder ? (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="mb-4 flex flex-col gap-4 rounded-3xl border border-gray-200 bg-white px-5 py-4 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <label className="w-full max-w-md">
            <span className="sr-only">Search orders</span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by customer, order ID, courier, or tracking code"
              className="w-full rounded-full border border-gray-200 bg-gray-100 px-4 py-2.5 text-sm text-gray-700 outline-none transition focus:border-[#2d5a45] focus:bg-white"
            />
          </label>

          <div className="text-sm text-gray-500">
            Showing {filteredOrders.length} of {orders.length} orders
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map((filter) => {
            const isActive = activeFilter === filter.key;
            return (
              <button
                key={filter.key}
                type="button"
                onClick={() => setActiveFilter(filter.key)}
                className={`rounded-xl px-3 py-2 text-sm transition ${
                  isActive
                    ? 'bg-[#1f5a43] text-white shadow-sm'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {filter.label} <span className="ml-1 opacity-80">{counts[filter.key] || 0}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm">
        {loading ? (
          <div className="p-12 text-center text-gray-500">Loading orders...</div>
        ) : filteredOrders.length === 0 ? (
          <div className="p-12 text-center text-gray-500">No orders match the current filter.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[#1f5a43] text-white">
                <tr>
                  <th className="px-5 py-4 font-medium">Order ID</th>
                  <th className="px-5 py-4 font-medium">Customer</th>
                  <th className="px-5 py-4 font-medium">Order Status</th>
                  <th className="px-5 py-4 font-medium">Courier</th>
                  <th className="px-5 py-4 font-medium">Driver Status</th>
                  <th className="px-5 py-4 font-medium">Tracking Code</th>
                  <th className="px-5 py-4 font-medium">Tracking Status</th>
                  <th className="px-5 py-4 font-medium">Last Update</th>
                  <th className="px-5 py-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map((order) => (
                  <tr key={order.id} className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50">
                    <td className="px-5 py-4 font-medium text-gray-900">{order.orderCode}</td>
                    <td className="px-5 py-4">
                      <div className="font-medium text-gray-900">{order.customerName}</div>
                      <div className="mt-1 text-xs text-gray-500">{order.gmail || order.mobileNumber || '-'}</div>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex w-fit rounded-full px-2.5 py-1 text-xs font-medium ${badgeClass(order.status)}`}>
                        {order.status}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-gray-700">{order.deliveryMode === 'logistics' ? 'Logistics only' : order.courierName || '-'}</td>
                    <td className="px-5 py-4 text-gray-700">{order.deliveryMode === 'logistics' ? 'Not applicable' : order.driverAcceptedAt ? 'Accepted' : order.courierName ? 'Assigned' : '-'}</td>
                    <td className="px-5 py-4 text-gray-700">{order.trackingCode || '-'}</td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex w-fit rounded-full px-2.5 py-1 text-xs font-medium ${badgeClass(order.trackingStatus)}`}>
                        {order.trackingStatus}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-gray-600">{formatDateTime(order.statusUpdatedAt || order.updatedAt)}</td>
                    <td className="px-5 py-4 text-right">
                      <button
                        type="button"
                        onClick={() => openEditor(order)}
                        className="rounded-full border border-[#1f5a43]/20 px-4 py-2 text-sm font-medium text-[#1f5a43] transition hover:bg-[#1f5a43] hover:text-white"
                      >
                        View / Track
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedOrder ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#06110d]/55 p-4 backdrop-blur-[1px]"
          onClick={(event) => {
            if (event.target === event.currentTarget) closeEditor();
          }}
        >
          <div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-3xl border border-emerald-100/80 bg-[linear-gradient(180deg,#ffffff_0%,#fbfdfb_52%,#f5f9f7_100%)] shadow-[0_24px_80px_rgba(5,35,25,0.36)]">
            <div className="border-b border-emerald-100/90 bg-[linear-gradient(120deg,#f6fffa_0%,#ecf8f1_48%,#e5f4ec_100%)] px-6 py-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#1f5a43]">Order Details</p>
                  <h2 className="mt-1 text-2xl font-semibold text-gray-900 md:text-3xl">{selectedOrder.orderCode}</h2>
                  <p className="mt-1 text-sm text-gray-500">Created {formatDateTime(selectedOrder.createdAt)}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${badgeClass(selectedOrder.status)}`}>
                      {selectedOrder.status}
                    </span>
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${badgeClass(selectedOrder.trackingStatus)}`}>
                      {selectedOrder.trackingStatus}
                    </span>
                    <span className="inline-flex rounded-full bg-white px-2.5 py-1 text-xs font-medium text-[#1f5a43] ring-1 ring-[#1f5a43]/15">
                      {selectedOrder.deliveryMode === 'logistics' ? 'Logistics Only' : 'Rider Delivery'}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={closeEditor}
                  className="rounded-full border border-emerald-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-emerald-50"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="grid gap-6 px-6 py-6 lg:grid-cols-[1.2fr_0.8fr]">
              <div className="space-y-6">
                <div className="rounded-2xl border border-emerald-100 bg-[linear-gradient(180deg,#f8fcfa_0%,#f2f8f4_100%)] px-5 py-4 shadow-sm">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-gray-500">Customer</h3>
                  <div className="mt-3 grid gap-3 text-sm text-gray-700 md:grid-cols-2">
                    <p><span className="font-medium text-gray-900">Name:</span> {selectedOrder.customerName}</p>
                    <p><span className="font-medium text-gray-900">Email:</span> {selectedOrder.gmail || '-'}</p>
                    <p><span className="font-medium text-gray-900">Phone:</span> {selectedOrder.mobileNumber || '-'}</p>
                    <p><span className="font-medium text-gray-900">Payment:</span> {selectedOrder.paymentMethod}</p>
                    <p className="md:col-span-2"><span className="font-medium text-gray-900">Address:</span> {selectedOrder.location || '-'}</p>
                    <p><span className="font-medium text-gray-900">Customer Pin:</span> {selectedOrder.deliveryMode === 'logistics' ? 'Hidden for logistics tracking' : selectedOrder.customerLatitude != null && selectedOrder.customerLongitude != null ? `${selectedOrder.customerLatitude.toFixed(5)}, ${selectedOrder.customerLongitude.toFixed(5)}` : 'Not saved yet'}</p>
                    <p><span className="font-medium text-gray-900">Rider GPS:</span> {selectedOrder.deliveryMode === 'logistics' ? 'Not used for logistics orders' : selectedOrder.driverLatitude != null && selectedOrder.driverLongitude != null ? `${selectedOrder.driverLatitude.toFixed(5)}, ${selectedOrder.driverLongitude.toFixed(5)}` : 'No live location yet'}</p>
                  </div>
                </div>

                <div className="rounded-2xl border border-gray-200/80 bg-white px-5 py-4 shadow-sm">
                  <div className="flex items-center justify-between gap-4">
                    <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-gray-500">Items</h3>
                    <span className="text-sm text-gray-500">{selectedOrder.itemCount} item{selectedOrder.itemCount === 1 ? '' : 's'}</span>
                  </div>
                  <div className="mt-4 space-y-3">
                    {selectedOrder.items.map((item) => (
                      <div key={item.id} className="flex items-center justify-between rounded-2xl bg-gray-50 px-4 py-3">
                        <div>
                          <div className="font-medium text-gray-900">{item.productName}</div>
                          <div className="mt-1 text-xs text-gray-500">Qty {item.qty} x ₱{item.unitPrice.toFixed(2)}</div>
                        </div>
                        <div className="text-sm font-semibold text-gray-900">₱{item.lineTotal.toFixed(2)}</div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-4">
                    <span className="text-sm text-gray-500">Order Total</span>
                    <span className="text-lg font-semibold text-gray-900">₱{selectedOrder.totalAmount.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              <form onSubmit={handleSave} className="space-y-4 rounded-2xl border border-emerald-100/80 bg-white/90 px-5 py-4 shadow-sm">
                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-gray-500">Track Order</h3>
                  <p className="mt-1 text-sm text-gray-500">Update delivery and tracking details in one place.</p>
                </div>

                {error ? (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                  </div>
                ) : null}

                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-gray-700">Order Status</span>
                  <select
                    value={form.status}
                    onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}
                    className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-700 outline-none focus:border-[#1f5a43]"
                  >
                    {ORDER_STATUS_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-gray-700">Delivery Mode</span>
                  <select
                    value={form.deliveryMode}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        deliveryMode: event.target.value,
                        riderId: event.target.value === 'logistics' ? '' : current.riderId,
                      }))
                    }
                    className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-700 outline-none focus:border-[#1f5a43]"
                  >
                    <option value="rider">Rider delivery</option>
                    <option value="logistics">Logistics only</option>
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-gray-700">Assigned Rider</span>
                  <select
                    value={form.riderId}
                    disabled={form.deliveryMode === 'logistics'}
                    onChange={(event) => {
                      const nextRiderId = event.target.value;
                      setForm((current) => ({
                        ...current,
                        riderId: nextRiderId,
                      }));
                    }}
                    className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-700 outline-none focus:border-[#1f5a43] disabled:cursor-not-allowed disabled:bg-gray-100"
                  >
                    <option value="">No rider assigned</option>
                    {riders.map((rider) => (
                      <option key={rider.id} value={rider.id}>
                        {rider.fullName} {rider.isAvailable ? '(Available)' : '(Busy)'}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-gray-700">Tracking Code</span>
                  <input
                    type="text"
                    value={form.trackingCode}
                    onChange={(event) => setForm((current) => ({ ...current, trackingCode: event.target.value }))}
                    placeholder="LBC123456789PH"
                    className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-700 outline-none focus:border-[#1f5a43]"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-gray-700">Courier Code</span>
                  <input
                    type="text"
                    value={form.trackingCourierCode}
                    onChange={(event) => setForm((current) => ({ ...current, trackingCourierCode: event.target.value }))}
                    placeholder="fedex"
                    className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-700 outline-none focus:border-[#1f5a43]"
                  />
                  <p className="mt-1 text-xs text-gray-500">Optional. Leave this blank if you want Track123 to try carrier auto-detection.</p>
                </label>

                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-gray-700">Tracking Status</span>
                  <select
                    value={form.trackingStatus}
                    onChange={(event) => setForm((current) => ({ ...current, trackingStatus: event.target.value }))}
                    className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-700 outline-none focus:border-[#1f5a43]"
                  >
                    {TRACKING_STATUS_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="rounded-2xl border border-emerald-100 bg-[linear-gradient(180deg,#ffffff_0%,#f8fcfa_100%)] px-4 py-3 text-sm text-gray-600">
                  <div className="flex items-center justify-between">
                    <span>Order status</span>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${badgeClass(selectedOrder.status)}`}>{selectedOrder.status}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span>Delivery mode</span>
                    <span>{selectedOrder.deliveryMode === 'logistics' ? 'Logistics only' : 'Rider delivery'}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span>Tracking status</span>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${badgeClass(selectedOrder.trackingStatus)}`}>{selectedOrder.trackingStatus}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span>Courier code</span>
                    <span>{selectedOrder.trackingCourierCode || 'Auto detect'}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span>Track123 sync</span>
                    <span>{formatDateTime(selectedOrder.track123LastSyncedAt)}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span>Rider accepted</span>
                    <span>{selectedOrder.deliveryMode === 'logistics' ? 'Not applicable' : selectedOrder.driverAcceptedAt ? formatDateTime(selectedOrder.driverAcceptedAt) : 'Waiting for rider'}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span>Live GPS update</span>
                    <span>{selectedOrder.deliveryMode === 'logistics' ? 'Not applicable' : formatDateTime(selectedOrder.driverLocationUpdatedAt)}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span>Last updated</span>
                    <span>{formatDateTime(selectedOrder.statusUpdatedAt || selectedOrder.updatedAt)}</span>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={syncingTrack123 || saving || !form.trackingCode.trim()}
                  onClick={handleTrack123Sync}
                  className="w-full rounded-xl border border-[#1f5a43] px-4 py-3 text-sm font-medium text-[#1f5a43] transition hover:bg-[#1f5a43] hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {syncingTrack123 ? 'Syncing Track123...' : 'Sync Tracking With Track123'}
                </button>

                {selectedOrder.deliveryMode !== 'logistics' && selectedOrder.driverAccessToken ? (
                  <div className="rounded-2xl border border-dashed border-[#1f5a43]/25 bg-white px-4 py-3 text-sm text-gray-600">
                    <p className="font-medium text-gray-900">Private Driver Link</p>
                    <p className="mt-2 break-all text-xs text-gray-500">{buildDriverPortalUrl(selectedOrder.driverAccessToken)}</p>
                    <button
                      type="button"
                      onClick={async () => {
                        const driverUrl = buildDriverPortalUrl(selectedOrder.driverAccessToken);
                        if (!driverUrl) return;
                        await navigator.clipboard.writeText(driverUrl);
                      }}
                      className="mt-3 rounded-full border border-[#1f5a43]/20 px-4 py-2 text-xs font-medium text-[#1f5a43] transition hover:bg-[#1f5a43] hover:text-white"
                    >
                      Copy Driver Link
                    </button>
                  </div>
                ) : selectedOrder.deliveryMode === 'logistics' ? (
                  <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-4 py-3 text-sm text-gray-500">
                    Logistics orders do not create rider links or live GPS tracking.
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-4 py-3 text-sm text-gray-500">
                    Save the order with an assigned rider first to generate the private driver link.
                  </div>
                )}

                <button
                  type="submit"
                  disabled={saving}
                  className="w-full rounded-xl bg-[#1f5a43] px-4 py-3 text-sm font-medium text-white transition hover:bg-[#163f2f] disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {saving ? 'Saving Changes...' : 'Update Order'}
                </button>
              </form>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
