import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell,
  BellRing,
  CheckCheck,
  ChevronRight,
  LayoutDashboard,
  LogOut,
  Settings,
  UserRound,
  Volume2,
} from 'lucide-react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { apiRiderOrders, clearRiderToken, getRiderUser } from '../api/client';

function getInitials(name) {
  const initials = String(name || 'Belfiore Rider')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('');

  return initials.toUpperCase() || 'BR';
}

function getStoredBoolean(key, fallback = false) {
  const value = window.localStorage.getItem(key);
  return value === null ? fallback : value === 'true';
}

function getStoredIds(key) {
  try {
    const value = JSON.parse(window.localStorage.getItem(key) || '[]');
    return new Set(Array.isArray(value) ? value.map(String) : []);
  } catch {
    return new Set();
  }
}

function formatNotificationTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Just now';
  return date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function playNotificationTone() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = 740;
    gain.gain.setValueAtTime(0.12, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.22);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.22);
  } catch {
    // Some browsers block audio until the rider has interacted with the page.
  }
}

function PreferenceSwitch({ checked, disabled = false, label, description, onChange }) {
  return (
    <button
      type="button"
      onClick={onChange}
      disabled={disabled}
      className="flex w-full items-center justify-between gap-4 rounded-xl px-3 py-3 text-left transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-slate-800">{label}</span>
        <span className="mt-0.5 block text-[11px] leading-4 text-slate-500">{description}</span>
      </span>
      <span className={`relative h-6 w-11 shrink-0 rounded-full transition ${checked ? 'bg-emerald-600' : 'bg-slate-300'}`}>
        <span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition ${checked ? 'left-6' : 'left-1'}`} />
      </span>
    </button>
  );
}

export default function RiderLayout() {
  const navigate = useNavigate();
  const menuRef = useRef(null);
  const previousOrderIdsRef = useRef(new Set());
  const hasLoadedOrdersRef = useRef(false);
  const riderUser = getRiderUser();
  const riderName = riderUser?.name || riderUser?.fullName || 'Belfiore Rider';
  const riderKey = String(riderUser?.id || riderUser?.email || riderName);
  const readStorageKey = `riderReadOrders:${riderKey}`;
  const browserStorageKey = `riderBrowserNotifications:${riderKey}`;
  const soundStorageKey = `riderSoundAlerts:${riderKey}`;

  const [activePanel, setActivePanel] = useState('');
  const [notificationOrders, setNotificationOrders] = useState([]);
  const [readOrderIds, setReadOrderIds] = useState(() => getStoredIds(readStorageKey));
  const [browserNotifications, setBrowserNotifications] = useState(() => getStoredBoolean(browserStorageKey));
  const [soundAlerts, setSoundAlerts] = useState(() => getStoredBoolean(soundStorageKey, true));

  const navItems = [
    { to: '/rider', end: true, label: 'Dashboard', icon: LayoutDashboard },
    { to: '/rider/profile', end: false, label: 'Profile', icon: UserRound },
  ];

  useEffect(() => {
    const closeMenus = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) setActivePanel('');
    };

    document.addEventListener('mousedown', closeMenus);
    return () => document.removeEventListener('mousedown', closeMenus);
  }, []);

  useEffect(() => {
    let mounted = true;

    async function loadNotificationOrders() {
      try {
        const result = await apiRiderOrders();
        if (!mounted) return;
        const nextOrders = Array.isArray(result) ? result : [];
        const nextIds = new Set(nextOrders.map((order) => String(order.id)));

        if (hasLoadedOrdersRef.current) {
          const newOrders = nextOrders.filter((order) => !previousOrderIdsRef.current.has(String(order.id)));

          if (newOrders.length > 0) {
            if (soundAlerts) playNotificationTone();

            if (browserNotifications && window.Notification?.permission === 'granted') {
              const order = newOrders[0];
              const notification = new window.Notification(`New order: ${order.orderCode || 'Assigned delivery'}`, {
                body: `${order.customerName || 'A customer'} has a new delivery for you.`,
              });
              notification.onclick = () => {
                window.focus();
                if (order.driverAccessToken) navigate(`/rider/delivery/${order.driverAccessToken}`);
              };
            }
          }
        }

        previousOrderIdsRef.current = nextIds;
        hasLoadedOrdersRef.current = true;
        setNotificationOrders(nextOrders);
      } catch {
        // The dashboard shows its own API error; keep the header controls available.
      }
    }

    loadNotificationOrders();
    const intervalId = window.setInterval(loadNotificationOrders, 10000);
    return () => {
      mounted = false;
      window.clearInterval(intervalId);
    };
  }, [browserNotifications, navigate, soundAlerts]);

  const unreadOrders = useMemo(
    () => notificationOrders.filter((order) => !['Cancelled', 'Cancellation Requested'].includes(order.status) && !readOrderIds.has(String(order.id))),
    [notificationOrders, readOrderIds],
  );

  const recentOrders = useMemo(
    () =>
      [...notificationOrders]
        .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
        .slice(0, 5),
    [notificationOrders],
  );

  const saveReadIds = (nextIds) => {
    setReadOrderIds(nextIds);
    window.localStorage.setItem(readStorageKey, JSON.stringify([...nextIds]));
  };

  const markAllAsRead = () => {
    saveReadIds(new Set(notificationOrders.map((order) => String(order.id))));
  };

  const openOrder = (order) => {
    const nextIds = new Set(readOrderIds);
    nextIds.add(String(order.id));
    saveReadIds(nextIds);
    setActivePanel('');
    navigate(order.driverAccessToken ? `/rider/delivery/${order.driverAccessToken}` : '/rider');
  };

  const toggleBrowserNotifications = async () => {
    if (!window.Notification) return;

    if (browserNotifications) {
      setBrowserNotifications(false);
      window.localStorage.setItem(browserStorageKey, 'false');
      return;
    }

    const permission = await window.Notification.requestPermission();
    const enabled = permission === 'granted';
    setBrowserNotifications(enabled);
    window.localStorage.setItem(browserStorageKey, String(enabled));
  };

  const toggleSoundAlerts = () => {
    const enabled = !soundAlerts;
    setSoundAlerts(enabled);
    window.localStorage.setItem(soundStorageKey, String(enabled));
    if (enabled) playNotificationTone();
  };

  const handleLogout = () => {
    clearRiderToken();
    navigate('/rider/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-[#f4f6f5] font-['Montserrat'] text-slate-900">
      <header className="relative z-30 bg-[radial-gradient(circle_at_top_left,#0d5938_0%,#073d28_42%,#052f20_100%)] text-white shadow-[0_12px_34px_rgba(4,47,31,0.18)]">
        <div className="mx-auto max-w-7xl px-4 pb-3 pt-4 sm:px-6 sm:pb-4 sm:pt-5 lg:px-8">
          <div className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/10 text-sm font-bold tracking-wide shadow-inner sm:h-12 sm:w-12">
                {getInitials(riderName)}
              </span>
              <div className="min-w-0">
                <p className="truncate text-base font-bold sm:text-lg">Rider Portal</p>
                <p className="mt-0.5 truncate text-[11px] text-emerald-50/75 sm:text-xs">{riderName}</p>
              </div>
            </div>

            <div ref={menuRef} className="relative flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => setActivePanel((current) => (current === 'notifications' ? '' : 'notifications'))}
                className="relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white transition hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-white/50"
                aria-label="Order notifications"
                aria-expanded={activePanel === 'notifications'}
              >
                {unreadOrders.length > 0 ? <BellRing size={18} /> : <Bell size={18} />}
                {unreadOrders.length > 0 ? (
                  <span className="absolute -right-0.5 -top-1 inline-flex min-h-4 min-w-4 items-center justify-center rounded-full border-2 border-[#073d28] bg-orange-500 px-0.5 text-[8px] font-bold leading-none text-white">
                    {unreadOrders.length > 9 ? '9+' : unreadOrders.length}
                  </span>
                ) : null}
              </button>

              <button
                type="button"
                onClick={() => setActivePanel((current) => (current === 'settings' ? '' : 'settings'))}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white transition hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-white/50"
                aria-label="Rider settings"
                aria-expanded={activePanel === 'settings'}
              >
                <Settings size={18} />
              </button>

              {activePanel === 'notifications' ? (
                <section className="absolute right-0 top-12 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-2xl">
                  <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                    <div>
                      <p className="text-sm font-bold">Order notifications</p>
                      <p className="mt-0.5 text-[10px] text-slate-500">{unreadOrders.length} unread</p>
                    </div>
                    {unreadOrders.length > 0 ? (
                      <button type="button" onClick={markAllAsRead} className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 hover:text-emerald-900">
                        <CheckCheck size={14} />
                        Mark all read
                      </button>
                    ) : null}
                  </div>

                  <div className="max-h-80 overflow-y-auto p-2">
                    {recentOrders.length > 0 ? (
                      recentOrders.map((order) => {
                        const isUnread = !readOrderIds.has(String(order.id));
                        return (
                          <button
                            key={order.id}
                            type="button"
                            onClick={() => openOrder(order)}
                            className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-emerald-50 ${isUnread ? 'bg-emerald-50/70' : ''}`}
                          >
                            <span className={`h-2 w-2 shrink-0 rounded-full ${isUnread ? 'bg-orange-500' : 'bg-slate-200'}`} />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-xs font-bold text-slate-900">{order.orderCode || 'New assigned order'}</span>
                              <span className="mt-1 block truncate text-[11px] text-slate-600">{order.customerName || 'Customer'} ? {order.status || 'Pending'}</span>
                              <span className="mt-1 block text-[9px] text-slate-400">{formatNotificationTime(order.createdAt)}</span>
                            </span>
                            <ChevronRight size={15} className="shrink-0 text-slate-400" />
                          </button>
                        );
                      })
                    ) : (
                      <div className="px-4 py-8 text-center">
                        <Bell size={22} className="mx-auto text-slate-300" />
                        <p className="mt-2 text-xs font-semibold text-slate-600">No order notifications yet</p>
                      </div>
                    )}
                  </div>
                </section>
              ) : null}

              {activePanel === 'settings' ? (
                <section className="absolute right-0 top-12 w-[min(21rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 text-slate-900 shadow-2xl">
                  <div className="px-3 pb-2 pt-2">
                    <p className="text-sm font-bold">Rider settings</p>
                    <p className="mt-0.5 text-[10px] text-slate-500">Manage your account and order alerts.</p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setActivePanel('');
                      navigate('/rider/profile');
                    }}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-slate-50"
                  >
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-emerald-50 text-emerald-700"><UserRound size={17} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">Account profile</span>
                      <span className="mt-0.5 block text-[10px] text-slate-500">Personal details and photo</span>
                    </span>
                    <ChevronRight size={16} className="text-slate-400" />
                  </button>

                  <div className="my-1 border-t border-slate-100" />
                  <PreferenceSwitch
                    checked={browserNotifications}
                    disabled={!window.Notification}
                    label="Browser notifications"
                    description={window.Notification ? 'Show an alert when a new order arrives.' : 'Not supported by this browser.'}
                    onChange={toggleBrowserNotifications}
                  />
                  <PreferenceSwitch
                    checked={soundAlerts}
                    label="Sound alerts"
                    description="Play a short sound for every new order."
                    onChange={toggleSoundAlerts}
                  />

                  <div className="my-1 border-t border-slate-100" />
                  <button type="button" onClick={handleLogout} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-rose-700 transition hover:bg-rose-50">
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-rose-50"><LogOut size={17} /></span>
                    <span>
                      <span className="block text-sm font-semibold">Log out</span>
                      <span className="mt-0.5 block text-[10px] text-rose-600/75">Sign out of the rider portal</span>
                    </span>
                  </button>
                </section>
              ) : null}
            </div>
          </div>

          <nav className="mt-4 grid grid-cols-2 rounded-2xl border border-white/15 bg-black/5 p-1">
            {navItems.map(({ to, end, label, icon }) => {
              const IconComponent = icon;
              return (
                <NavLink key={to} to={to} end={end} className={({ isActive }) => `flex min-h-10 items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-white no-underline transition sm:text-sm ${isActive ? 'bg-white/18 shadow-sm ring-1 ring-white/10' : 'text-white/75 hover:bg-white/10 hover:text-white'}`}>
                  <IconComponent size={16} />
                  {label}
                </NavLink>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="mx-auto min-w-0 max-w-7xl px-4 pb-24 pt-5 sm:px-6 sm:pt-7 lg:px-8 lg:pb-10">
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-5 pb-[max(0.55rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-8px_30px_rgba(15,23,42,0.08)] backdrop-blur md:hidden">
        <div className="mx-auto grid max-w-md grid-cols-2">
          {navItems.map(({ to, end, label, icon }) => {
            const IconComponent = icon;
            return (
              <NavLink key={`mobile-${to}`} to={to} end={end} className={({ isActive }) => `flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-semibold no-underline transition ${isActive ? 'text-[#075c36]' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'}`}>
                <IconComponent size={18} />
                {label}
              </NavLink>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
