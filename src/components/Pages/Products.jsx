import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Search, ShoppingCart, SlidersHorizontal, Sprout } from "lucide-react";
import { apiProducts, getImageUrl } from "../../api/client";
import awardImage from "../../assets/Award.jpg";
import blogImage from "../../assets/Blog.png";
import plantsImage from "../../assets/Plants.jpg";

const tagTabs = [
  { key: "all", label: "All" },
  { key: "white", label: "White Tags" },
  { key: "green", label: "Green Tags" },
  { key: "red", label: "Red Tags" },
  { key: "aquaponics", label: "Aquaponics" }
];

const sortOptions = [
  { value: "featured", label: "Featured" },
  { value: "name-asc", label: "Name A-Z" },
  { value: "name-desc", label: "Name Z-A" },
  { value: "price-low", label: "Price Low-High" },
  { value: "price-high", label: "Price High-Low" },
  { value: "stock-high", label: "Stock High-Low" }
];

const badgeStyles = {
  white: "bg-gray-100 text-gray-700 ring-gray-200",
  green: "bg-emerald-100 text-emerald-700 ring-emerald-200",
  red: "bg-rose-100 text-rose-700 ring-rose-200",
  aquaponics: "bg-amber-100 text-amber-700 ring-amber-200"
};

const cardImages = [plantsImage, awardImage, blogImage, plantsImage];

const formatPhp = (amount) =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 0
  }).format(amount);

const getPriceNumber = (value) => {
  if (typeof value === "number") return value;
  return Number(String(value).replace(/[^\d.]/g, ""));
};

const AQUAPONICS_TAG = "aquaponics";

const normalizeTag = (tag, category) => {
  const normalizedTag = String(tag || "").trim().toLowerCase();
  const normalizedCategory = String(category || "").trim().toLowerCase();

  if (["white", "green", "red"].includes(normalizedTag)) return normalizedTag;
  if ([AQUAPONICS_TAG, "others"].includes(normalizedTag)) return AQUAPONICS_TAG;
  if (normalizedCategory === AQUAPONICS_TAG) return AQUAPONICS_TAG;
  return AQUAPONICS_TAG;
};

const getDisplayTag = (tag, category) => {
  const normalizedTag = String(tag || "").trim().toLowerCase();
  const normalizedCategory = String(category || "").trim().toLowerCase();

  if (normalizedTag === "others") return "Aquaponics";
  if (!normalizedTag && normalizedCategory === AQUAPONICS_TAG) return "Aquaponics";
  return tag || category || "Plant";
};

