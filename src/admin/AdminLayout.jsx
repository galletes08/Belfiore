import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { clearToken } from '../api/client';

export default function AdminLayout() {
  const navigate = useNavigate();

  const handleLogout = () => {
    clearToken();
    navigate('/admin/login', { replace: true });
  };

  const navItems = [
    { to: '/admin', end: true, label: 'Dashboard', icon: '🏠' },
    { to: '/admin/orders', end: false, label: 'Orders', icon: '📦' },
    { to: '/admin/inventory', end: false, label: 'Inventory', icon: '📋' },
    { to: '/admin/customers', end: false, label: 'Customers', icon: '👤' },
    { to: '/admin/reports', end: false, label: 'Reports', icon: '📊' },
    { to: '/admin/settings', end: false, label: 'Settings', icon: '⚙️' },
  ];

  return (
    <div className="flex min-h-screen">
      <aside className="w-60 bg-[#1a3d2e] text-white flex flex-col flex-shrink-0">
        <div className="p-6 text-xl font-bold flex items-center gap-2">
          <span className="text-2xl">🌿</span>
          <span>PlantDelivery</span>
        </div>
        <nav className="flex-1 py-3">
          {navItems.map(({ to, end, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-6 py-3 text-white/85 no-underline transition-colors hover:bg-white/10 hover:text-white ${isActive ? 'bg-[#2d5a45] text-white' : ''}`
              }
            >
              <span className="text-lg">{icon}</span>
              {label}
            </NavLink>
          ))}
        </nav>
        <button
          type="button"
          onClick={handleLogout}
          className="mx-6 mb-4 py-2 px-4 bg-transparent border border-white/40 text-white rounded-md cursor-pointer text-sm hover:bg-white/10"
        >
          Log out
        </button>
      </aside>
      <main className="flex-1 bg-gray-100 p-6 pl-8 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
