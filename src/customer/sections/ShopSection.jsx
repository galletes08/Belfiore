import { getImageUrl } from '../../api/client';

export default function ShopSection({ products, status, error, onAddToCart, formatPrice }) {
  const featuredProducts = products.slice(0, 6);

  return (
    <section className="max-w-6xl mx-auto px-6 py-12" id="shop">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-[#5e6f65] font-['Montserrat']">Shop All</p>
          <h2 className="mt-3 text-3xl sm:text-4xl font-['Playfair_Display'] text-[#0f4d2e]">
            Fresh picks from the greenhouse
          </h2>
          <p className="mt-3 max-w-xl text-sm sm:text-base text-[#5e6f65]">
            Hand-selected succulents and planters delivered across Laguna and nearby cities. Add your favorites to cart and we
            will handle the rest.
          </p>
        </div>
        <div className="rounded-full border border-[#d8dfd3] px-5 py-2 text-xs uppercase tracking-[0.3em] text-[#5e6f65]">
          {products.length} products in stock
        </div>
      </div>

      <div className="mt-10">
        {status === 'loading' ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, idx) => (
              <div key={idx} className="animate-pulse rounded-2xl border border-[#e1e7dc] bg-white p-6">
                <div className="h-40 rounded-xl bg-[#eef2ea]" />
                <div className="mt-4 h-4 w-3/4 rounded bg-[#eef2ea]" />
                <div className="mt-2 h-3 w-1/2 rounded bg-[#eef2ea]" />
                <div className="mt-6 h-10 rounded-full bg-[#eef2ea]" />
              </div>
            ))}
          </div>
        ) : null}

        {status === 'error' ? (
          <div className="rounded-2xl border border-[#e1e7dc] bg-white p-6 text-sm text-[#8b4a4a]">
            {error || 'Unable to load products right now.'}
          </div>
        ) : null}

        {status === 'success' && featuredProducts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#c7d0c3] bg-white p-10 text-center text-sm text-[#5e6f65]">
            No products yet. Add a product in the admin inventory to make it appear here.
          </div>
        ) : null}

        {status === 'success' && featuredProducts.length > 0 ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {featuredProducts.map((product) => {
              const imageSrc = getImageUrl(product.imageUrl);
              return (
                <article key={product.id} className="rounded-2xl border border-[#e1e7dc] bg-white p-6 shadow-[0_20px_40px_rgba(15,77,46,0.08)]">
                  <div className="relative h-48 w-full overflow-hidden rounded-xl bg-[#eef2ea]">
                    {imageSrc ? (
                      <img src={imageSrc} alt={product.name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="h-full w-full bg-gradient-to-br from-[#e9efe6] via-[#f4f6f0] to-[#dce5d9] flex items-center justify-center text-xs uppercase tracking-[0.35em] text-[#7a8a7f]">
                        Belfiore
                      </div>
                    )}
                    {product.tag ? (
                      <span className="absolute left-4 top-4 rounded-full bg-white/90 px-3 py-1 text-[10px] uppercase tracking-[0.3em] text-[#0f4d2e]">
                        {product.tag}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-5">
                    <h3 className="text-lg font-['Playfair_Display'] text-[#0f4d2e]">{product.name}</h3>
                    <p className="mt-1 max-h-10 overflow-hidden text-sm text-[#5e6f65]">
                      {product.description || 'Lush, low maintenance, and ready for a bright corner.'}
                    </p>
                    <div className="mt-4 flex items-center justify-between">
                      <span className="text-base font-semibold text-[#0f4d2e]">{formatPrice(product.price)}</span>
                      <span className="text-xs uppercase tracking-[0.25em] text-[#7a8a7f]">{product.stock} in stock</span>
                    </div>
                    <button
                      className="mt-5 w-full rounded-full border border-[#0b7a3c] bg-[#0b7a3c] py-3 text-xs uppercase tracking-[0.35em] text-white transition hover:bg-[#0d6a35]"
                      onClick={() => onAddToCart(product)}
                      type="button"
                    >
                      Add to cart
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : null}
      </div>
    </section>
  );
}
