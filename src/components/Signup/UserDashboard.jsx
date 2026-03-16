import { Link } from "react-router-dom";
import { Package, Truck, CircleCheckBig, MapPinned, UserRound } from "lucide-react";
import { clearCustomerToken } from "../../api/client";

const orders = [
  { id: "ORD-1001", date: "March 5, 2026", total: 1250, status: "Out for Delivery", courier: "Personal Rider" },
  { id: "ORD-1002", date: "March 3, 2026", total: 2400, status: "In Transit", courier: "DHL" },
  { id: "ORD-1003", date: "February 28, 2026", total: 980, status: "Delivered", courier: "LBC" }
];

const statusStyles = {
  "Out for Delivery": "bg-amber-100 text-amber-800 ring-amber-200",
  "In Transit": "bg-sky-100 text-sky-800 ring-sky-200",
  Delivered: "bg-emerald-100 text-emerald-800 ring-emerald-200"
};

const formatPhp = (amount) =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 0
  }).format(amount);

export default function UserDashboard() {
  const totalOrders = orders.length;
  const inTransit = orders.filter((order) => order.status !== "Delivered").length;
  const delivered = orders.filter((order) => order.status === "Delivered").length;
  const activeOrder = orders.find((order) => order.status !== "Delivered") || orders[0];
  const handleLogout = () => {
    localStorage.removeItem("isLoggedIn");
    clearCustomerToken();
  };

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[linear-gradient(180deg,#f8faf9_0%,#f2f6f4_45%,#eef3f1_100%)]">
      <div className="pointer-events-none absolute -right-24 top-0 h-72 w-72 rounded-full bg-emerald-200/30 blur-3xl" />
      <div className="pointer-events-none absolute -left-24 bottom-0 h-72 w-72 rounded-full bg-lime-100/40 blur-3xl" />

      <div className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-5 px-4 py-0 md:px-6 lg:grid-cols-[260px_1fr]">
        <aside className="self-start rounded-none border border-white/80 bg-white/90 p-5 shadow-sm backdrop-blur lg:sticky lg:top-0 lg:z-40 lg:h-[100dvh] lg:overflow-y-auto">
          <div className="mb-6 flex items-center gap-3">
            <Link
              to="/profile"
              aria-label="Go to Profile"
              className="rounded-full bg-emerald-100 p-2 text-emerald-700 transition hover:bg-emerald-200"
            >
              <UserRound size={18} />
            </Link>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Account</p>
              <h2 className="text-lg font-bold text-gray-900">User Panel</h2>
            </div>
          </div>

          <nav className="grid grid-cols-2 gap-2 text-sm lg:grid-cols-1">
            <button className="rounded-lg bg-emerald-700 px-3 py-2 text-left font-semibold text-white">Dashboard</button>
            <Link to="/orders" className="rounded-lg border border-gray-200 px-3 py-2 text-left text-gray-700 hover:border-emerald-300 hover:text-emerald-700">
              Orders
            </Link>
            <Link to="/profile" className="rounded-lg border border-gray-200 px-3 py-2 text-left text-gray-700 hover:border-emerald-300 hover:text-emerald-700">
              Profile 
            </Link>
            <Link
              to="/login"
              onClick={handleLogout}
              className="col-span-2 rounded-lg border border-red-200 px-3 py-2 text-left text-red-600 hover:bg-red-50 lg:col-span-1"
            >
              Logout
            </Link>
          </nav>
        </aside>

        <main className="space-y-5 py-6">
          <section className="rounded-2xl border border-white/80 bg-white/95 p-6 shadow-sm backdrop-blur">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Dashboard</p>
            <h1 className="mt-2 text-2xl font-bold text-gray-900 md:text-3xl">Welcome back, Plant Lover</h1>
            <p className="mt-2 text-sm text-gray-600">Here's a summary of your account and recent activity.</p>
          </section>

          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <article className="rounded-xl border border-emerald-100 bg-white p-5 shadow-sm">
              <div className="mb-3 inline-flex rounded-lg bg-emerald-100 p-2 text-emerald-700">
                <Package size={18} />
              </div>
              <p className="text-sm text-gray-500">Total Orders</p>
              <p className="text-2xl font-bold text-gray-900">{totalOrders}</p>
            </article>

            <article className="rounded-xl border border-sky-100 bg-white p-5 shadow-sm">
              <div className="mb-3 inline-flex rounded-lg bg-sky-100 p-2 text-sky-700">
                <Truck size={18} />
              </div>
              <p className="text-sm text-gray-500">Orders In Transit</p>
              <p className="text-2xl font-bold text-gray-900">{inTransit}</p>
            </article>

            <article className="rounded-xl border border-emerald-100 bg-white p-5 shadow-sm sm:col-span-2 xl:col-span-1">
              <div className="mb-3 inline-flex rounded-lg bg-emerald-100 p-2 text-emerald-700">
                <CircleCheckBig size={18} />
              </div>
              <p className="text-sm text-gray-500">Delivered Orders</p>
              <p className="text-2xl font-bold text-gray-900">{delivered}</p>
            </article>
          </section>

          <section className="rounded-2xl border border-white/80 bg-white/95 p-6 shadow-sm backdrop-blur">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-xl font-semibold text-gray-900">Recent Orders</h2>
              <Link to="/orders" className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.15em] text-gray-700 hover:border-emerald-300 hover:text-emerald-700">
                View All
              </Link>
            </div>

            <div className="space-y-3">
              {orders.map((order) => (
                <article
                  key={order.id}
                  className="grid gap-3 rounded-xl border border-gray-200 bg-gray-50/40 p-4 md:grid-cols-[1.4fr_0.8fr_0.9fr_0.9fr] md:items-center"
                >
                  <div>
                    <p className="font-semibold text-gray-900">{order.id}</p>
                    <p className="text-sm text-gray-500">{order.date}</p>
                    <p className="text-xs font-medium uppercase tracking-[0.12em] text-emerald-700">
                      Delivery: {order.courier}
                    </p>
                  </div>

                  <p className="font-semibold text-gray-800 md:text-center">{formatPhp(order.total)}</p>

                  <span
                    className={`w-fit rounded-full px-3 py-1 text-xs font-semibold ring-1 md:mx-auto ${statusStyles[order.status]}`}
                  >
                    {order.status}
                  </span>

                  <div className="md:ml-auto">
                    {order.status !== "Delivered" ? (
                      <button className="w-full rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 md:w-auto">
                        Track Order
                      </button>
                    ) : (
                      <span className="inline-block rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700">
                        Delivered
                      </span>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-white/80 bg-white/95 p-6 shadow-sm backdrop-blur">
            <div className="mb-4 flex items-center gap-2">
              <MapPinned size={18} className="text-emerald-700" />
              <h2 className="text-xl font-semibold text-gray-900">Delivery Tracking</h2>
            </div>

            <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="relative h-64 overflow-hidden rounded-xl border border-gray-200 bg-[radial-gradient(circle_at_top_right,#dcfce7_0%,#f3f4f6_50%,#e5e7eb_100%)] md:h-72">
                <div className="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 animate-pulse rounded-full bg-emerald-600 ring-8 ring-emerald-200/70" />
                <p className="absolute bottom-3 left-3 rounded-md bg-white/80 px-2 py-1 text-xs font-semibold text-gray-700">
                  Courier is near Quezon City hub
                </p>
              </div>

              <div className="rounded-xl border border-gray-200 p-4">
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-500">Latest Update</p>
                <p className="mt-2 text-base font-semibold text-gray-900">
                  {activeOrder.id} is {activeOrder.status.toLowerCase()}
                </p>
                <p className="mt-1 text-sm font-medium text-emerald-700">Courier: {activeOrder.courier}</p>
                <p className="mt-1 text-sm text-gray-600">Estimated arrival: Today, 3:00 PM - 6:00 PM</p>

                <div className="mt-4 space-y-2 text-sm text-gray-700">
                  <p>1. Package prepared at warehouse</p>
                  <p>2. In transit to local hub</p>
                  <p className="font-semibold text-emerald-700">3. Out for delivery</p>
                </div>
              </div>
            </div>
          </section>

        </main>
      </div>
    </div>
  );
}
