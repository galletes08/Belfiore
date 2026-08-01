import { useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import {
  Check,
  Leaf,
  Minus,
  Plus,
  ShoppingBag,
  Trash2,
  X
} from "lucide-react";

const FREE_SHIPPING_THRESHOLD = 2000;
const STANDARD_SHIPPING_FEE = 120;

const formatPhp = (amount) =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0
  }).format(amount);

export default function CartSidebar({
  cartItems = [],
  onClose,
  onShopAll,
  onCheckout,
  onIncreaseQty,
  onDecreaseQty,
  onRemoveItem
}) {
  const closeButtonRef = useRef(null);

  const portalTarget =
    typeof document !== "undefined" ? document.body : null;

  const { itemCount, subtotal } = useMemo(() => {
    return cartItems.reduce(
      (summary, item) => ({
        itemCount: summary.itemCount + item.qty,
        subtotal: summary.subtotal + item.price * item.qty
      }),
      {
        itemCount: 0,
        subtotal: 0
      }
    );
  }, [cartItems]);

  const hasItems = cartItems.length > 0;

  const shippingFee =
    !hasItems || subtotal >= FREE_SHIPPING_THRESHOLD
      ? 0
      : STANDARD_SHIPPING_FEE;

  const total = subtotal + shippingFee;

  const amountToFreeShipping = Math.max(
    0,
    FREE_SHIPPING_THRESHOLD - subtotal
  );

  const shippingProgress = Math.min(
    100,
    (subtotal / FREE_SHIPPING_THRESHOLD) * 100
  );

  useEffect(() => {
    if (!portalTarget) return undefined;

    const previousActiveElement = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    const previousTouchAction = document.body.style.touchAction;

    document.body.style.overflow = "hidden";
    document.body.style.touchAction = "none";

    closeButtonRef.current?.focus();

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose?.();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.touchAction = previousTouchAction;
      document.removeEventListener("keydown", handleKeyDown);

      if (previousActiveElement instanceof HTMLElement) {
        previousActiveElement.focus();
      }
    };
  }, [onClose, portalTarget]);

  if (!portalTarget) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[130] bg-slate-950/40 backdrop-blur-[2px]"
      onClick={onClose}
      role="presentation"
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="cart-title"
        onClick={(event) => event.stopPropagation()}
        className="
          absolute bottom-0 left-0 right-0
          flex max-h-[94dvh] min-h-[70dvh] flex-col
          overflow-hidden rounded-t-[1.75rem] bg-[#f8faf8]
          shadow-[0_-20px_70px_rgba(15,23,42,0.24)]

          sm:bottom-3 sm:left-auto sm:right-3 sm:top-3
          sm:h-[calc(100dvh-1.5rem)] sm:max-h-none sm:min-h-0
          sm:w-[26rem] sm:rounded-[1.75rem]
          sm:border sm:border-white/80
          sm:shadow-[0_24px_80px_rgba(15,23,42,0.22)]
        "
      >
        <div className="shrink-0 border-b border-emerald-950/5 bg-white">
          <div className="mx-auto mt-2 h-1.5 w-12 rounded-full bg-slate-200 sm:hidden" />

          <div className="flex items-center justify-between gap-4 px-5 pb-4 pt-4 sm:px-6 sm:pt-6">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-950 text-white shadow-sm">
                <ShoppingBag size={20} strokeWidth={2} />
              </div>

              <div className="min-w-0">
                <h2
                  id="cart-title"
                  className="text-lg font-bold tracking-tight text-slate-950"
                >
                  Shopping cart
                </h2>

                <p className="mt-0.5 text-sm text-slate-500">
                  {itemCount === 0
                    ? "Your cart is currently empty"
                    : `${itemCount} item${itemCount === 1 ? "" : "s"} in your cart`}
                </p>
              </div>
            </div>

            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              aria-label="Close shopping cart"
              className="
                inline-flex h-10 w-10 shrink-0 items-center justify-center
                rounded-full border border-slate-200 bg-white text-slate-600
                transition hover:border-slate-300 hover:bg-slate-50
                hover:text-slate-950 focus:outline-none focus:ring-2
                focus:ring-emerald-700 focus:ring-offset-2
              "
            >
              <X size={18} />
            </button>
          </div>

          {hasItems && (
            <div className="px-5 pb-5 sm:px-6">
              <div className="rounded-2xl bg-emerald-950 p-4 text-white">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10">
                    {amountToFreeShipping === 0 ? (
                      <Check size={16} />
                    ) : (
                      <Leaf size={16} />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold">
                        {amountToFreeShipping === 0
                          ? "Free shipping unlocked"
                          : "Free shipping progress"}
                      </p>

                      <span className="shrink-0 text-xs font-medium text-emerald-100">
                        {Math.round(shippingProgress)}%
                      </span>
                    </div>

                    <p className="mt-1 text-xs leading-5 text-emerald-100/80">
                      {amountToFreeShipping === 0
                        ? "Your order qualifies for free standard shipping."
                        : `Add ${formatPhp(
                            amountToFreeShipping
                          )} more to remove the shipping fee.`}
                    </p>

                    <div
                      className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/15"
                      role="progressbar"
                      aria-label="Free shipping progress"
                      aria-valuemin={0}
                      aria-valuemax={FREE_SHIPPING_THRESHOLD}
                      aria-valuenow={Math.min(
                        subtotal,
                        FREE_SHIPPING_THRESHOLD
                      )}
                    >
                      <div
                        className="h-full rounded-full bg-emerald-300 transition-[width] duration-300"
                        style={{ width: `${shippingProgress}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {hasItems ? (
          <ul className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4 sm:px-5">
            {cartItems.map((item) => {
              const image = item.image || item.imageUrl;
              const lineTotal = item.price * item.qty;

              return (
                <li
                  key={item.id}
                  className="
                    rounded-2xl border border-slate-200/80 bg-white p-3
                    shadow-[0_8px_24px_rgba(15,23,42,0.04)]
                    transition hover:border-slate-300
                  "
                >
                  <div className="flex gap-3">
                    <div className="h-[5.25rem] w-[5.25rem] shrink-0 overflow-hidden rounded-xl bg-emerald-50">
                      {image ? (
                        <img
                          src={image}
                          alt={item.name}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-emerald-700">
                          <Leaf size={24} />
                        </div>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="line-clamp-2 text-sm font-semibold leading-5 text-slate-900">
                            {item.name}
                          </h3>

                          <p className="mt-1 text-xs text-slate-500">
                            {formatPhp(item.price)} per item
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => onRemoveItem?.(item.id)}
                          aria-label={`Remove ${item.name} from cart`}
                          className="
                            inline-flex h-8 w-8 shrink-0 items-center justify-center
                            rounded-full text-slate-400 transition
                            hover:bg-rose-50 hover:text-rose-600
                            focus:outline-none focus:ring-2 focus:ring-rose-500
                          "
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>

                      <div className="mt-3 flex items-end justify-between gap-3">
                        <div className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 p-1">
                          <button
                            type="button"
                            onClick={() => onDecreaseQty?.(item.id)}
                            aria-label={`Decrease quantity of ${item.name}`}
                            className="
                              inline-flex h-7 w-7 items-center justify-center
                              rounded-full text-slate-600 transition
                              hover:bg-white hover:text-slate-950
                              focus:outline-none focus:ring-2
                              focus:ring-emerald-700
                            "
                          >
                            <Minus size={13} />
                          </button>

                          <span
                            className="min-w-8 px-1 text-center text-sm font-semibold text-slate-900"
                            aria-label={`Quantity: ${item.qty}`}
                          >
                            {item.qty}
                          </span>

                          <button
                            type="button"
                            onClick={() => onIncreaseQty?.(item.id)}
                            aria-label={`Increase quantity of ${item.name}`}
                            className="
                              inline-flex h-7 w-7 items-center justify-center
                              rounded-full bg-emerald-950 text-white transition
                              hover:bg-emerald-800 focus:outline-none
                              focus:ring-2 focus:ring-emerald-700
                              focus:ring-offset-1
                            "
                          >
                            <Plus size={13} />
                          </button>
                        </div>

                        <p className="text-sm font-bold text-slate-950">
                          {formatPhp(lineTotal)}
                        </p>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-8 py-12 text-center">
            <div className="relative">
              <div className="flex h-24 w-24 items-center justify-center rounded-full bg-emerald-100 text-emerald-800">
                <Leaf size={36} strokeWidth={1.8} />
              </div>

              <div className="absolute -bottom-1 -right-1 flex h-9 w-9 items-center justify-center rounded-full border-4 border-[#f8faf8] bg-emerald-950 text-white">
                <ShoppingBag size={15} />
              </div>
            </div>

            <h3 className="mt-6 text-xl font-bold tracking-tight text-slate-950">
              Your cart is empty
            </h3>

            <p className="mt-2 max-w-[17rem] text-sm leading-6 text-slate-500">
              Explore the collection and add your favorite plants to begin
              your order.
            </p>

            <button
              type="button"
              onClick={onShopAll}
              className="
                mt-6 inline-flex items-center justify-center rounded-xl
                bg-emerald-950 px-5 py-3 text-sm font-semibold text-white
                transition hover:bg-emerald-800 focus:outline-none
                focus:ring-2 focus:ring-emerald-700 focus:ring-offset-2
              "
            >
              Browse plants
            </button>
          </div>
        )}

        {hasItems && (
          <footer className="shrink-0 border-t border-slate-200 bg-white px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-4 sm:px-6 sm:pb-5">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">Subtotal</span>
                <span className="font-medium text-slate-800">
                  {formatPhp(subtotal)}
                </span>
              </div>

              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">Shipping</span>
                <span
                  className={
                    shippingFee === 0
                      ? "font-semibold text-emerald-700"
                      : "font-medium text-slate-800"
                  }
                >
                  {shippingFee === 0
                    ? "Free"
                    : formatPhp(shippingFee)}
                </span>
              </div>

              <div className="flex items-end justify-between border-t border-slate-200 pt-3">
                <div>
                  <p className="text-sm font-semibold text-slate-950">
                    Order total
                  </p>
                  <p className="mt-0.5 text-xs text-slate-400">
                    Taxes included where applicable
                  </p>
                </div>

                <p className="text-2xl font-bold tracking-tight text-slate-950">
                  {formatPhp(total)}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onCheckout}
              className="
                mt-4 inline-flex w-full items-center justify-center gap-2
                rounded-xl bg-emerald-950 px-4 py-3.5
                text-sm font-semibold text-white shadow-sm transition
                hover:bg-emerald-800 focus:outline-none focus:ring-2
                focus:ring-emerald-700 focus:ring-offset-2
              "
            >
              Proceed to checkout
              <span aria-hidden="true">→</span>
            </button>

            <button
              type="button"
              onClick={onShopAll}
              className="
                mt-2 w-full rounded-xl px-4 py-3
                text-sm font-semibold text-slate-600 transition
                hover:bg-slate-50 hover:text-slate-950
                focus:outline-none focus:ring-2
                focus:ring-slate-300
              "
            >
              Continue shopping
            </button>
          </footer>
        )}
      </aside>
    </div>,
    portalTarget
  );
}