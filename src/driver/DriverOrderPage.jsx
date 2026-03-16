import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { MapPinned, Navigation, RefreshCw, ShieldCheck, Truck } from 'lucide-react';
import { apiDriverOrder, apiUpdateDriverOrder } from '../api/client';
import TrackingMap from '../components/TrackingMap';

const TEST_DRIVER_COORDINATES = (() => {
  const latitude = Number(import.meta.env.VITE_TEST_RIDER_LATITUDE);
  const longitude = Number(import.meta.env.VITE_TEST_RIDER_LONGITUDE);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  return {
    latitude,
    longitude,
    label: import.meta.env.VITE_TEST_RIDER_LABEL || 'Palo Alto, Calamba, Laguna',
  };
})();

function formatDate(value) {
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

function formatPhp(amount) {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
  }).format(Number(amount) || 0);
}

function getDriverCoordinates() {
  if (TEST_DRIVER_COORDINATES) {
    return Promise.resolve({
      latitude: TEST_DRIVER_COORDINATES.latitude,
      longitude: TEST_DRIVER_COORDINATES.longitude,
      usesTestLocation: true,
    });
  }

  if (!navigator.geolocation) {
    return Promise.reject(new Error('This device does not support GPS location sharing.'));
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          usesTestLocation: false,
        });
      },
      () => reject(new Error('GPS permission was denied or unavailable.')),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  });
}

