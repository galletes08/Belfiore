import { useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { Menu, ShoppingCart, User, X } from "lucide-react";
import MobileNavigation from "./MobileNavigation";
import "./customerNavigation.css";
import CartSidebar from "./CartSidebar";
import logoImage from "../assets/Logo.png";
import { getCustomerUser, hasCustomerToken } from "../api/client";

const ANNOUNCEMENT_TEXT = "Free local delivery on eligible orders of PHP 2,000 or more";

const navItems = [
  { to: "/", label: "Home" },
  { to: "/products", label: "Products" },
  { to: "/about", label: "About Us" },
  { to: "/contact", label: "Contact" }
];

function NavigationLinks({ mobile = false, onNavigate }) {
  return navItems.map((item) => (
    <NavLink
      key={item.to}
      to={item.to}
      onClick={onNavigate}
      className={({ isActive }) =>
        mobile
          ? `rounded-xl px-3 py-3 font-['Montserrat'] text-[0.95rem] font-semibold tracking-[0.04em] transition ${
              isActive ? "bg-[#0f4d2e] text-white" : "text-[#24372d] hover:bg-[#f1faf3] hover:text-[#0f6b45]"
            }`
          : `relative rounded-full px-4 py-2.5 font-['Montserrat'] text-[0.95rem] font-semibold tracking-[0.04em] transition lg:px-5 lg:text-base ${
              isActive ? "text-[#0f6b45]" : "text-[#24372d] hover:bg-[#f1faf3] hover:text-[#0f6b45]"
            }`
      }
    >
      {({ isActive }) =>
        mobile ? item.label : (
          <span className="inline-block whitespace-nowrap">
            {item.label}
            <span
              className={`mx-auto mt-2 block h-0.5 w-8 origin-center rounded-full transition ${
                isActive ? "scale-100 bg-[#0f6b45]" : "scale-0 bg-transparent"
              }`}
            />
          </span>
        )
      }
    </NavLink>
  ));
}

export default function Navbar({
  cartItems = [],
  isCustomerLoggedIn,
  onIncreaseQty,
  onDecreaseQty,
  onRemoveItem,
  onCheckout
}) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);

  const navigate = useNavigate();
  const customerUser = getCustomerUser();
  const isLoggedIn = isCustomerLoggedIn ?? (
    typeof window !== "undefined" &&
    window.localStorage.getItem("isLoggedIn") === "true" &&
    hasCustomerToken() &&
    (customerUser?.role ?? "customer") === "customer"
  );
  const userRoute = isLoggedIn ? "/profile" : "/login";
  const userLabel = isLoggedIn ? "Profile" : "Login";
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
    <header className="sticky top-0 z-[1000] border-b border-[#dfe9dc] bg-white/95 font-['Montserrat'] shadow-[0_12px_30px_rgba(15,77,46,0.04)] backdrop-blur">
      <div className="customer-promo bg-[#0f4d2e] px-3 py-2 text-center text-white">
        <div className="customer-ticker" aria-hidden="true">
          <span>{ANNOUNCEMENT_TEXT}</span><span>{ANNOUNCEMENT_TEXT}</span>
        </div>
        <p className="customer-ticker-static">{ANNOUNCEMENT_TEXT}</p>
      </div>
      <nav className="customer-navigation mx-auto max-w-[1500px] px-3 py-3 lg:px-8 lg:py-4">
        <div className="flex items-center justify-between gap-2 lg:grid lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:gap-4">
          <Link to="/" className="customer-brand flex min-w-0 items-center gap-2 rounded-2xl lg:gap-3" onClick={handleMenuClose}>
            <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full bg-[#f1faf3] xl:h-16 xl:w-16">
              <img src={logoImage} alt="Belfiore Succulents PH logo" className="h-full w-full object-cover" />
            </span>
            <div className="min-w-0">
              <p className="whitespace-nowrap text-sm font-semibold tracking-[0.08em] text-[#0f6b45] lg:uppercase xl:tracking-[0.32em]">Belfiore</p>
              <p className="hidden whitespace-nowrap xl:block mt-1 font-['Playfair_Display'] text-2xl font-semibold leading-none text-[#173d2b]">Succulents PH</p>
            </div>
          </Link>

          <div className="hidden flex-1 items-center justify-center gap-1 lg:flex">
            <NavigationLinks />
          </div>

          <div className="flex shrink-0 items-center justify-end gap-0.5 sm:gap-2 lg:justify-self-end">
            <Link
              to={userRoute}
              className="grid h-11 w-11 place-items-center rounded-full text-[#10213b] transition hover:bg-[#f1faf3] hover:text-[#0f6b45] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-200 md:h-11 md:w-11"
              aria-label={userLabel}
              onClick={handleMenuClose}
            >
              <User className="h-5 w-5" strokeWidth={2.2} />
            </Link>

            {isLoggedIn && (
              <button
                onClick={handleCartClick}
                className="relative grid h-11 w-11 place-items-center rounded-full text-[#10213b] transition hover:bg-[#f1faf3] hover:text-[#0f6b45] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-200 md:h-11 md:w-11"
                aria-label="Open cart"
                data-cart-target
              >
                <ShoppingCart className="h-5 w-5" strokeWidth={2.2} />
                {cartItemCount > 0 && (
                  <span className="absolute right-0.5 top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[#0f6b45] px-1 text-[10px] font-semibold text-white">
                    {cartItemCount}
                  </span>
                )}
              </button>
            )}

            <button
              onClick={() => setIsMenuOpen((previous) => !previous)}
              className="grid h-11 w-11 place-items-center rounded-full text-[#10213b] transition hover:bg-[#f1faf3] hover:text-[#0f6b45] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-200 lg:hidden"
              aria-label={isMenuOpen ? "Close navigation menu" : "Open navigation menu"}
              aria-expanded={isMenuOpen}
              aria-controls="mobile-navigation"
            >
              {isMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {isMenuOpen && <MobileNavigation onClose={handleMenuClose} isLoggedIn={isLoggedIn}>
          <NavigationLinks mobile onNavigate={handleMenuClose} />
        </MobileNavigation>}

        {isLoggedIn && cartOpen && (
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
