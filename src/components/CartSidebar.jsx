import { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { Leaf, Minus, Plus, ShoppingBag, Trash2, X } from "lucide-react";

const formatPhp = (amount) =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 0
  }).format(amount);

export default function CartSidebar({
  cartItems,
  onClose,
  onShopAll,
  onCheckout,
  onIncreaseQty,
  onDecreaseQty,
  onRemoveItem
}) {
  const portalTarget = typeof document !== "undefined" ? document.body : null;
  const itemCount = cartItems.reduce((sum, item) => sum + item.qty, 0);
  const subtotal = cartItems.reduce((sum, item) => sum + item.price * item.qty, 0);
  const shippingFee = cartItems.length === 0 || subtotal >= 2000 ? 0 : 120;
  const total = subtotal + shippingFee;
  const amountToFreeShipping = Math.max(0, 2000 - subtotal);
  const resolveItemImage = (item) => item.image || item.imageUrl || null;

  useEffect(() => {
    if (!portalTarget) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    const previousTouchAction = document.body.style.touchAction;

    document.body.style.overflow = "hidden";
    document.body.style.touchAction = "none";

    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.touchAction = previousTouchAction;
    };
  }, [portalTarget]);

  const sidebar = useMemo(
    () => (
      <div className="fixed inset-0 z-[130] bg-transparent" onClick={onClose}>
      <aside
        className="absolute inset-x-0 bottom-0 flex h-[min(100dvh,100svh)] w-full flex-col overflow-hidden rounded-t-[2rem] bg-[#f4f8f4] shadow-[0_-18px_60px_rgba(15,23,42,0.18)] sm:inset-x-auto sm:bottom-auto sm:right-3 sm:top-3 sm:h-[calc(100vh-1.5rem)] sm:max-h-[calc(100vh-1.5rem)] sm:w-[25.5rem] sm:rounded-[2rem] sm:border sm:border-white/70 sm:shadow-[0_18px_60px_rgba(15,23,42,0.18)]"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Shopping cart"
      >
        <div className="shrink-0 bg-[radial-gradient(circle_at_top_left,_rgba(167,243,208,0.55),_transparent_38%),linear-gradient(135deg,#064e3b_0%,#047857_52%,#10b981_100%)] px-4 pb-4 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-6 sm:pb-5 sm:pt-6">
          <div className="mx-auto mb-3 h-1.5 w-14 rounded-full bg-white/35 sm:hidden" />
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-100/90">Your Cart</p>
              <h2 className="mt-2 text-xl font-bold text-white sm:text-2xl">Ready to checkout</h2>
              <p className="mt-1 text-sm text-emerald-50/85">
                {itemCount === 0 ? "No items yet" : `${itemCount} item${itemCount === 1 ? "" : "s"} selected`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold text-white/90">
                <ShoppingBag size={14} className="mr-1.5" />
                {formatPhp(total)}
              </div>
              <button
                className="rounded-full bg-white/12 p-2.5 text-white/90 transition hover:bg-white/20 hover:text-white"
                onClick={onClose}
                aria-label="Close cart"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-white/15 bg-white/12 p-3 backdrop-blur-sm sm:mt-5">
            <div className="flex items-center justify-between text-sm text-white">
              <span className="text-emerald-50/80">Subtotal</span>
              <span className="font-semibold">{formatPhp(subtotal)}</span>
            </div>
            <div className="mt-2 flex items-center justify-between text-sm text-white">
              <span className="text-emerald-50/80">Shipping</span>
              <span className="font-semibold">{shippingFee === 0 ? "Free" : formatPhp(shippingFee)}</span>
            </div>
            <div className="mt-3 rounded-xl bg-white/95 px-3 py-2 text-sm font-semibold text-emerald-900">
              {cartItems.length === 0
                ? "Add a succulent to start your order."
                : amountToFreeShipping > 0
                  ? `${formatPhp(amountToFreeShipping)} away from free shipping`
                  : "You unlocked free shipping."}
            </div>
          </div>
        </div>

        {cartItems.length === 0 ? (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              <Leaf size={34} />
            </div>
            <p className="mt-5 text-lg font-semibold text-gray-900">Your cart is empty</p>
            <p className="mt-2 max-w-xs text-sm leading-6 text-gray-500">
              Add a few plants and we&apos;ll keep the summary, shipping, and totals here.
            </p>
          </div>
        ) : (
          <ul className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
            {cartItems.map((item) => (
              <li
                key={item.id}
                className="rounded-2xl border border-[#d8e4da] bg-white p-3.5 shadow-[0_16px_34px_rgba(15,23,42,0.06)]"
              >
                <div className="flex gap-3">
                  {resolveItemImage(item) ? (
                    <img src={resolveItemImage(item)} alt={item.name} className="h-16 w-16 rounded-2xl object-cover sm:h-20 sm:w-20" />
                  ) : (
                    <div className="h-16 w-16 rounded-2xl bg-[#eef2ea] sm:h-20 sm:w-20" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-gray-900">{item.name}</p>
                        <p className="mt-1 text-sm text-gray-500">{formatPhp(item.price)} each</p>
                      </div>
                      <button
                        onClick={() => onRemoveItem?.(item.id)}
                        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rose-50 text-rose-600 transition hover:bg-rose-100 hover:text-rose-700"
                        aria-label={`Remove ${item.name} from cart`}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>

                    <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="inline-flex w-fit items-center rounded-full border border-[#d7e2da] bg-[#f7faf7] p-1">
                        <button
                          onClick={() => onDecreaseQty?.(item.id)}
                          className="rounded-full p-2 text-gray-600 transition hover:bg-white"
                          aria-label={`Decrease quantity of ${item.name}`}
                        >
                          <Minus size={14} />
                        </button>
                        <span className="min-w-8 px-2 text-center text-sm font-semibold text-gray-900">{item.qty}</span>
                        <button
                          onClick={() => onIncreaseQty?.(item.id)}
                          className="rounded-full bg-emerald-700 p-2 text-white transition hover:bg-emerald-800"
                          aria-label={`Increase quantity of ${item.name}`}
                        >
                          <Plus size={14} />
                        </button>
                      </div>

                      <div className="text-left sm:text-right">
                        <p className="text-xs font-medium uppercase tracking-[0.16em] text-gray-400">Line Total</p>
                        <p className="mt-1 text-base font-bold text-gray-900">{formatPhp(item.price * item.qty)}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="shrink-0 border-t border-[#d8e4da] bg-white px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-[0_-18px_38px_rgba(15,23,42,0.08)] sm:px-6 sm:pb-4">
          <div className="rounded-2xl bg-[#f6faf7] p-4">
            <div className="flex items-center justify-between text-sm text-gray-500">
              <p>Subtotal</p>
              <p className="font-semibold text-gray-800">{formatPhp(subtotal)}</p>
            </div>
            <div className="mt-2 flex items-center justify-between text-sm text-gray-500">
              <p>Shipping</p>
              <p className="font-semibold text-gray-800">{shippingFee === 0 ? "Free" : formatPhp(shippingFee)}</p>
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-[#d8e4da] pt-3">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-gray-500">Total</p>
              <p className="text-2xl font-bold text-gray-900">{formatPhp(total)}</p>
            </div>
          </div>

          <button
            className="mt-4 w-full rounded-2xl bg-gray-900 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-gray-300"
            onClick={onCheckout}
            disabled={cartItems.length === 0}
          >
            Checkout
          </button>
          <button
            className="mt-2 w-full rounded-2xl border border-[#d8e4da] py-3 text-sm font-semibold text-gray-700 transition hover:bg-[#f7faf7]"
            onClick={onShopAll}
          >
            Shop All
          </button>
        </div>
      </aside>
      </div>
    ),
    [amountToFreeShipping, cartItems, itemCount, onCheckout, onClose, onDecreaseQty, onIncreaseQty, onRemoveItem, onShopAll, shippingFee, subtotal, total]
  );

  if (!portalTarget) {
    return null;
  }

  return createPortal(sidebar, portalTarget);
}
