import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  Bike,
  LayoutDashboard,
  LogOut,
  Menu,
  PackageSearch,
  ShoppingCart,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import { clearToken, getAdminUser } from '../api/client';

const navItems = [
  { to: '/admin', end: true, label: 'Dashboard', description: 'Overview & metrics', icon: LayoutDashboard },
  { to: '/admin/orders', end: false, label: 'Orders', description: 'Manage purchases', icon: ShoppingCart },
  { to: '/admin/riders', end: false, label: 'Riders', description: 'Delivery team', icon: Bike },
  { to: '/admin/inventory', end: false, label: 'Inventory', description: 'Products & stock', icon: PackageSearch },
  { to: '/admin/customers', end: false, label: 'Customers', description: 'Customer records', icon: Users },
  { to: '/admin/reports', end: false, label: 'Reports', description: 'Business insights', icon: BarChart3 },
];

export default function AdminLayout() {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const admin = getAdminUser();
  const adminName = admin?.name || admin?.fullName || 'Administrator';
  const adminInitial = adminName.trim().charAt(0).toUpperCase() || 'A';

  const handleLogout = () => {
    clearToken();
    navigate('/admin/login', { replace: true });
  };

  const sidebar = (
    <aside className="flex h-full w-[280px] flex-col bg-[#123d2d] text-white shadow-2xl shadow-slate-900/10">
      <div className="border-b border-white/10 px-6 py-6">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-sm font-black text-[#174b37] shadow-sm">BF</span>
          <div className="min-w-0">
            <p className="truncate text-lg font-bold tracking-tight">PlantDelivery</p>
            <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-200/70">Admin workspace</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-4 py-6" aria-label="Admin navigation">
        <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-100/45">Workspace</p>
        <div className="space-y-1.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={() => setMenuOpen(false)}
                className={({ isActive }) => `group relative flex items-center gap-3 rounded-2xl px-3 py-3 no-underline transition-all ${isActive ? 'bg-white text-[#174b37] shadow-lg shadow-black/10' : 'text-white/75 hover:bg-white/10 hover:text-white'}`}
              >
                {({ isActive }) => (
                  <>
                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition ${isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-white/10 text-emerald-100 group-hover:bg-white/15'}`}>
                      <Icon size={18} strokeWidth={2.2} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">{item.label}</span>
                      <span className={`mt-0.5 block truncate text-[11px] ${isActive ? 'text-emerald-800/60' : 'text-white/40'}`}>{item.description}</span>
                    </span>
                    {isActive ? <span className="absolute right-3 h-1.5 w-1.5 rounded-full bg-emerald-600" /> : null}
                  </>
                )}
              </NavLink>
            );
          })}
        </div>
      </nav>

      <div className="border-t border-white/10 p-4">
        <div className="mb-3 flex items-center gap-3 rounded-2xl bg-white/[0.07] p-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-200 text-sm font-bold text-emerald-900">{adminInitial}</span>
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-white">{adminName}</p><p className="mt-0.5 text-[11px] text-white/45">Admin account</p></div>
          <Sparkles size={15} className="text-emerald-200/60" />
        </div>
        <button type="button" onClick={handleLogout} className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-white/80 transition hover:border-white/25 hover:bg-white/10 hover:text-white">
          <LogOut size={16} />Log out
        </button>
      </div>
    </aside>
  );

  return (
    <div className="min-h-screen bg-slate-100 lg:flex">
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur lg:hidden">
        <div className="flex items-center gap-2.5"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#174b37] text-xs font-black text-white">BF</span><div><p className="text-sm font-bold text-slate-900">PlantDelivery</p><p className="text-[10px] uppercase tracking-wider text-slate-400">Admin</p></div></div>
        <button type="button" onClick={() => setMenuOpen(true)} className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-700" aria-label="Open navigation"><Menu size={20} /></button>
      </header>

      <div className="hidden h-screen shrink-0 lg:sticky lg:top-0 lg:block">{sidebar}</div>

      {menuOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button type="button" className="absolute inset-0 bg-slate-950/45 backdrop-blur-sm" onClick={() => setMenuOpen(false)} aria-label="Close navigation" />
          <div className="relative h-full w-[280px] max-w-[86vw]">
            {sidebar}
            <button type="button" onClick={() => setMenuOpen(false)} className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-white" aria-label="Close navigation"><X size={18} /></button>
          </div>
        </div>
      ) : null}

      <main className="min-w-0 flex-1 overflow-x-hidden p-4 sm:p-6 lg:p-8 xl:p-10">
        <Outlet />
      </main>
    </div>
  );
}
