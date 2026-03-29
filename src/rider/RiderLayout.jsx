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
    <div className="min-h-screen bg-gray-100 md:flex">
      <aside className="sticky top-0 z-20 flex flex-col border-b border-white/10 bg-[#1a3d2e] text-white md:min-h-screen md:w-60 md:flex-shrink-0 md:border-b-0">
        <div className="flex items-center justify-between gap-3 px-4 py-4 sm:px-5 md:px-6 md:py-6">
          <div className="flex min-w-0 items-center gap-2 text-lg font-bold md:text-xl">
            <span className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-white/10 text-sm">BF</span>
            <span className="truncate">Rider Portal</span>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-md border border-white/40 bg-transparent px-3 py-2 text-xs font-medium text-white transition hover:bg-white/10 md:hidden"
          >
            Log out
          </button>
        </div>
        <nav className="flex gap-2 overflow-x-auto px-4 pb-4 md:flex-1 md:flex-col md:px-0 md:py-3">
          {navItems.map(({ to, end, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex min-w-fit items-center gap-3 rounded-full px-4 py-3 text-sm text-white/85 no-underline transition-colors hover:bg-white/10 hover:text-white md:rounded-none md:px-6 ${isActive ? 'bg-[#2d5a45] text-white' : ''}`
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
          className="mx-6 mb-4 hidden rounded-md border border-white/40 bg-transparent px-4 py-2 text-sm text-white transition hover:bg-white/10 md:block"
        >
          Log out
        </button>
      </aside>
      <main className="flex-1 overflow-auto p-4 sm:p-5 md:p-6 md:pl-8">
        <Outlet />
      </main>
    </div>
  );
}
