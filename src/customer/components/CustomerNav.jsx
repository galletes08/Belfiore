import { Link, NavLink } from 'react-router-dom';
import { getImageUrl } from '../../api/client';
import { formatPrice } from '../context/CustomerStore';

function navClass({ isActive }) {
  return `border-b pb-2 ${isActive ? 'border-[#0f4d2e]' : 'border-transparent hover:border-[#0f4d2e]'}`;
}

export default function CustomerNav({ cartCount, cartItems }) {
  const previewItems = cartItems.slice(0, 3);
  const previewTotal = cartItems.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.qty || 0), 0);

  return (
    <header className="max-w-6xl mx-auto px-6 pt-10 pb-6">
      <div className="flex items-center justify-between gap-4">
        <div className="text-[#0f4d2e] tracking-[0.25em] text-xs uppercase font-['Montserrat']">
          Belfiore
        </div>
        <h1 className="m-0 text-center text-3xl sm:text-4xl md:text-5xl font-['Playfair_Display'] text-[#0f4d2e]">
          Belfiore Succulents PH
        </h1>
        <div className="flex items-center gap-5 text-[#1c3b2e]">
          <button className="rounded-full p-2 hover:bg-[#e7eee6]" aria-label="Search">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" />
            </svg>
          </button>
          <Link to="/profile" className="rounded-full p-2 hover:bg-[#e7eee6] block" aria-label="Account">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 20c2.5-4 13.5-4 16 0" />
            </svg>
          </Link>
          <div className="group/cart">
            <Link className="relative rounded-full p-2 hover:bg-[#e7eee6] block" aria-label="Cart" to="/cart">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="9" cy="20" r="1" />
                <circle cx="17" cy="20" r="1" />
                <path d="M3 4h2l2.5 11h9.5l2-8H7" />
              </svg>
              {cartCount > 0 ? (
                <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-[#0b7a3c] text-[10px] font-bold text-white flex items-center justify-center">
                  {cartCount}
                </span>
              ) : null}
            </Link>

            <aside className="fixed right-0 top-0 h-full w-72 bg-white border-l border-[#d8dfd3] shadow-[-20px_0_45px_rgba(15,77,46,0.08)] p-5 opacity-0 translate-x-full pointer-events-none transition-all duration-200 group-hover/cart:opacity-100 group-hover/cart:translate-x-0 group-hover/cart:pointer-events-auto z-30">
              <p className="text-xs uppercase tracking-[0.3em] text-[#5e6f65] font-['Montserrat']">Quick Cart</p>
              <h3 className="mt-2 text-xl font-['Playfair_Display'] text-[#0f4d2e]">Your items</h3>

              <div className="mt-5 space-y-3">
                {previewItems.length === 0 ? (
                  <p className="text-sm text-[#5e6f65]">Your cart is empty.</p>
                ) : (
                  previewItems.map((item) => {
                    const imageSrc = getImageUrl(item.imageUrl);
                    return (
                      <div key={item.id} className="flex gap-3 rounded-xl border border-[#e1e7dc] p-3">
                        <div className="h-12 w-12 overflow-hidden rounded-lg bg-[#eef2ea]">
                          {imageSrc ? (
                            <img src={imageSrc} alt={item.name} className="h-full w-full object-cover" />
                          ) : null}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-[#0f4d2e] truncate">{item.name}</p>
                          <p className="text-xs text-[#5e6f65]">
                            {item.qty} x {formatPrice(item.price)}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="mt-6 border-t border-[#e1e7dc] pt-4">
                <div className="flex items-center justify-between text-sm text-[#5e6f65]">
                  <span>Total</span>
                  <span className="font-semibold text-[#0f4d2e]">{formatPrice(previewTotal)}</span>
                </div>
                <Link
                  to="/cart"
                  className="mt-4 w-full inline-flex items-center justify-center rounded-full border border-[#0b7a3c] bg-[#0b7a3c] py-3 text-xs uppercase tracking-[0.35em] text-white transition hover:bg-[#0d6a35]"
                >
                  Go to cart
                </Link>
              </div>
            </aside>
          </div>
        </div>
      </div>

      <nav className="mt-8 flex flex-wrap items-center justify-center gap-10 text-xs sm:text-sm uppercase tracking-[0.35em] text-[#0f4d2e] font-['Montserrat']">
        <NavLink className={navClass} to="/">
          Home
        </NavLink>
        <NavLink className={navClass} to="/shop">
          Shop All
        </NavLink>
        <NavLink className={navClass} to="/about">
          About Us
        </NavLink>
        <NavLink className={navClass} to="/contact">
          Contact
        </NavLink>
        <NavLink className={navClass} to="/profile">
          Profile
        </NavLink>
      </nav>
    </header>
  );
}