export default function Products({ onAddToCart }) {
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [activeTag, setActiveTag] = useState("all");
  const [searchValue, setSearchValue] = useState("");
  const [sortBy, setSortBy] = useState("featured");

  useEffect(() => {
    let ignore = false;

    const loadProducts = async () => {
      setLoading(true);
      setLoadError("");
      try {
        const data = await apiProducts();
        if (ignore) return;
        setProducts(Array.isArray(data) ? data : []);
      } catch (error) {
        if (ignore) return;
        setLoadError(error.message || "Failed to load products");
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    };

    loadProducts();

    return () => {
      ignore = true;
    };
  }, []);

  const filteredProducts = useMemo(() => {
    const keyword = searchValue.trim().toLowerCase();
    const mappedProducts = products.map((item, index) => ({
      ...item,
      note: item.description || `${item.category || "Plant"} item`,
      tagKey: normalizeTag(item.tag, item.category),
      image: getImageUrl(item.imageUrl) || cardImages[index % cardImages.length]
    }));

    const baseList = mappedProducts.filter((item) => {
      const passTag = activeTag === "all" || item.tagKey === activeTag;
      if (!passTag) return false;
      if (!keyword) return true;
      return `${item.name} ${item.tag} ${item.category} ${item.note}`.toLowerCase().includes(keyword);
    });

    const list = [...baseList];

    if (sortBy === "name-asc") list.sort((a, b) => a.name.localeCompare(b.name));
    if (sortBy === "name-desc") list.sort((a, b) => b.name.localeCompare(a.name));
    if (sortBy === "price-low") list.sort((a, b) => getPriceNumber(a.price) - getPriceNumber(b.price));
    if (sortBy === "price-high") list.sort((a, b) => getPriceNumber(b.price) - getPriceNumber(a.price));
    if (sortBy === "stock-high") list.sort((a, b) => b.stock - a.stock);

    return list;
  }, [activeTag, products, searchValue, sortBy]);

  const totalStock = filteredProducts.reduce((sum, item) => sum + item.stock, 0);
  const lowStock = filteredProducts.filter((item) => item.stock <= 5).length;

  return (
    <div className="bg-[linear-gradient(180deg,#f3f8f3_0%,#ffffff_38%,#f4f7f3_100%)] text-gray-900">
      <section className="border-b border-emerald-100 bg-[radial-gradient(circle_at_top_right,#bbf7d0_0%,#ecfdf5_30%,#f8fafc_75%)]">
        <div className="mx-auto max-w-6xl px-6 py-12">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700">Plant Catalog</p>
          <h1 className="mt-3 text-3xl font-bold md:text-4xl">Find the right succulent for your space</h1>
          <p className="mt-3 max-w-2xl text-sm text-gray-600 md:text-base">
            Explore white, green, red tags, and our tubo collection. Filter quickly and pick your next plant baby.
          </p>

          <div className="mt-7 grid gap-3 sm:grid-cols-3">
            <article className="rounded-xl border border-white bg-white/90 px-4 py-3 shadow-sm">
              <p className="text-xs uppercase tracking-[0.15em] text-gray-500">Products</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">{filteredProducts.length}</p>
            </article>
            <article className="rounded-xl border border-white bg-white/90 px-4 py-3 shadow-sm">
              <p className="text-xs uppercase tracking-[0.15em] text-gray-500">Total Stock</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">{totalStock}</p>
            </article>
            <article className="rounded-xl border border-white bg-white/90 px-4 py-3 shadow-sm">
              <p className="text-xs uppercase tracking-[0.15em] text-gray-500">Low Stock Items</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">{lowStock}</p>
            </article>
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-6xl px-6 py-10">
        <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-2">
              {tagTabs.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTag(tab.key)}
                  className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                    activeTag === tab.key
                      ? "bg-emerald-700 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-emerald-50 hover:text-emerald-700"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <label className="relative">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="search"
                  value={searchValue}
                  onChange={(event) => setSearchValue(event.target.value)}
                  placeholder="Search by name, tag, or note"
                  className="w-full rounded-xl border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm text-gray-700 outline-none ring-emerald-200 focus:ring-2 sm:w-64"
                />
              </label>

              <label className="relative">
                <SlidersHorizontal size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <select
                  value={sortBy}
                  onChange={(event) => setSortBy(event.target.value)}
                  className="w-full appearance-none rounded-xl border border-gray-200 bg-white py-2 pl-9 pr-8 text-sm text-gray-700 outline-none ring-emerald-200 focus:ring-2 sm:w-52"
                >
                  {sortOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        </section>

        <section className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {loading ? (
            <div className="col-span-full rounded-2xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500">
              Loading products...
            </div>
          ) : loadError ? (
            <div className="col-span-full rounded-2xl border border-red-200 bg-red-50 p-10 text-center text-sm text-red-700">
              {loadError}
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="col-span-full rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center">
              <p className="text-sm text-gray-500">No products match your search and filter.</p>
            </div>
          ) : (
            filteredProducts.map((product) => {
              const numericPrice = getPriceNumber(product.price);

              return (
                <article
                  key={product.id}
                  className="group overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-md"
                >
                  <div
                    onClick={() => navigate(`/product/${product.id}`)}
                    className="relative h-48 cursor-pointer overflow-hidden"
                  >
                    <img
                      src={product.image}
                      alt={product.name}
                      className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-transparent" />
                    <span className={`absolute left-3 top-3 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${badgeStyles[product.tagKey]}`}>
                      {getDisplayTag(product.tag, product.category).toUpperCase()}
                    </span>
                  </div>

                  <div className="p-4">
                    <h2 className="line-clamp-2 min-h-12 text-base font-semibold text-gray-900">{product.name}</h2>
                    <p className="mt-2 text-sm text-gray-500">{product.note}</p>

                    <div className="mt-4 flex items-center justify-between">
                      <p className="text-lg font-bold text-emerald-700">{formatPhp(numericPrice)}</p>
                      <p className={`text-xs font-medium ${product.stock <= 5 ? "text-rose-600" : "text-gray-500"}`}>
                        Stock: {product.stock}
                      </p>
                    </div>

                    <button
                      onClick={() => onAddToCart?.(product, 1)}
                      className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-800"
                    >
                      Add to Cart
                      <ShoppingCart size={15} />
                    </button>

                    <button
                      onClick={() => navigate(`/product/${product.id}`)}
                      className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-gray-700"
                    >
                      View Product
                      <ArrowRight size={15} />
                    </button>
                  </div>
                </article>
              );
            })
          )}
        </section>

        <section className="mt-10 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-5">
          <p className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-700">
            <Sprout size={16} />
            Plant tip
          </p>
          <p className="mt-2 text-sm leading-relaxed text-gray-700">
            New to succulents? Start with medium-stock options and pair them with proper sunlight, light watering, and well-draining soil.
          </p>
        </section>
      </main>
    </div>
  );
}
