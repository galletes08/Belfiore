import { useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { Menu, Search, ShoppingCart, User, X } from "lucide-react";
import CartSidebar from "./CartSidebar";
import logoImage from "../assets/Logo.png";

const navItems = [
  { to: "/", label: "Home" },
  { to: "/products", label: "Products" },
  { to: "/about", label: "About Us" },
  { to: "/contact", label: "Contact" }
];

export default function Navbar({
  cartItems = [],
  onIncreaseQty,
  onDecreaseQty,
  onRemoveItem,
  onCheckout
}) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);

  const navigate = useNavigate();
  const isLoggedIn = typeof window !== "undefined" && window.localStorage.getItem("isLoggedIn") === "true";
  const userRoute = isLoggedIn ? "/dashboard" : "/login";
  const userLabel = isLoggedIn ? "Dashboard" : "Login";
  const cartItemCount = cartItems.reduce((sum, item) => sum + item.qty, 0);

  const handleMenuClose = () => setIsMenuOpen(false);
  const handleCartClick = () => setCartOpen(true);
  const handleCloseCart = () => setCartOpen(false);
  const handleShopAll = () => {
    setCartOpen(false);
    navigate("/products");
  };
  const handleCheckout = () => {
    const checkoutResult = onCheckout?.();

    if (checkoutResult === false) {
      return;
    }
    setCartOpen(false);
    navigate("/checkout");
  };
  const handleSearchClick = () => navigate("/products");

  return (
    <header className="sticky top-0 z-50 border-b border-emerald-100/70 bg-white/95 backdrop-blur">
      <div className="bg-[linear-gradient(90deg,#0f766e_0%,#047857_50%,#065f46_100%)] px-4 py-2 text-center md:py-2.5">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-50 md:text-sm">
          Free shipping on orders over Php2,000
        </p>
      </div>

      <nav className="mx-auto max-w-7xl px-4 py-4 md:px-6 md:py-5">
        <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
          <Link to="/" className="flex items-center gap-2 rounded-lg pr-2" onClick={handleMenuClose}>
            <img src={logoImage} alt="Belfiore Succulents PH logo" className="h-12 w-12 rounded-full object-cover md:h-14 md:w-14" />
            <div className="hidden sm:block">
              <p className="text-sm font-semibold uppercase tracking-[0.14em] text-emerald-700 md:text-base">Belfiore</p>
              <p className="text-base font-bold leading-tight text-gray-900 md:text-lg">Succulents PH</p>
            </div>
          </Link>

          <div className="hidden items-center justify-center gap-8 md:flex">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `relative text-base font-semibold tracking-wide transition ${
                    isActive ? "text-emerald-700" : "text-gray-700 hover:text-emerald-700"
                  }`
                }
              >
                {({ isActive }) => (
                  <span className="inline-block">
                    {item.label}
                    <span
                      className={`mt-1 block h-0.5 w-full origin-left rounded-full transition ${
                        isActive ? "scale-100 bg-emerald-700" : "scale-0 bg-transparent"
                      }`}
                    />
                  </span>
                )}
              </NavLink>
            ))}
          </div>

          <div className="flex items-center justify-end gap-1 sm:gap-2">
            <button
              onClick={handleSearchClick}
              className="rounded-full p-2.5 text-gray-700 transition hover:bg-emerald-50 hover:text-emerald-700 md:p-3"
              aria-label="Search products"
            >
              <Search className="h-5 w-5 md:h-6 md:w-6" />
            </button>

            <Link
              to={userRoute}
              className="rounded-full p-2.5 text-gray-700 transition hover:bg-emerald-50 hover:text-emerald-700 md:p-3"
              aria-label={userLabel}
              onClick={handleMenuClose}
            >
              <User className="h-5 w-5 md:h-6 md:w-6" />
            </Link>

            <button
              onClick={handleCartClick}
              className="relative rounded-full p-2.5 text-gray-700 transition hover:bg-emerald-50 hover:text-emerald-700 md:p-3"
              aria-label="Open cart"
            >
              <ShoppingCart className="h-5 w-5 md:h-6 md:w-6" />
              {cartItemCount > 0 && (
                <span className="absolute right-1 top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-700 px-1 text-[10px] font-semibold text-white md:right-1.5 md:top-1.5">
                  {cartItemCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setIsMenuOpen((previous) => !previous)}
              className="rounded-full p-2.5 text-gray-700 transition hover:bg-emerald-50 hover:text-emerald-700 md:hidden"
              aria-label="Toggle menu"
            >
              {isMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {isMenuOpen && (
          <div className="mt-3 rounded-2xl border border-emerald-100 bg-white p-3 shadow-sm md:hidden">
            <div className="grid gap-1">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={handleMenuClose}
                  className={({ isActive }) =>
                    `rounded-lg px-3 py-2.5 text-base font-semibold transition ${
                      isActive ? "bg-emerald-700 text-white" : "text-gray-700 hover:bg-emerald-50 hover:text-emerald-700"
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </div>

            <div className="mt-3 border-t border-gray-100 pt-3">
              <Link
                to={userRoute}
                onClick={handleMenuClose}
                className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-3 py-2.5 text-base font-semibold text-white"
              >
                <User size={16} />
                {userLabel}
              </Link>
            </div>
          </div>
        )}

        {cartOpen && (
          <CartSidebar
            cartItems={cartItems}
            onClose={handleCloseCart}
            onShopAll={handleShopAll}
            onCheckout={handleCheckout}
            onIncreaseQty={onIncreaseQty}
            onDecreaseQty={onDecreaseQty}
            onRemoveItem={onRemoveItem}
          />
        )}
      </nav>
    </header>
  );
}
