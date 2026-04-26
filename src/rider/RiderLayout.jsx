import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { LayoutDashboard, UserRound } from 'lucide-react';
import { clearRiderToken } from '../api/client';

export default function RiderLayout() {
  const navigate = useNavigate();

  const handleLogout = () => {
    clearRiderToken();
    navigate('/rider/login', { replace: true });
  };

  const navItems = [
    { to: '/rider', end: true, label: 'Dashboard', icon: LayoutDashboard },
    { to: '/rider/profile', end: false, label: 'Profile', icon: UserRound },
  ];

  return (
    <div className="min-h-screen bg-gray-100 font-['Montserrat'] md:flex">
      <aside className="sticky top-0 z-20 flex flex-col border-b border-white/10 bg-[#1a3d2e] text-white md:min-h-screen md:w-64 md:flex-shrink-0 md:border-b-0">
        <div className="flex items-center justify-between gap-3 px-4 py-4 sm:px-5 md:px-6 md:py-7">
          <div className="flex min-w-0 items-center gap-3">
            <span className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-white/10 text-sm font-semibold tracking-wide">BF</span>
            <span className="truncate font-['Playfair_Display'] text-2xl font-semibold leading-none">Rider Portal</span>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-xl border border-white/40 bg-transparent px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-white transition hover:bg-white/10 md:hidden"
          >
            Log out
          </button>
        </div>
        <nav className="flex gap-2 overflow-x-auto px-4 pb-4 md:flex-1 md:flex-col md:px-0 md:py-4">
          {navItems.map(({ to, end, label, icon }) => {
            const IconComponent = icon;

            return (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `flex min-w-fit items-center gap-3 rounded-full px-4 py-3 text-sm font-medium text-white/85 no-underline transition-colors hover:bg-white/10 hover:text-white md:rounded-none md:px-6 md:py-4 ${isActive ? 'bg-[#2d5a45] text-white' : ''}`
                }
              >
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-[11px] font-semibold tracking-wide">
                  <IconComponent size={16} />
                </span>
                <span>{label}</span>
              </NavLink>
            );
          })}
        </nav>
        <button
          type="button"
          onClick={handleLogout}
          className="mx-6 mb-5 hidden rounded-xl border border-white/40 bg-transparent px-4 py-2.5 text-sm font-semibold uppercase tracking-[0.12em] text-white transition hover:bg-white/10 md:block"
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