export default function DriverOrderPage() {
  const { token = '' } = useParams();
  const [order, setOrder] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [isLiveSharing, setIsLiveSharing] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadOrder() {
      try {
        const data = await apiDriverOrder(token);
        if (!isMounted) return;
        setOrder(data);
        setStatus('success');
        setError('');
      } catch (err) {
        if (!isMounted) return;
        setStatus('error');
        setError(err.message || 'Failed to load driver order.');
      }
    }

    loadOrder();
    const intervalId = window.setInterval(loadOrder, 15000);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, [token]);

  useEffect(() => {
    if (!isLiveSharing) return undefined;

    const intervalId = window.setInterval(() => {
      getDriverCoordinates()
        .then(async ({ latitude, longitude, usesTestLocation }) => {
          try {
            const data = await apiUpdateDriverOrder(token, {
              driverLatitude: latitude,
              driverLongitude: longitude,
            });
            setOrder(data);
            setNotice(
              usesTestLocation
                ? `Test rider location shared from ${TEST_DRIVER_COORDINATES.label}.`
                : 'Live location shared successfully.'
            );
          } catch (err) {
            setNotice(err.message || 'Unable to share live location.');
          }
        })
        .catch((err) => {
          setNotice(err.message || 'GPS permission was denied or unavailable.');
          setIsLiveSharing(false);
        });
    }, 15000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isLiveSharing, token]);

  async function updateDriver(payload, successMessage) {
    setIsUpdating(true);
    setNotice('');

    try {
      const data = await apiUpdateDriverOrder(token, payload);
      setOrder(data);
      setNotice(successMessage);
    } catch (err) {
      setNotice(err.message || 'Unable to update this order.');
    } finally {
      setIsUpdating(false);
    }
  }

  function handleShareCurrentLocation(acceptOrder = false) {
    setIsUpdating(true);
    setNotice('');

    getDriverCoordinates()
      .then(async ({ latitude, longitude, usesTestLocation }) => {
        try {
          const data = await apiUpdateDriverOrder(token, {
            acceptOrder,
            driverLatitude: latitude,
            driverLongitude: longitude,
          });
          setOrder(data);
          setNotice(
            usesTestLocation
              ? `${acceptOrder ? 'Order accepted' : 'Rider location updated'} using the ${TEST_DRIVER_COORDINATES.label} test pin.`
              : acceptOrder
                ? 'Order accepted and location shared.'
                : 'Current location updated.'
          );
          setIsLiveSharing(true);
        } catch (err) {
          setNotice(err.message || 'Unable to share your current location.');
        } finally {
          setIsUpdating(false);
        }
      })
      .catch((err) => {
        setNotice(err.message || 'GPS permission was denied or unavailable.');
        setIsUpdating(false);
      });
  }

  const customerPosition =
    order?.customerLatitude != null && order?.customerLongitude != null
      ? [order.customerLatitude, order.customerLongitude]
      : null;
  const driverPosition =
    order?.driverLatitude != null && order?.driverLongitude != null
      ? [order.driverLatitude, order.driverLongitude]
      : null;

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#edf8f2_0%,#f8fafc_50%,#eef3f1_100%)] px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-6xl space-y-5">
        <section className="rounded-3xl border border-emerald-100 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-emerald-700">Driver Portal</p>
              <h1 className="mt-2 text-3xl font-bold text-gray-900">{order?.orderCode || 'Delivery Order'}</h1>
              <p className="mt-2 max-w-2xl text-sm text-gray-600">
                Accept the assigned order, share your live GPS location, and keep the customer updated on the map.
              </p>
            </div>
            <Link to="/" className="rounded-full border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">
              Back to Store
            </Link>
          </div>
        </section>

        {status === 'loading' ? (
          <section className="rounded-3xl border border-white/80 bg-white p-8 text-sm text-gray-500 shadow-sm">
            Loading driver order...
          </section>
        ) : null}

        {status === 'error' ? (
          <section className="rounded-3xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700 shadow-sm">
            {error}
          </section>
        ) : null}

        {status === 'success' && order ? (
          <>
            <section className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="rounded-3xl border border-white/80 bg-white p-6 shadow-sm">
                <div className="flex items-center gap-2">
                  <Truck size={18} className="text-emerald-700" />
                  <h2 className="text-lg font-semibold text-gray-900">Delivery details</h2>
                </div>

                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <div className="rounded-2xl bg-gray-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Customer</p>
                    <p className="mt-2 text-base font-semibold text-gray-900">{order.customerName}</p>
                    <p className="mt-1 text-sm text-gray-600">{order.mobileNumber || '-'}</p>
                    <p className="mt-1 text-sm text-gray-600">{order.gmail || '-'}</p>
                  </div>

                  <div className="rounded-2xl bg-gray-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Assigned Rider</p>
                    <p className="mt-2 text-base font-semibold text-gray-900">{order.courierName || 'Rider not set'}</p>
                    <p className="mt-1 text-sm text-gray-600">{order.driverPhone || 'No contact number'}</p>
                    <p className="mt-1 text-sm text-gray-600">Accepted: {formatDate(order.driverAcceptedAt)}</p>
                  </div>

                  <div className="rounded-2xl bg-gray-50 p-4 md:col-span-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Delivery address</p>
                    <p className="mt-2 text-sm text-gray-700">{order.location}</p>
                  </div>
                </div>

                <div className="mt-5 rounded-2xl border border-dashed border-emerald-200 bg-emerald-50/60 p-4">
                  <div className="flex items-center gap-2">
                    <ShieldCheck size={16} className="text-emerald-700" />
                    <p className="text-sm font-semibold text-emerald-800">Rider actions</p>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => handleShareCurrentLocation(!order.driverAcceptedAt)}
                      disabled={isUpdating}
                      className="rounded-full bg-emerald-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {isUpdating
                        ? 'Updating...'
                        : order.driverAcceptedAt
                          ? 'Share Current Location'
                          : 'Accept Order & Share Location'}
                    </button>

                    <button
                      type="button"
                      onClick={() => setIsLiveSharing((current) => !current)}
                      disabled={!order.driverAcceptedAt}
                      className="rounded-full border border-emerald-300 px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isLiveSharing ? 'Stop Live Sharing' : 'Start Live Sharing'}
                    </button>

                    <button
                      type="button"
                      onClick={() => updateDriver({ markDelivered: true }, 'Order marked as delivered.')}
                      disabled={isUpdating || order.status === 'Delivered'}
                      className="rounded-full border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      Mark Delivered
                    </button>

                    <button
                      type="button"
                      onClick={() => window.location.reload()}
                      className="rounded-full border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
                    >
                      Refresh
                    </button>
                  </div>

                  <p className="mt-3 text-sm text-gray-600">
                    {TEST_DRIVER_COORDINATES
                      ? `Live sharing is using the ${TEST_DRIVER_COORDINATES.label} test rider location every 15 seconds.`
                      : 'Live sharing updates the customer map every 15 seconds while this page stays open.'}
                  </p>
                  {notice ? <p className="mt-2 text-sm text-emerald-800">{notice}</p> : null}
                </div>
              </div>

              <div className="space-y-5">
                <section className="rounded-3xl border border-white/80 bg-white p-6 shadow-sm">
                  <div className="flex items-center gap-2">
                    <MapPinned size={18} className="text-emerald-700" />
                    <h2 className="text-lg font-semibold text-gray-900">Delivery map</h2>
                  </div>

                  {customerPosition || driverPosition ? (
                    <div className="mt-4">
                      <TrackingMap
                        customerPosition={customerPosition}
                        driverPosition={driverPosition}
                        customerLabel={`${order.customerName} delivery pin`}
                        driverLabel={order.courierName ? `${order.courierName} current location` : 'Rider current location'}
                      />
                    </div>
                  ) : (
                    <div className="mt-4 flex h-[320px] items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-gray-50 text-center text-sm text-gray-500">
                      Waiting for the customer pin or rider location.
                    </div>
                  )}
                </section>

                <section className="rounded-3xl border border-white/80 bg-white p-6 shadow-sm">
                  <div className="flex items-center gap-2">
                    <Navigation size={18} className="text-emerald-700" />
                    <h2 className="text-lg font-semibold text-gray-900">Order summary</h2>
                  </div>

                  <div className="mt-4 space-y-3">
                    {order.items.map((item) => (
                      <div key={item.id} className="flex items-center justify-between rounded-2xl bg-gray-50 px-4 py-3">
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{item.productName}</p>
                          <p className="text-xs text-gray-500">Qty {item.qty}</p>
                        </div>
                        <p className="text-sm font-semibold text-gray-900">{formatPhp(item.lineTotal)}</p>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 space-y-2 border-t border-gray-100 pt-4 text-sm text-gray-600">
                    <p>Status: <span className="font-semibold text-gray-900">{order.status}</span></p>
                    <p>Tracking: <span className="font-semibold text-gray-900">{order.trackingStatus}</span></p>
                    <p>Tracking code: <span className="font-semibold text-gray-900">{order.trackingCode || 'Not assigned yet'}</span></p>
                    <p>Latest location update: <span className="font-semibold text-gray-900">{formatDate(order.driverLocationUpdatedAt)}</span></p>
                  </div>
                </section>
              </div>
            </section>

            <section className="rounded-3xl border border-white/80 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-2">
                <RefreshCw size={18} className="text-emerald-700" />
                <h2 className="text-lg font-semibold text-gray-900">What happens next</h2>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <article className="rounded-2xl bg-gray-50 p-4 text-sm text-gray-700">
                  1. Accept the order and allow GPS access so the system can place your first live marker.
                </article>
                <article className="rounded-2xl bg-gray-50 p-4 text-sm text-gray-700">
                  2. Keep this page open to continue sending your current location every 15 seconds.
                </article>
                <article className="rounded-2xl bg-gray-50 p-4 text-sm text-gray-700">
                  3. Mark the order delivered once the item reaches the customer.
                </article>
              </div>
            </section>
          </>
        ) : null}
      </div>
    </div>
  );
}
