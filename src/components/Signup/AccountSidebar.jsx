import { useState } from "react";
import { ChevronDown, UserRound } from "lucide-react";
import { Link, NavLink, useLocation } from "react-router-dom";

const accountLinks = [
  { to: "/profile", label: "Profile" },
  { to: "/banks-cards", label: "Bank & Cards" },
  { to: "/addresses", label: "Addresses" },
  { to: "/change-password", label: "Change Password" }
];
const accountPaths = new Set(["/profile", "/account-details", "/banks-cards", "/addresses", "/change-password"]);

function navClass(isActive) {
  return "rounded-xl border px-3 py-2.5 text-left transition " + (
    isActive
      ? "border-[#0f4d2e] bg-[#0f4d2e] font-semibold text-white shadow-sm"
      : "border-[#e1e7dc] text-[#405145] hover:border-[#b7ccb5] hover:text-[#0f4d2e]"
  );
}

export default function AccountSidebar({ onLogout }) {
  const { pathname } = useLocation();
  const accountActive = accountPaths.has(pathname);
  const [accountOpen, setAccountOpen] = useState(accountActive);

  return (
    <aside className="self-start border-x border-[#e3eadf] bg-white px-5 py-6 lg:sticky lg:top-0 lg:z-40 lg:h-[100dvh] lg:overflow-y-auto">
      <div className="mb-6 flex items-center gap-3">
        <Link
          to="/profile"
          aria-label="Go to My Account"
          className="grid h-11 w-11 place-items-center rounded-full bg-[#e8f3ea] text-[#0f4d2e] transition hover:bg-[#d9ebdc]"
        >
          <UserRound size={18} />
        </Link>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#6c786f]">Account</p>
          <h2 className="mt-1 text-lg font-semibold text-[#173d2b]">User Panel</h2>
        </div>
      </div>

      <nav className="grid grid-cols-2 gap-2 text-sm lg:grid-cols-1">
        <button
          type="button"
          onClick={() => setAccountOpen((open) => !open)}
          aria-expanded={accountOpen}
          className={navClass(accountActive) + " col-span-2 flex items-center justify-between lg:col-span-1"}
        >
          <span>My Account</span>
          <ChevronDown size={16} className={"transition-transform " + (accountOpen ? "rotate-180" : "")} />
        </button>

        {accountOpen ? (
          <div className="col-span-2 ml-3 grid gap-1 border-l border-[#dbe5d8] pl-3 lg:col-span-1">
            {accountLinks.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  "rounded-lg px-3 py-2 text-left transition " + (
                    isActive
                      ? "bg-[#e8f3ea] font-semibold text-[#0f4d2e]"
                      : "text-[#526158] hover:bg-[#f3f7f1] hover:text-[#0f4d2e]"
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </div>
        ) : null}
        <NavLink to="/dashboard" className={({ isActive }) => navClass(isActive)}>
          Dashboard
        </NavLink>
        <NavLink to="/orders" className={({ isActive }) => navClass(isActive)}>
          My Purchases
        </NavLink>

        <Link
          to="/login"
          onClick={onLogout}
          className="col-span-2 rounded-xl border border-red-200 px-3 py-2.5 text-left text-red-600 transition hover:bg-red-50 lg:col-span-1"
        >
          Logout
        </Link>
      </nav>
    </aside>
  );
}