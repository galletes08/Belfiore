import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { clearRiderToken } from '../api/client';

export default function RiderLayout() {
  const navigate = useNavigate();

  const handleLogout = () => {
    clearRiderToken();
    navigate('/rider/login', { replace: true });
  };

  const navItems = [
    { to: '/rider', end: true, label: 'Dashboard', icon: 'DB' },
  ];

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 flex-shrink-0 flex-col bg-[#1a3d2e] text-white">
        <div className="flex items-center gap-2 p-6 text-xl font-bold">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-sm">BF</span>
          <span>Rider Portal</span>
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
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-[11px] font-semibold">
                {icon}
              </span>
              {label}
            </NavLink>
          ))}
        </nav>
        <button
          type="button"
          onClick={handleLogout}
          className="mx-6 mb-4 rounded-md border border-white/40 bg-transparent px-4 py-2 text-sm text-white hover:bg-white/10"
        >
          Log out
        </button>
      </aside>
      <main className="flex-1 overflow-auto bg-gray-100 p-6 pl-8">
        <Outlet />
      </main>
    </div>
  );
}
