import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  BarChart3,
  Bike,
  Boxes,
  LayoutDashboard,
  LogOut,
  Menu,
  Monitor,
  Moon,
  Settings,
  ShoppingCart,
  Sun,
  Users,
  X,
} from "lucide-react";
import { clearToken, getAdminUser } from "../api/client";
import logoImage from "../assets/Logo.png";
import {
  loadAdminPreferences,
  saveAdminPreferences,
} from "../utils/adminPreferences";

const THEME_STORAGE_KEY = "belfiore-admin-theme";

const getInitialTheme = () => {
  if (typeof window === "undefined") return "system";
  const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
  return ["light", "dark", "system"].includes(savedTheme) ? savedTheme : "system";
};

const themeOptions = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

const startPageOptions = [
  { value: "/admin", label: "Dashboard" },
  { value: "/admin/orders", label: "Orders" },
  { value: "/admin/inventory", label: "Inventory" },
  { value: "/admin/customers", label: "Customers" },
  { value: "/admin/riders", label: "Riders" },
  { value: "/admin/reports", label: "Reports" },
];

const navigationGroups = [
  {
    label: "Main",
    items: [
      { to: "/admin", end: true, label: "Dashboard", description: "Overview & analytics", icon: LayoutDashboard },
      { to: "/admin/orders", label: "Orders", description: "Manage customer orders", icon: ShoppingCart },
      { to: "/admin/inventory", label: "Inventory", description: "Products, stock-in & stock-out", icon: Boxes },
      { to: "/admin/customers", label: "Customers", description: "Customer records & history", icon: Users },
    ],
  },
  {
    label: "Delivery",
    items: [
      { to: "/admin/riders", label: "Riders", description: "Delivery team & accounts", icon: Bike },
    ],
  },
  {
    label: "Analytics",
    items: [
      { to: "/admin/reports", label: "Reports", description: "Sales, inventory & deliveries", icon: BarChart3 },
    ],
  },
];

function AdminNavigation({ closeMenu }) {
  return (
    <nav className="flex-1 overflow-y-auto px-3 pb-3" aria-label="Admin navigation">
      {navigationGroups.map((group) => (
        <section key={group.label} className="border-t border-white/[0.09] py-4 first:border-t-0 first:pt-1">
          <h2 className="mb-2 px-2 text-[9px] font-bold uppercase tracking-[0.22em] text-emerald-300">
            {group.label}
          </h2>

          <div className="space-y-1.5">
            {group.items.map((item) => {
              const Icon = item.icon;

              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  onClick={closeMenu}
                  className={({ isActive }) =>
                    `group relative flex min-h-[54px] items-center gap-3 rounded-xl px-2 py-2 no-underline transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200 ${isActive
                      ? "bg-gradient-to-r from-[#d8fff0] to-[#b9f4d9] text-[#062c22] shadow-[0_8px_24px_rgba(0,0,0,0.16)]"
                      : "text-white/90 hover:bg-white/[0.07] hover:text-white"
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <span
                        className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg border transition ${isActive
                          ? "border-emerald-900/10 bg-[#073b2d] text-emerald-100"
                          : "border-white/[0.07] bg-white/[0.06] text-emerald-100 group-hover:bg-white/[0.1]"
                        }`}
                      >
                        <Icon size={17} strokeWidth={1.8} aria-hidden="true" />
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12px] font-semibold leading-4">{item.label}</span>
                        <span className={`mt-0.5 block truncate text-[10px] leading-4 ${isActive ? "text-emerald-950/65" : "text-white/50"}`}>
                          {item.description}
                        </span>
                      </span>

                      {isActive ? (
                        <span className="mr-1 h-2 w-2 shrink-0 rounded-full bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.12)]" aria-hidden="true" />
                      ) : null}
                    </>
                  )}
                </NavLink>
              );
            })}
          </div>
        </section>
      ))}
    </nav>
  );
}

function PreferenceToggle({ label, description, checked, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center gap-3 rounded-xl px-1 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200"
      role="switch"
      aria-checked={checked}
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-semibold text-white">{label}</span>
        <span className="mt-0.5 block text-[9px] leading-4 text-white/45">{description}</span>
      </span>
      <span className={`relative h-5 w-9 shrink-0 rounded-full transition ${checked ? "bg-emerald-300" : "bg-white/15"}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${checked ? "translate-x-[18px]" : "translate-x-0.5"}`} />
      </span>
    </button>
  );
}

