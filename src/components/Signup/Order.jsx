import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CircleCheckBig, Clock3, Package, Search, Store, Truck, UserRound } from "lucide-react";
import plantsImage from "../../assets/Plants.jpg";
import { formatPhp, getBuyerDetails, getNextInvoiceNumber, printInvoice } from "../../utils/invoice";

const orderTabs = [
  { key: "all", label: "All" },
  { key: "to-ship", label: "To Ship" },
  { key: "to-receive", label: "To Receive" },
  { key: "completed", label: "Completed" },
  { key: "cancelled", label: "Cancelled" },
  { key: "return-refund", label: "Return Refund" }
];

const statusConfig = {
  "to-ship": {
    label: "To Ship",
    badgeClass: "bg-sky-100 text-sky-700 ring-sky-200"
  },
  "to-receive": {
    label: "To Receive",
    badgeClass: "bg-cyan-100 text-cyan-700 ring-cyan-200"
  },
  completed: {
    label: "Completed",
    badgeClass: "bg-emerald-100 text-emerald-700 ring-emerald-200"
  },
  cancelled: {
    label: "Cancelled",
    badgeClass: "bg-rose-100 text-rose-700 ring-rose-200"
  },
  "return-refund": {
    label: "Return / Refund",
    badgeClass: "bg-gray-100 text-gray-700 ring-gray-200"
  }
};

const orders = [
  {
    id: "ORD-2026-101",
    store: "SAD Plant Hub",
    productId: 1,
    productName: "Belfiore Aloe hybrid",
    variation: "White Tag - 4-inch nursery pot",
    quantity: 1,
    originalPrice: 650,
    price: 620,
    status: "completed",
    deliveryNote: "Parcel has been delivered"
  },
  {
    id: "ORD-2026-102",
    store: "SAD Plant Hub",
    productId: 7,
    productName: "Emerald Succulent",
    variation: "Green Tag - Medium pot",
    quantity: 2,
    originalPrice: 600,
    price: 550,
    status: "to-receive",
    deliveryNote: "Parcel is in transit"
  },
  {
    id: "ORD-2026-103",
    store: "SAD Plant Hub",
    productId: 15,
    productName: "Rose Aloe",
    variation: "Red Tag - Premium cut",
    quantity: 1,
    originalPrice: 780,
    price: 750,
    status: "to-ship",
    deliveryNote: "Seller is preparing your parcel"
  },
  {
    id: "ORD-2026-104",
    store: "SAD Plant Hub",
    productId: 2,
    productName: "White Jade Plant",
    variation: "White Tag - Starter pack",
    quantity: 3,
    originalPrice: 540,
    price: 500,
    status: "to-ship",
    deliveryNote: "Seller is preparing your parcel"
  },
  {
    id: "ORD-2026-105",
    store: "SAD Plant Hub",
    productId: 9,
    productName: "Mint Cactus",
    variation: "Green Tag - 3-inch pot",
    quantity: 1,
    originalPrice: 450,
    price: 450,
    status: "cancelled",
    deliveryNote: "Order was cancelled"
  },
  {
    id: "ORD-2026-106",
    store: "SAD Plant Hub",
    productId: 5,
    productName: "Pearl Echeveria",
    variation: "White Tag - 5-inch decorative pot",
    quantity: 1,
    originalPrice: 620,
    price: 600,
    status: "return-refund",
    deliveryNote: "Return/refund request in progress"
  }
];

const loadStoredOrders = () => {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const parsedOrders = JSON.parse(window.localStorage.getItem("customerOrders") || "[]");
    return Array.isArray(parsedOrders) ? parsedOrders : [];
  } catch {
    return [];
  }
};

const getActionLabel = (status) => {
  if (status === "completed") return "Shop Again";
  if (status === "to-receive") return "Order Received";
  if (status === "to-ship") return "View Details";
  if (status === "cancelled") return "Reorder";
  return "View Request";
};

const getOrderImage = (order) => order.image || plantsImage;

