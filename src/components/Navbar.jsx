import { useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { Menu, ShoppingCart, User, X } from "lucide-react";
import CartSidebar from "./CartSidebar";
import logoImage from "../assets/Logo.png";
import { getCustomerUser, hasCustomerToken } from "../api/client";

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
  const customerUser = getCustomerUser();
  const isLoggedIn =
    typeof window !== "undefined" &&
    window.localStorage.getItem("isLoggedIn") === "true" &&
    hasCustomerToken() &&
    (customerUser?.role ?? "customer") === "customer";
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

  return (
    <header className="sticky top-0 z-50 border-b border-[#dfe9dc] bg-white/95 font-['Montserrat'] shadow-[0_12px_30px_rgba(15,77,46,0.04)] backdrop-blur">
      <div className="overflow-hidden bg-[#0f4d2e] px-4 py-1.5">
        <div className="announcement-loop" aria-label="Free shipping notice">
          <p className="announcement-loop-text">Free shipping on orders over Php2,000</p>
          <p className="announcement-loop-text" aria-hidden="true">
            Free shipping on orders over Php2,000
          </p>
        </div>
      </div>

      <nav className="mx-auto max-w-[1500px] px-4 py-3 md:px-8 md:py-4">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
          <Link to="/" className="flex items-center gap-3 rounded-2xl pr-2" onClick={handleMenuClose}>
            <span className="grid h-14 w-14 place-items-center overflow-hidden rounded-full bg-[#f1faf3] md:h-16 md:w-16">
              <img src={logoImage} alt="Belfiore Succulents PH logo" className="h-full w-full object-cover" />
            </span>
            <div className="hidden sm:block">
              <p className="text-xs font-semibold uppercase tracking-[0.32em] text-[#0f6b45] md:text-sm">Belfiore</p>
              <p className="mt-1 font-['Playfair_Display'] text-xl font-semibold leading-none text-[#173d2b] md:text-2xl">Succulents PH</p>
            </div>
          </Link>

          <div className="hidden items-center justify-center gap-2 md:flex">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `relative rounded-full px-4 py-2.5 font-['Montserrat'] text-[0.95rem] font-semibold tracking-[0.04em] transition lg:px-5 lg:text-base ${
                    isActive ? "text-[#0f6b45]" : "text-[#24372d] hover:bg-[#f1faf3] hover:text-[#0f6b45]"
                  }`
                }
              >
                {({ isActive }) => (
                  <span className="inline-block whitespace-nowrap">
                    {item.label}
                    <span
                      className={`mx-auto mt-2 block h-0.5 w-8 origin-center rounded-full transition ${
                        isActive ? "scale-100 bg-[#0f6b45]" : "scale-0 bg-transparent"
                      }`}
                    />
                  </span>
                )}
              </NavLink>
            ))}
          </div>

          <div className="flex items-center justify-end gap-1 sm:gap-2">
            <Link
              to={userRoute}
              className="grid h-10 w-10 place-items-center rounded-full text-[#10213b] transition hover:bg-[#f1faf3] hover:text-[#0f6b45] md:h-11 md:w-11"
              aria-label={userLabel}
              onClick={handleMenuClose}
            >
              <User className="h-5 w-5" strokeWidth={2.2} />
            </Link>

            <button
              onClick={handleCartClick}
              className="relative grid h-10 w-10 place-items-center rounded-full text-[#10213b] transition hover:bg-[#f1faf3] hover:text-[#0f6b45] md:h-11 md:w-11"
              aria-label="Open cart"
            >
              <ShoppingCart className="h-5 w-5" strokeWidth={2.2} />
              {cartItemCount > 0 && (
                <span className="absolute right-0.5 top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[#0f6b45] px-1 text-[10px] font-semibold text-white">
                  {cartItemCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setIsMenuOpen((previous) => !previous)}
              className="grid h-10 w-10 place-items-center rounded-full text-[#10213b] transition hover:bg-[#f1faf3] hover:text-[#0f6b45] md:hidden"
              aria-label="Toggle menu"
            >
              {isMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {isMenuOpen && (
          <div className="mt-3 rounded-2xl border border-[#dfe9dc] bg-white p-3 shadow-[0_18px_45px_rgba(15,77,46,0.08)] md:hidden">
            <div className="grid gap-1">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={handleMenuClose}
                  className={({ isActive }) =>
                    `rounded-xl px-3 py-3 font-['Montserrat'] text-[0.95rem] font-semibold tracking-[0.04em] transition ${
                      isActive ? "bg-[#0f4d2e] text-white" : "text-[#24372d] hover:bg-[#f1faf3] hover:text-[#0f6b45]"
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </div>

            <div className="mt-3 border-t border-[#eef2ea] pt-3">
              <Link
                to={userRoute}
                onClick={handleMenuClose}
                className="inline-flex items-center gap-2 rounded-xl bg-[#0f4d2e] px-3 py-2.5 text-sm font-semibold text-white"
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