export default function AdminLayout() {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [theme, setTheme] = useState(getInitialTheme);
  const [preferences, setPreferences] = useState(loadAdminPreferences);
  const [systemDark, setSystemDark] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches
  );
  const admin = getAdminUser();
  const adminName = admin?.name || admin?.fullName || "System Admin";
  const adminInitial = adminName.trim().charAt(0).toUpperCase() || "A";
  const resolvedTheme = theme === "system" ? (systemDark ? "dark" : "light") : theme;

  const performLogout = () => {
    clearToken();
    navigate("/admin/login", { replace: true });
  };

  const handleLogout = () => {
    if (preferences.confirmLogout) {
      setLogoutConfirmOpen(true);
      return;
    }
    performLogout();
  };

  const updatePreference = (key, value) => {
    setPreferences((current) => ({ ...current, [key]: value }));
  };

  useEffect(() => {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);

    if (theme !== "system") return undefined;

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const syncSystemTheme = (event) => setSystemDark(event.matches);
    mediaQuery.addEventListener("change", syncSystemTheme);
    return () => mediaQuery.removeEventListener("change", syncSystemTheme);
  }, [theme]);

  useEffect(() => {
    saveAdminPreferences(preferences);
  }, [preferences]);

  useEffect(() => {
    if (!menuOpen && !settingsOpen && !logoutConfirmOpen) return undefined;

    const closeOnEscape = (event) => {
      if (event.key === "Escape") {
        setSettingsOpen(false);
        setLogoutConfirmOpen(false);
        setMenuOpen(false);
      }
    };

    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [logoutConfirmOpen, menuOpen, settingsOpen]);

  const sidebar = (
    <aside className="relative flex h-full w-[292px] flex-col overflow-hidden rounded-r-[2rem] border-r border-emerald-300/10 bg-[#002d23] text-white shadow-[18px_0_55px_rgba(2,28,22,0.16)]">
      <div
        className="pointer-events-none absolute inset-0 opacity-70"
        aria-hidden="true"
        style={{
          backgroundImage:
            "radial-gradient(circle at 95% 8%, rgba(16,185,129,0.12), transparent 31%), radial-gradient(circle at 8% 78%, rgba(52,211,153,0.08), transparent 28%), linear-gradient(145deg, rgba(255,255,255,0.025), transparent 45%)",
        }}
      />

      <div className="relative flex min-h-0 flex-1 flex-col">
        <div className="px-4 pb-4 pt-5">
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-[#f7fffb] p-1 shadow-[0_8px_22px_rgba(0,0,0,0.2)]">
              <img src={logoImage} alt="" className="h-full w-full rounded-lg object-cover" />
            </span>

            <div className="min-w-0">
              <p className="truncate text-[22px] font-bold leading-tight tracking-tight text-white">Belfiore</p>
              <p className="mt-1 text-[9px] font-semibold uppercase tracking-[0.25em] text-emerald-300">Admin workspace</p>
            </div>
          </div>
        </div>

        <AdminNavigation closeMenu={() => setMenuOpen(false)} />

        <div className="relative px-3 pb-3">
          {settingsOpen ? (
            <section className="absolute bottom-[7.25rem] left-3 right-3 z-20 max-h-[min(34rem,72vh)] overflow-y-auto rounded-2xl border border-white/10 bg-[#073a2d] p-3 shadow-[0_18px_45px_rgba(0,0,0,0.35)]" aria-label="Admin settings">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[12px] font-semibold text-white">Settings</p>
                  <p className="mt-0.5 text-[10px] text-white/50">Personalize your workspace</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSettingsOpen(false)}
                  className="grid h-8 w-8 place-items-center rounded-lg text-white/60 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200"
                  aria-label="Close settings"
                >
                  <X size={15} />
                </button>
              </div>

              <p className="mt-4 text-[9px] font-bold uppercase tracking-[0.18em] text-emerald-300">Appearance</p>
              <div className="mt-3 grid grid-cols-3 gap-1.5">
                {themeOptions.map((option) => {
                  const ThemeIcon = option.icon;
                  const selected = theme === option.value;

                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setTheme(option.value)}
                      className={`flex flex-col items-center gap-1.5 rounded-xl border px-2 py-2.5 text-[9px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200 ${selected
                        ? "border-emerald-200 bg-emerald-100 text-emerald-950"
                        : "border-white/10 bg-white/[0.04] text-white/65 hover:bg-white/[0.08] hover:text-white"
                      }`}
                      aria-pressed={selected}
                    >
                      <ThemeIcon size={16} aria-hidden="true" />
                      {option.label}
                    </button>
                  );
                })}
              </div>

              <div className="mt-4 border-t border-white/10 pt-3">
                <p className="mb-1 text-[9px] font-bold uppercase tracking-[0.18em] text-emerald-300">Workspace</p>
                <PreferenceToggle
                  label="Compact view"
                  description="Tighter navigation, tables, and page spacing"
                  checked={preferences.compactMode}
                  onChange={(value) => updatePreference("compactMode", value)}
                />
                <PreferenceToggle
                  label="Reduce motion"
                  description="Limit animations and transitions"
                  checked={preferences.reduceMotion}
                  onChange={(value) => updatePreference("reduceMotion", value)}
                />

                <label className="mt-2 block">
                  <span className="text-[10px] font-semibold text-white">Default page</span>
                  <span className="mt-0.5 block text-[9px] text-white/45">Page opened after admin sign-in</span>
                  <select
                    value={preferences.startPage}
                    onChange={(event) => updatePreference("startPage", event.target.value)}
                    className="mt-2 h-9 w-full rounded-lg border border-white/10 bg-white/[0.07] px-2.5 text-[10px] text-white outline-none focus:border-emerald-300"
                  >
                    {startPageOptions.map((option) => (
                      <option key={option.value} value={option.value} className="bg-[#073a2d] text-white">
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="mt-4 border-t border-white/10 pt-3">
                <p className="mb-1 text-[9px] font-bold uppercase tracking-[0.18em] text-emerald-300">Security</p>
                <PreferenceToggle
                  label="Confirm before logout"
                  description="Prevent accidental sign-outs"
                  checked={preferences.confirmLogout}
                  onChange={(value) => updatePreference("confirmLogout", value)}
                />
              </div>
            </section>
          ) : null}

          <div className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.045] p-2">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-[#c9ffe9] to-[#8ee8bd] text-sm font-bold text-[#063c2d]">
              {adminInitial}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-semibold text-white">{adminName}</p>
              <p className="mt-0.5 text-[10px] text-white/50">Administrator</p>
            </div>
            <button
              type="button"
              onClick={() => setSettingsOpen((current) => !current)}
              className="mr-0.5 grid h-8 w-8 place-items-center rounded-lg text-emerald-300 transition hover:bg-white/10 hover:text-emerald-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200"
              aria-label="Open admin settings"
              aria-expanded={settingsOpen}
            >
              <Settings size={17} aria-hidden="true" />
            </button>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            className="mt-1.5 flex w-full items-center gap-3 rounded-xl border border-white/[0.08] px-3 py-2 text-[11px] font-medium text-white/70 transition hover:bg-white/[0.07] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200"
          >
            <LogOut size={16} aria-hidden="true" />
            Log out
          </button>
        </div>
      </div>
    </aside>
  );

  return (
    <div
      className="admin-shell min-h-screen bg-[#f4f7f5] lg:flex"
      data-admin-theme={resolvedTheme}
      data-admin-density={preferences.compactMode ? "compact" : "comfortable"}
      data-admin-motion={preferences.reduceMotion ? "reduce" : "full"}
    >
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-emerald-950/10 bg-[#00372a] px-4 text-white shadow-sm lg:hidden">
        <div className="flex items-center gap-2.5">
          <span className="grid h-10 w-10 place-items-center overflow-hidden rounded-xl bg-white p-1">
            <img src={logoImage} alt="" className="h-full w-full rounded-lg object-cover" />
          </span>
          <div>
            <p className="text-sm font-bold">Belfiore</p>
            <p className="text-[9px] uppercase tracking-[0.2em] text-emerald-300">Admin workspace</p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          className="grid h-10 w-10 place-items-center rounded-xl border border-white/15 bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200"
          aria-label="Open navigation"
          aria-expanded={menuOpen}
          aria-controls="admin-mobile-navigation"
        >
          <Menu size={20} />
        </button>
      </header>

      <div className="hidden h-screen shrink-0 lg:sticky lg:top-0 lg:block">{sidebar}</div>

      {menuOpen ? (
        <div id="admin-mobile-navigation" className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/55 backdrop-blur-sm"
            onClick={() => setMenuOpen(false)}
            aria-label="Close navigation"
          />
          <div className="relative h-full w-[292px] max-w-[88vw]">
            {sidebar}
            <button
              type="button"
              onClick={() => setMenuOpen(false)}
              className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-xl bg-white/[0.08] text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200"
              aria-label="Close navigation"
            >
              <X size={18} />
            </button>
          </div>
        </div>
      ) : null}

      {logoutConfirmOpen ? (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="logout-dialog-title"
            aria-describedby="logout-dialog-description"
            className="w-full max-w-sm rounded-2xl border border-emerald-100/20 bg-[#f8fffb] p-5 text-[#173d2b] shadow-[0_24px_80px_rgba(0,0,0,0.35)]"
          >
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-100 text-emerald-800">
              <LogOut size={19} aria-hidden="true" />
            </span>
            <h2 id="logout-dialog-title" className="mt-4 text-lg font-bold">Log out of admin?</h2>
            <p id="logout-dialog-description" className="mt-2 text-sm leading-6 text-emerald-950/65">
              You will need to sign in again to manage Belfiore.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setLogoutConfirmOpen(false)}
                className="rounded-xl border border-emerald-900/15 px-4 py-2.5 text-sm font-semibold transition hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={performLogout}
                className="rounded-xl bg-[#0f4d2e] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0b3b23] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
              >
                Log out
              </button>
            </div>
          </section>
        </div>
      ) : null}

      <main className="min-w-0 flex-1 overflow-x-hidden p-4 sm:p-6 lg:p-8 xl:p-10">
        <Outlet />
      </main>
    </div>
  );
}