export default function Order() {
  const [activeTab, setActiveTab] = useState("all");
  const [searchValue, setSearchValue] = useState("");
  const [storedOrders] = useState(loadStoredOrders);
  const navigate = useNavigate();
  const allOrders = useMemo(() => [...storedOrders, ...orders], [storedOrders]);

  const filteredOrders = useMemo(() => {
    const keyword = searchValue.trim().toLowerCase();

    return allOrders.filter((order) => {
      const statusPass = activeTab === "all" || order.status === activeTab;
      if (!statusPass) return false;

      if (!keyword) return true;
      const searchableText = `${order.productName} ${order.variation}`.toLowerCase();
      return searchableText.includes(keyword);
    });
  }, [activeTab, allOrders, searchValue]);

  const activeOrdersCount = allOrders.filter((order) => order.status !== "completed").length;
  const completedCount = allOrders.filter((order) => order.status === "completed").length;

  const handleLogout = () => {
    localStorage.removeItem("isLoggedIn");
  };

  const handleOrderAction = (order) => {
    const productId = Number(order.productId);

    if (Number.isInteger(productId) && productId > 0) {
      navigate(`/product/${productId}`, {
        state: {
          from: "/orders"
        }
      });
      return;
    }

    navigate("/products");
  };

  const handleDownloadInvoice = (order) => {
    const invoiceDate = new Date();
    const invoiceNumber = getNextInvoiceNumber(invoiceDate);
    const { name, email } = getBuyerDetails();
    const subtotal = order.price * order.quantity;
    const shippingFee = subtotal >= 2000 ? 0 : 120;
    const statusLabel = statusConfig[order.status]?.label || "Processing";

    printInvoice({
      invoiceNumber,
      orderId: order.id,
      invoiceDate,
      buyerName: name,
      buyerEmail: email,
      status: statusLabel,
      storeName: order.store || "SAD Plant Hub",
      items: [
        {
          name: order.productName,
          variation: order.variation,
          qty: order.quantity,
          unitPrice: order.price
        }
      ],
      shippingFee
    });
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
            <Link
              to="/dashboard"
              className="rounded-lg border border-gray-200 px-3 py-2 text-left text-gray-700 hover:border-emerald-300 hover:text-emerald-700"
            >
              Dashboard
            </Link>
            <Link
              to="/orders"
              className="rounded-lg bg-emerald-700 px-3 py-2 text-left font-semibold text-white"
            >
              Orders
            </Link>
            <Link
              to="/profile"
              className="rounded-lg border border-gray-200 px-3 py-2 text-left text-gray-700 hover:border-emerald-300 hover:text-emerald-700"
            >
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
          <section className="rounded-2xl border border-emerald-100 bg-[linear-gradient(135deg,#ecfdf5_0%,#f8fafc_65%)] p-6 shadow-sm md:p-8">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Order Center</p>
                <h1 className="mt-2 text-2xl font-bold text-gray-900 md:text-3xl">My Orders</h1>
                
              </div>

              <div className="grid grid-cols-3 gap-3">
                <article className="rounded-xl border border-white bg-white/90 px-4 py-3 shadow-sm">
                  <p className="text-xs uppercase tracking-[0.15em] text-gray-500">Total</p>
                  <p className="mt-1 text-xl font-bold text-gray-900">{allOrders.length}</p>
                </article>
                <article className="rounded-xl border border-white bg-white/90 px-4 py-3 shadow-sm">
                  <p className="text-xs uppercase tracking-[0.15em] text-gray-500">Active</p>
                  <p className="mt-1 text-xl font-bold text-gray-900">{activeOrdersCount}</p>
                </article>
                <article className="rounded-xl border border-white bg-white/90 px-4 py-3 shadow-sm">
                  <p className="text-xs uppercase tracking-[0.15em] text-gray-500">Completed</p>
                  <p className="mt-1 text-xl font-bold text-gray-900">{completedCount}</p>
                </article>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-white/80 bg-white/95 shadow-sm backdrop-blur">
            <div className="overflow-x-auto border-b border-gray-200 px-3 py-3 sm:px-6">
              <div className="flex min-w-max gap-2">
                {orderTabs.map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                      activeTab === tab.key
                        ? "bg-emerald-700 text-white"
                        : "bg-gray-100 text-gray-700 hover:bg-emerald-50 hover:text-emerald-700"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="border-b border-gray-200 bg-gray-50/70 px-4 py-3 sm:px-6">
              <label className="relative block">
                <Search
                  size={17}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                />
                <input
                  type="search"
                  value={searchValue}
                  onChange={(event) => setSearchValue(event.target.value)}
                  placeholder="Search by product name or tag"
                  className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-3 text-sm text-gray-700 outline-none ring-emerald-200 placeholder:text-gray-400 focus:ring-2"
                />
              </label>
            </div>

            <div className="space-y-4 bg-gray-50/40 p-4 sm:p-6">
              {filteredOrders.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
                  Walang order para sa selected tab o search keyword.
                </div>
              ) : (
                filteredOrders.map((order) => {
                  const total = order.price * order.quantity;
                  const actionLabel = getActionLabel(order.status);
                  const tagLabel = order.variation.split("-")[0].trim();
                  const status = statusConfig[order.status] || statusConfig["to-ship"];

                  return (
                    <article key={order.id} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gray-500">{order.id}</p>
                          <h3 className="mt-1 text-lg font-semibold text-gray-900">{order.productName}</h3>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                              {tagLabel}
                            </span>
                            <p className="text-sm text-gray-500">{order.variation}</p>
                          </div>
                        </div>
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${status.badgeClass}`}
                        >
                          {status.label}
                        </span>
                      </div>

                      <div className="mt-4 grid gap-3 border-y border-gray-100 py-4 sm:grid-cols-[88px_1fr_auto]">
                        <img
                          src={getOrderImage(order)}
                          alt={order.productName}
                          className="h-[88px] w-[88px] rounded border border-gray-200 object-cover"
                        />

                        <div className="rounded-xl border border-gray-200 bg-gray-50/70 p-3">
                          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gray-500">Delivery Update</p>
                          <p className="mt-1 flex items-center gap-2 text-sm font-medium text-gray-800">
                            <Truck size={14} className="text-emerald-700" />
                            {order.deliveryNote}
                          </p>
                          <p className="mt-2 text-sm text-gray-600">
                            Quantity:
                            <span className="ml-1 font-semibold text-gray-900">x{order.quantity}</span>
                          </p>
                        </div>

                        <div className="text-left sm:text-right">
                          <p className="text-xs uppercase tracking-[0.14em] text-gray-500">Unit Price</p>
                          <p className="text-sm text-gray-400 line-through">{formatPhp(order.originalPrice)}</p>
                          <p className="text-lg font-semibold text-orange-500">{formatPhp(order.price)}</p>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                        <p className="text-base text-gray-800 sm:mr-3">
                          Order Total:
                          <span className="ml-2 text-2xl font-semibold text-orange-500">{formatPhp(total)}</span>
                        </p>

                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            onClick={() => handleDownloadInvoice(order)}
                            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                          >
                            Download Invoice
                          </button>
                          <button
                            onClick={() => handleOrderAction(order)}
                            className="inline-flex items-center justify-center rounded-lg bg-emerald-700 px-5 py-2 text-sm font-semibold text-white transition hover:bg-emerald-800"
                          >
                            {actionLabel}
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-white/80 bg-white/95 p-5 shadow-sm backdrop-blur">
            <div className="grid gap-3 sm:grid-cols-3">
              <article className="rounded-xl border border-emerald-100 bg-emerald-50/70 p-3">
                <p className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
                  <Package size={15} />
                  Active Orders
                </p>
                <p className="mt-1 text-2xl font-bold text-gray-900">{activeOrdersCount}</p>
              </article>

              <article className="rounded-xl border border-cyan-100 bg-cyan-50/70 p-3">
                <p className="flex items-center gap-2 text-sm font-semibold text-cyan-700">
                  <Clock3 size={15} />
                  Processing
                </p>
                <p className="mt-1 text-2xl font-bold text-gray-900">{allOrders.length - completedCount}</p>
              </article>

              <article className="rounded-xl border border-emerald-100 bg-emerald-50/70 p-3">
                <p className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
                  <CircleCheckBig size={15} />
                  Completed
                </p>
                <p className="mt-1 text-2xl font-bold text-gray-900">{completedCount}</p>
              </article>
            </div>

            <div className="mt-4 flex items-center gap-2 text-sm text-gray-600">
              <Store size={16} className="text-emerald-700" />
              Sample order history lang ito at puwedeng palitan ng real database/API data.
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
