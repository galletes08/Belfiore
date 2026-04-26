import { Link } from "react-router-dom";
import { CircleCheckBig, Clock3, MapPinned, Package, ReceiptText, Truck, UserRound } from "lucide-react";
import { clearCustomerToken } from "../../api/client";

const orders = [
  { id: "ORD-1001", date: "March 5, 2026", total: 1250, status: "Out for Delivery", courier: "Personal Rider" },
  { id: "ORD-1002", date: "March 3, 2026", total: 2400, status: "In Transit", courier: "DHL" },
  { id: "ORD-1003", date: "February 28, 2026", total: 980, status: "Delivered", courier: "LBC" }
];

const statusStyles = {
  "Out for Delivery": "bg-violet-100 text-violet-800 ring-violet-200",
  "In Transit": "bg-indigo-100 text-indigo-800 ring-indigo-200",
  Delivered: "bg-emerald-100 text-emerald-800 ring-emerald-200"
};

const formatPhp = (amount) =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 0
  }).format(amount);

function AccountSidebar({ onLogout }) {
  return (
    <aside className="self-start border-x border-[#e3eadf] bg-white px-5 py-6 lg:sticky lg:top-0 lg:z-40 lg:h-[100dvh] lg:overflow-y-auto">
      <div className="mb-6 flex items-center gap-3">
        <Link
          to="/profile"
          aria-label="Go to Profile"
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
        <Link to="/dashboard" className="rounded-xl bg-[#0f4d2e] px-3 py-2.5 text-left font-semibold text-white shadow-sm">
          Dashboard
        </Link>
        <Link to="/orders" className="rounded-xl border border-[#e1e7dc] px-3 py-2.5 text-left text-[#405145] transition hover:border-[#b7ccb5] hover:text-[#0f4d2e]">
          Orders
        </Link>
        <Link to="/profile" className="rounded-xl border border-[#e1e7dc] px-3 py-2.5 text-left text-[#405145] transition hover:border-[#b7ccb5] hover:text-[#0f4d2e]">
          Profile
        </Link>
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

function StatCard({ icon, label, value, tone }) {
  return (
    <article className="rounded-2xl border border-[#e1e7dc] bg-white px-5 py-5 shadow-sm">
      <div className={`mb-4 grid h-10 w-10 place-items-center rounded-xl ${tone}`}>
        {icon}
      </div>
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-[#6c786f]">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-[#173d2b]">{value}</p>
    </article>
  );
}

export default function UserDashboard() {
  const totalOrders = orders.length;
  const inTransit = orders.filter((order) => order.status !== "Delivered").length;
  const delivered = orders.filter((order) => order.status === "Delivered").length;
  const activeOrder = orders.find((order) => order.status !== "Delivered") || orders[0];
  const dashboardStats = [
    { label: "Total Orders", value: totalOrders, icon: <Package size={18} />, tone: "bg-[#e8f3ea] text-[#0f4d2e]" },
    { label: "In Transit", value: inTransit, icon: <Truck size={18} />, tone: "bg-sky-50 text-sky-700" },
    { label: "Delivered", value: delivered, icon: <CircleCheckBig size={18} />, tone: "bg-emerald-50 text-emerald-700" }
  ];

  const handleLogout = () => {
    localStorage.removeItem("isLoggedIn");
    clearCustomerToken();
  };

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#f8faf6] font-['Montserrat'] text-[#24372d]">
      <div className="mx-auto grid w-full max-w-[1500px] grid-cols-1 gap-0 px-4 md:px-6 lg:grid-cols-[250px_minmax(0,1fr)]">
        <AccountSidebar onLogout={handleLogout} />

        <main className="min-w-0 space-y-6 py-6 lg:px-6">
          <section className="py-2">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
              <div className="max-w-2xl">
                <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[#5e6f65]">Dashboard</p>
                <h1 className="mt-3 font-['Playfair_Display'] text-4xl leading-tight text-[#0f4d2e] md:text-5xl">
                  Welcome back, Plant Lover
                </h1>
                <p className="mt-3 text-sm leading-7 text-[#5e6f65] md:text-base">
                  A calm overview of your purchases, delivery activity, and latest tracking progress.
                </p>
              </div>

              <Link
                to="/orders"
                className="inline-flex w-fit items-center justify-center gap-2 rounded-xl border border-[#b9d7c3] bg-white px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-[#0f6b45] shadow-sm transition hover:border-[#0f6b45] hover:bg-[#f1faf3]"
              >
                <ReceiptText size={15} />
                View Orders
              </Link>
            </div>
          </section>

          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {dashboardStats.map((item) => (
              <StatCard key={item.label} {...item} />
            ))}
          </section>

          <section className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
            <article className="rounded-[1.35rem] border border-[#e1e7dc] bg-white p-5 shadow-[0_18px_45px_rgba(15,77,46,0.06)] md:p-6">
              <div className="mb-5 flex flex-col gap-3 border-b border-[#eef2ea] pb-5 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-[#6c786f]">Orders</p>
                  <h2 className="mt-1 font-['Playfair_Display'] text-3xl text-[#0f4d2e]">Recent Activity</h2>
                </div>
                <Link to="/orders" className="text-xs font-semibold uppercase tracking-[0.18em] text-[#0f6b45] hover:text-[#173d2b]">
                  View All
                </Link>
              </div>

              <div className="space-y-3">
                {orders.map((order) => (
                  <article
                    key={order.id}
                    className="grid gap-4 rounded-2xl border border-[#e8eee6] bg-[#fbfcf8] p-4 md:grid-cols-[1.25fr_0.75fr_0.8fr_auto] md:items-center"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#5e6f65]">{order.id}</p>
                      <p className="mt-1 text-sm text-[#6c786f]">{order.date}</p>
                      <p className="mt-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#0f6b45]">
                        Delivery: {order.courier}
                      </p>
                    </div>

                    <p className="text-sm font-semibold text-[#173d2b] md:text-center">{formatPhp(order.total)}</p>

                    <span
                      className={`w-fit rounded-full px-3 py-1 text-xs font-semibold ring-1 md:mx-auto ${statusStyles[order.status]}`}
                    >
                      {order.status}
                    </span>

                    <Link
                      to="/orders"
                      className="inline-flex w-fit items-center justify-center rounded-xl border border-[#b9d7c3] bg-white px-3.5 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#0f6b45] transition hover:border-[#0f6b45] hover:bg-[#f1faf3]"
                    >
                      Track
                    </Link>
                  </article>
                ))}
              </div>
            </article>

            <article className="rounded-[1.35rem] border border-[#e1e7dc] bg-[#f7f5f0] p-5 shadow-sm md:p-6">
              <div className="mb-5 flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-white text-[#0f4d2e] shadow-sm">
                  <MapPinned size={18} />
                </span>
                <div>
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-[#6c786f]">Delivery</p>
                  <h2 className="font-['Playfair_Display'] text-2xl text-[#0f4d2e]">Latest Tracking</h2>
                </div>
              </div>

              <div className="rounded-2xl border border-[#e1e7dc] bg-white p-4">
                <div className="relative h-48 overflow-hidden rounded-2xl border border-[#e8eee6] bg-[#fbfcf8]">
                  <div className="absolute left-8 top-9 h-3 w-3 rounded-full bg-[#0f4d2e] ring-8 ring-[#d9ebdc]" />
                  <div className="absolute right-10 bottom-10 h-3 w-3 rounded-full bg-sky-600 ring-8 ring-sky-100" />
                  <div className="absolute left-11 top-12 h-[2px] w-[70%] origin-left rotate-[22deg] bg-[#b9d7c3]" />
                  <p className="absolute bottom-3 left-3 rounded-xl bg-white/90 px-3 py-2 text-xs font-semibold text-[#405145] shadow-sm">
                    Courier: {activeOrder.courier}
                  </p>
                </div>

                <div className="mt-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#6c786f]">Latest Update</p>
                  <p className="mt-2 text-base font-semibold text-[#173d2b]">
                    {activeOrder.id} is {activeOrder.status.toLowerCase()}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-[#5e6f65]">Estimated arrival: Today, 3:00 PM - 6:00 PM</p>
                </div>

                <div className="mt-4 space-y-3 text-sm text-[#405145]">
                  <p className="flex items-center gap-2">
                    <CircleCheckBig size={15} className="text-emerald-700" />
                    Package prepared at warehouse
                  </p>
                  <p className="flex items-center gap-2">
                    <Truck size={15} className="text-emerald-700" />
                    In transit to local hub
                  </p>
                  <p className="flex items-center gap-2 font-semibold text-[#0f6b45]">
                    <Clock3 size={15} />
                    Out for delivery
                  </p>
                </div>
              </div>
            </article>
          </section>
        </main>
      </div>
    </div>
  );
}
