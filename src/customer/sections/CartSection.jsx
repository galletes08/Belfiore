import { getImageUrl } from '../../api/client';

export default function CartSection({ items, onIncrease, onDecrease, onRemove, onCheckout, formatPrice, total }) {
  return (
    <section className="max-w-6xl mx-auto px-6 py-12" id="cart">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-[#5e6f65] font-['Montserrat']">Your Cart</p>
          <h2 className="mt-3 text-3xl sm:text-4xl font-['Playfair_Display'] text-[#0f4d2e]">
            Items you added
          </h2>
        </div>
        <div className="rounded-full border border-[#d8dfd3] px-5 py-2 text-xs uppercase tracking-[0.3em] text-[#5e6f65]">
          {items.length} items
        </div>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-4">
          {items.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#c7d0c3] bg-white p-10 text-center text-sm text-[#5e6f65]">
              Your cart is empty. Add a plant from the shop to see it here.
            </div>
          ) : null}

          {items.map((item) => {
            const imageSrc = getImageUrl(item.imageUrl);
            return (
              <div key={item.id} className="flex flex-col sm:flex-row gap-4 rounded-2xl border border-[#e1e7dc] bg-white p-5">
                <div className="h-24 w-full sm:w-28 overflow-hidden rounded-xl bg-[#eef2ea]">
                  {imageSrc ? (
                    <img src={imageSrc} alt={item.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="h-full w-full bg-gradient-to-br from-[#e9efe6] via-[#f4f6f0] to-[#dce5d9]" />
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-base font-semibold text-[#0f4d2e]">{item.name}</p>
                      <p className="text-sm text-[#5e6f65]">{formatPrice(item.price)}</p>
                    </div>
                    <button className="text-xs uppercase tracking-[0.2em] text-[#8b4a4a]" onClick={() => onRemove(item.id)} type="button">
                      Remove
                    </button>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2 rounded-full border border-[#d8dfd3] px-3 py-1 text-sm">
                      <button className="h-6 w-6 rounded-full bg-[#eef2ea]" onClick={() => onDecrease(item.id)} type="button">
                        -
                      </button>
                      <span className="w-6 text-center">{item.qty}</span>
                      <button className="h-6 w-6 rounded-full bg-[#eef2ea]" onClick={() => onIncrease(item.id)} type="button">
                        +
                      </button>
                    </div>
                    <span className="text-sm text-[#5e6f65]">
                      Subtotal: {formatPrice(item.price * item.qty)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <aside className="rounded-2xl border border-[#e1e7dc] bg-white p-6 h-fit">
          <h3 className="text-lg font-['Playfair_Display'] text-[#0f4d2e]">Summary</h3>
          <div className="mt-4 flex items-center justify-between text-sm text-[#5e6f65]">
            <span>Total items</span>
            <span>{items.reduce((count, item) => count + item.qty, 0)}</span>
          </div>
          <div className="mt-2 flex items-center justify-between text-sm text-[#5e6f65]">
            <span>Total</span>
            <span className="text-base font-semibold text-[#0f4d2e]">{formatPrice(total)}</span>
          </div>
          <button
            className="mt-6 w-full rounded-full border border-[#0b7a3c] bg-[#0b7a3c] py-3 text-xs uppercase tracking-[0.35em] text-white transition hover:bg-[#0d6a35] disabled:cursor-not-allowed disabled:border-[#95a29b] disabled:bg-[#95a29b]"
            type="button"
            onClick={onCheckout}
            disabled={items.length === 0}
          >
            Proceed to checkout
          </button>
        </aside>
      </div>
    </section>
  );
}
