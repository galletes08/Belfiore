import { useEffect, useState } from "react";
import { Gift, X } from "lucide-react";
import { Link } from "react-router-dom";

const PROMO_STORAGE_KEY = "belfiore-signup-promo-seen";

export default function NewVisitorSignup() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const hasSeenPromo = localStorage.getItem(PROMO_STORAGE_KEY) === "true";
    const isSignedIn =
      localStorage.getItem("isLoggedIn") === "true" ||
      Boolean(localStorage.getItem("customerToken"));

    if (hasSeenPromo || isSignedIn) return undefined;

    const showTimer = window.setTimeout(() => setIsVisible(true), 900);
    return () => window.clearTimeout(showTimer);
  }, []);

  const closePromo = () => {
    localStorage.setItem(PROMO_STORAGE_KEY, "true");
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <aside
      className="fixed right-4 bottom-4 left-4 z-60 grid max-w-[23rem] grid-cols-[auto_1fr] gap-3.5 overflow-hidden rounded-2xl border border-emerald-200 bg-[#fffef9] p-5 pr-11 text-[#173d2b] shadow-[0_20px_55px_rgba(20,63,38,0.2)] sm:right-auto sm:left-5"
      aria-label="Free shipping sign-up offer"
      aria-live="polite"
    >
      <button
        type="button"
        className="absolute top-2.5 right-2.5 grid h-8 w-8 cursor-pointer place-items-center rounded-full text-[#466052] transition hover:bg-emerald-50 hover:text-[#0b7a3c] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-emerald-700/30"
        onClick={closePromo}
        aria-label="Close free shipping offer"
      >
        <X size={18} strokeWidth={2.25} aria-hidden="true" />
      </button>

      <div className="grid h-11 w-11 place-items-center rounded-xl bg-[#0b7a3c] text-white shadow-lg shadow-emerald-900/20" aria-hidden="true">
        <Gift size={24} strokeWidth={1.9} />
      </div>

      <div>
        <p className="mb-1 text-[0.68rem] font-extrabold tracking-[0.16em] text-[#0b7a3c] uppercase">Welcome to Belfiore</p>
        <h2 className="font-serif text-[1.35rem] leading-tight text-[#173d2b]">Sign up now for free shipping</h2>
        <p className="mt-2 mb-3.5 max-w-68 text-sm leading-6 text-[#526158]">Create your account today and enjoy free shipping on your order.</p>
        <Link
          to="/signup"
          className="inline-flex min-h-10 items-center justify-center rounded-full bg-[#0b7a3c] px-4 py-2.5 text-xs font-extrabold tracking-[0.08em] text-white uppercase transition hover:-translate-y-px hover:bg-[#075f2f] focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-emerald-700/30"
          onClick={closePromo}
        >
          Sign up now
        </Link>
      </div>
    </aside>
  );
}