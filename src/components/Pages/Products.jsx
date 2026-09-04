import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Heart,
  Search,
  ShoppingCart,
  SlidersHorizontal,
  Sprout,
  X
} from "lucide-react";

import { apiProducts, getImageUrl } from "../../api/client";
import awardImage from "../../assets/Award.jpg";
import blogImage from "../../assets/Blog.png";
import plantsImage from "../../assets/Plants.jpg";
import { getWishlistIds, saveWishlistIds } from "../../utils/wishlist";

const tagTabs = [
  { key: "all", label: "All" },
  { key: "white", label: "White Tags" },
  { key: "green", label: "Green Tags" },
  { key: "red", label: "Red Tags" },
  { key: "aquaponics", label: "Aquaponics" }
];

const sortOptions = [
  { value: "featured", label: "Featured" },
  { value: "name-asc", label: "Name: A–Z" },
  { value: "name-desc", label: "Name: Z–A" },
  { value: "price-low", label: "Price: Low to High" },
  { value: "price-high", label: "Price: High to Low" },
  { value: "stock-high", label: "Stock: High to Low" }
];

const badgeStyles = {
  white: "border-slate-200 bg-white text-slate-700",
  green: "border-emerald-200 bg-emerald-50 text-emerald-700",
  red: "border-rose-200 bg-rose-50 text-rose-700",
  aquaponics: "border-amber-200 bg-amber-50 text-amber-700"
};

const cardImages = [
  plantsImage,
  awardImage,
  blogImage,
  plantsImage
];

const AQUAPONICS_TAG = "aquaponics";
const PRODUCTS_PER_PAGE = 15;
const MAX_VISIBLE_PAGE_BUTTONS = 5;

const formatPhp = (amount) =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 0
  }).format(Number.isFinite(amount) ? amount : 0);

const getPriceNumber = (value) => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  const parsedValue = Number(
    String(value ?? "").replace(/[^\d.]/g, "")
  );

  return Number.isFinite(parsedValue) ? parsedValue : 0;
};

const getStockNumber = (value) => {
  const parsedValue = Number(value);

  return Number.isFinite(parsedValue) ? parsedValue : 0;
};

const normalizeTag = (tag, category) => {
  const normalizedTag = String(tag || "")
    .trim()
    .toLowerCase();

  const normalizedCategory = String(category || "")
    .trim()
    .toLowerCase();

  if (["white", "green", "red"].includes(normalizedTag)) {
    return normalizedTag;
  }

  if ([AQUAPONICS_TAG, "others"].includes(normalizedTag)) {
    return AQUAPONICS_TAG;
  }

  if (normalizedCategory === AQUAPONICS_TAG) {
    return AQUAPONICS_TAG;
  }

  return AQUAPONICS_TAG;
};

const getDisplayTag = (tag, category) => {
  const normalizedTag = String(tag || "")
    .trim()
    .toLowerCase();

  const normalizedCategory = String(category || "")
    .trim()
    .toLowerCase();

  if (normalizedTag === "others") {
    return "Aquaponics";
  }

  if (
    !normalizedTag &&
    normalizedCategory === AQUAPONICS_TAG
  ) {
    return "Aquaponics";
  }

  return tag || category || "Plant";
};

export default function Products({ onAddToCart }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedTag = searchParams.get("tag");
  const initialTag = tagTabs.some((tab) => tab.key === requestedTag) ? requestedTag : "all";

  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [activeTag, setActiveTag] = useState(initialTag);
  const [searchValue, setSearchValue] = useState("");
  const [sortBy, setSortBy] = useState("featured");
  const [currentPage, setCurrentPage] = useState(1);
  const [showWishlistOnly, setShowWishlistOnly] = useState(false);
  const [wishlistIds, setWishlistIds] = useState(getWishlistIds);

  const wishlistIdSet = useMemo(
    () => new Set(wishlistIds),
    [wishlistIds]
  );

  useEffect(() => {
    let ignore = false;

    const loadProducts = async () => {
      setLoading(true);
      setLoadError("");

      try {
        const data = await apiProducts();

        if (!ignore) {
          setProducts(Array.isArray(data) ? data : []);
        }
      } catch (error) {
        if (!ignore) {
          setLoadError(
            error?.message || "Failed to load products."
          );
        }
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
      name: item.name || "Untitled product",
      note:
        item.description ||
        `${item.category || "Plant"} item`,
      stock: getStockNumber(item.stock),
      tagKey: normalizeTag(item.tag, item.category),
      image:
        getImageUrl(item.imageUrl) ||
        cardImages[index % cardImages.length]
    }));

    const baseList = mappedProducts.filter((item) => {
      if (item.stock <= 0) {
        return false;
      }

      if (
        showWishlistOnly &&
        !wishlistIdSet.has(String(item.id))
      ) {
        return false;
      }

      const matchesTag =
        activeTag === "all" || item.tagKey === activeTag;

      if (!matchesTag) {
        return false;
      }

      if (!keyword) {
        return true;
      }

      const searchableText = [
        item.name,
        item.tag,
        item.category,
        item.note
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchableText.includes(keyword);
    });

    const sortedList = [...baseList];

    if (sortBy === "name-asc") {
      sortedList.sort((a, b) =>
        String(a.name).localeCompare(String(b.name))
      );
    }

    if (sortBy === "name-desc") {
      sortedList.sort((a, b) =>
        String(b.name).localeCompare(String(a.name))
      );
    }

    if (sortBy === "price-low") {
      sortedList.sort(
        (a, b) =>
          getPriceNumber(a.price) -
          getPriceNumber(b.price)
      );
    }

    if (sortBy === "price-high") {
      sortedList.sort(
        (a, b) =>
          getPriceNumber(b.price) -
          getPriceNumber(a.price)
      );
    }

    if (sortBy === "stock-high") {
      sortedList.sort((a, b) => b.stock - a.stock);
    }

    return sortedList;
  }, [activeTag, products, searchValue, showWishlistOnly, sortBy, wishlistIdSet]);

  const totalPages = Math.max(
    1,
    Math.ceil(
      filteredProducts.length / PRODUCTS_PER_PAGE
    )
  );

  const paginatedProducts = useMemo(() => {
    const startIndex =
      (currentPage - 1) * PRODUCTS_PER_PAGE;

    return filteredProducts.slice(
      startIndex,
      startIndex + PRODUCTS_PER_PAGE
    );
  }, [currentPage, filteredProducts]);

  const visiblePageNumbers = useMemo(() => {
    const visibleCount = Math.min(
      MAX_VISIBLE_PAGE_BUTTONS,
      totalPages
    );

    const halfWindow = Math.floor(visibleCount / 2);

    let startPage = Math.max(
      1,
      currentPage - halfWindow
    );

    let endPage = startPage + visibleCount - 1;

    if (endPage > totalPages) {
      endPage = totalPages;
      startPage = Math.max(
        1,
        endPage - visibleCount + 1
      );
    }

    return Array.from(
      { length: endPage - startPage + 1 },
      (_, index) => startPage + index
    );
  }, [currentPage, totalPages]);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeTag, searchValue, showWishlistOnly, sortBy]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const totalStock = filteredProducts.reduce(
    (sum, item) => sum + item.stock,
    0
  );

  const lowStock = filteredProducts.filter(
    (item) => item.stock > 0 && item.stock <= 5
  ).length;

  const filtersAreActive =
    activeTag !== "all" ||
    showWishlistOnly ||
    searchValue.trim() !== "" ||
    sortBy !== "featured";

  const clearFilters = () => {
    setActiveTag("all");
    setShowWishlistOnly(false);
    setSearchValue("");
    setSortBy("featured");
  };

  const toggleWishlist = (productId) => {
    const normalizedId = String(productId);

    setWishlistIds((currentIds) => {
      const nextIds = currentIds.includes(normalizedId)
        ? currentIds.filter((id) => id !== normalizedId)
        : [...currentIds, normalizedId];

      saveWishlistIds(nextIds);
      return nextIds;
    });
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Header */}
      <header className="border-b border-emerald-200 bg-emerald-50">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-7">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
                <Sprout size={14} aria-hidden="true" />
                Plant catalog
              </div>

              <h1 className="mt-3 max-w-3xl text-2xl font-bold leading-tight tracking-tight text-slate-950 sm:text-3xl lg:text-4xl">
                Find the right plant for your space.
              </h1>

              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
                Browse our white, green, red-tagged, and
                aquaponics selections. Use the filters to
                quickly find the best match for your space.
              </p>
            </div>

            {/* Statistics */}
            <dl className="grid grid-cols-3 divide-x divide-emerald-100 rounded-2xl border border-emerald-200 bg-white/80 px-2 py-3 shadow-sm sm:min-w-[390px]">
              <div className="px-4">
                <dt className="text-xs font-medium text-slate-500">
                  Products
                </dt>

                <dd className="mt-1 text-xl font-bold text-slate-950">
                  {loading
                    ? "—"
                    : filteredProducts.length}
                </dd>
              </div>

              <div className="px-4">
                <dt className="text-xs font-medium text-slate-500">
                  In stock
                </dt>

                <dd className="mt-1 text-xl font-bold text-emerald-700">
                  {loading ? "—" : totalStock}
                </dd>
              </div>

              <div className="px-4">
                <dt className="text-xs font-medium text-slate-500">
                  Low stock
                </dt>

                <dd className="mt-1 text-xl font-bold text-amber-600">
                  {loading ? "—" : lowStock}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] px-4 py-8 sm:px-6 lg:px-8 lg:py-1">
        {/* Filters */}
        <section className="rounded-2xl border border-slate-300 bg-white p-4 shadow-sm sm:p-5">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_auto] lg:items-center lg:gap-4">
            {/* Search */}
            <label className="relative block lg:col-start-1">
              <span className="sr-only">
                Search products
              </span>

              <Search
                size={18}
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />

              <input
                type="search"
                value={searchValue}
                onChange={(event) =>
                  setSearchValue(event.target.value)
                }
                placeholder="Search products..."
                className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-100"
              />
            </label>

            {/* Sort */}
            <label className="relative block">
              <span className="sr-only">
                Sort products
              </span>

              <SlidersHorizontal
                size={17}
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />

              <select
                value={sortBy}
                onChange={(event) =>
                  setSortBy(event.target.value)
                }
                className="h-11 w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-8 text-sm text-slate-700 outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-100"
              >
                {sortOptions.map((option) => (
                  <option
                    key={option.value}
                    value={option.value}
                  >
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            {/* Clear filters */}
            {filtersAreActive && (
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
              >
                <X size={16} aria-hidden="true" />
                Clear
              </button>
            )}
          </div>

          {/* Tag filters */}
          <div className="mt-4 flex gap-2 overflow-x-auto border-t border-slate-100 pt-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {tagTabs.map((tab) => {
              const isActive = activeTag === tab.key;

              return (
                <button
                  key={tab.key}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() =>
                    setActiveTag(tab.key)
                  }
                  className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition focus:outline-none focus:ring-4 focus:ring-emerald-100 ${
                    isActive
                      ? "bg-emerald-700 text-white shadow-sm"
                      : "bg-slate-100 text-slate-600 hover:bg-emerald-50 hover:text-emerald-700"
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}

            <button
              type="button"
              aria-pressed={showWishlistOnly}
              onClick={() => setShowWishlistOnly((current) => !current)}
              className={`inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition focus:outline-none focus:ring-4 focus:ring-rose-100 ${
                showWishlistOnly
                  ? "bg-rose-600 text-white shadow-sm"
                  : "bg-rose-50 text-rose-700 hover:bg-rose-100"
              }`}
            >
              <Heart
                size={15}
                fill={showWishlistOnly ? "currentColor" : "none"}
                aria-hidden="true"
              />
              Wishlist ({wishlistIds.length})
            </button>
          </div>
        </section>

        {/* Product heading */}
        <div className="mt-8 flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
              Available collection
            </p>

            <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">
              Products
            </h2>
          </div>

          {!loading && !loadError && (
            <p className="text-sm text-slate-500">
              {filteredProducts.length}{" "}
              {filteredProducts.length === 1
                ? "result"
                : "results"}
            </p>
          )}
        </div>

        {/* Product grid */}
        <section className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {loading ? (
            Array.from({ length: 10 }).map(
              (_, index) => (
                <div
                  key={index}
                  className="overflow-hidden rounded-2xl border border-slate-200 bg-white"
                  aria-hidden="true"
                >
                  <div className="aspect-[4/3] animate-pulse bg-slate-200" />

                  <div className="space-y-4 p-5">
                    <div className="h-5 w-3/4 animate-pulse rounded bg-slate-200" />

                    <div className="space-y-2">
                      <div className="h-3 w-full animate-pulse rounded bg-slate-100" />
                      <div className="h-3 w-2/3 animate-pulse rounded bg-slate-100" />
                    </div>

                    <div className="h-10 animate-pulse rounded-xl bg-slate-200" />
                  </div>
                </div>
              )
            )
          ) : loadError ? (
            <div className="col-span-full rounded-2xl border border-rose-200 bg-rose-50 px-6 py-12 text-center">
              <p className="font-semibold text-rose-800">
                Unable to load products
              </p>

              <p className="mt-2 text-sm text-rose-700">
                {loadError}
              </p>
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="col-span-full rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                <Search
                  size={20}
                  aria-hidden="true"
                />
              </div>

              <h3 className="mt-4 font-semibold text-slate-900">
                No products found
              </h3>

              <p className="mt-2 text-sm text-slate-500">
                Try another keyword or clear the active
                filters.
              </p>

              {filtersAreActive && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="mt-5 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800"
                >
                  Clear filters
                </button>
              )}
            </div>
          ) : (
            paginatedProducts.map((product) => {
              const numericPrice = getPriceNumber(
                product.price
              );

              const isAquaponics =
                product.tagKey === AQUAPONICS_TAG;

              const isOutOfStock =
                product.stock <= 0;

              const isLowStock =
                isAquaponics &&
                product.stock > 0 &&
                product.stock <= 5;

              const isWishlisted = wishlistIdSet.has(
                String(product.id)
              );
              return (
                <article
                  key={product.id}
                  className="group flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition duration-300 hover:-translate-y-1 hover:border-slate-300 hover:shadow-lg hover:shadow-slate-200/60"
                >
                  {/* Product image */}
                  <button
                    type="button"
                    onClick={() =>
                      navigate(
                        `/product/${product.id}`
                      )
                    }
                    className="relative block aspect-[4/3] w-full overflow-hidden bg-slate-100 text-left focus:outline-none focus:ring-4 focus:ring-inset focus:ring-emerald-200"
                    aria-label={`View ${product.name}`}
                  >
                    <img
                      src={product.image}
                      alt={product.name}
                      loading="lazy"
                      className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]"
                    />

                    <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-slate-950/35 to-transparent" />

                    {/* Tag badge */}
                    <span
                      className={`absolute left-3 top-3 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide shadow-sm ${
                        badgeStyles[
                          product.tagKey
                        ]
                      }`}
                    >
                      {getDisplayTag(
                        product.tag,
                        product.category
                      )}
                    </span>

                    {/* Stock is counted in individual packs/pieces. */}
                    {(isAquaponics || isOutOfStock) ? (
                      <span
                        className={"absolute bottom-3 right-3 rounded-full px-2.5 py-1 text-[11px] font-semibold shadow-sm backdrop-blur " + (
                          isOutOfStock
                            ? "bg-slate-950/80 text-white"
                            : isLowStock
                              ? "bg-amber-50/95 text-amber-700"
                              : "bg-white/95 text-slate-700"
                        )}
                      >
                        {isOutOfStock ? "Out of stock" : product.stock + " pcs available"}
                      </span>
                    ) : null}
                  </button>

                  {/* Product details */}
                  <div className="flex flex-1 flex-col p-5">
                    <div className="flex-1">
                      <h3 className="line-clamp-2 text-base font-bold leading-6 text-slate-950">
                        {product.name}
                      </h3>

                      <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-500">
                        {product.note}
                      </p>
                    </div>

                    <p className="mt-5 text-xl font-bold tracking-tight text-emerald-700">
                      {formatPhp(numericPrice)}
                    </p>

                    {/* Product actions */}
                    <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto_auto] gap-2">
                      <button
                        type="button"
                        disabled={isOutOfStock}
                        onClick={() =>
                          onAddToCart?.(product, 1)
                        }
                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 text-sm font-semibold text-white transition hover:bg-emerald-800 focus:outline-none focus:ring-4 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
                      >
                        <ShoppingCart
                          size={16}
                          aria-hidden="true"
                        />

                        {isOutOfStock
                          ? "Unavailable"
                          : "Add to cart"}
                      </button>

                      <button
                        type="button"
                        onClick={() => toggleWishlist(product.id)}
                        className={`inline-flex h-11 w-11 items-center justify-center rounded-xl border transition focus:outline-none focus:ring-4 focus:ring-rose-100 ${
                          isWishlisted
                            ? "border-rose-200 bg-rose-50 text-rose-600"
                            : "border-slate-200 bg-white text-slate-500 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
                        }`}
                        aria-label={`${isWishlisted ? "Remove" : "Add"} ${product.name} ${isWishlisted ? "from" : "to"} wishlist`}
                        aria-pressed={isWishlisted}
                        title={isWishlisted ? "Remove from wishlist" : "Add to wishlist"}
                      >
                        <Heart
                          size={18}
                          fill={isWishlisted ? "currentColor" : "none"}
                          aria-hidden="true"
                        />
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          navigate(
                            `/product/${product.id}`
                          )
                        }
                        className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700 focus:outline-none focus:ring-4 focus:ring-emerald-100"
                        aria-label={`View details for ${product.name}`}
                        title="View details"
                      >
                        <ArrowRight
                          size={17}
                          aria-hidden="true"
                        />
                      </button>
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </section>

        {/* Pagination */}
        {!loading &&
          !loadError &&
          filteredProducts.length > 0 && (
            <nav
              className="mt-8 flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"
              aria-label="Product pagination"
            >
              <p className="text-sm text-slate-500">
                Showing{" "}
                <span className="font-semibold text-slate-700">
                  {(currentPage - 1) *
                    PRODUCTS_PER_PAGE +
                    1}
                </span>{" "}
                to{" "}
                <span className="font-semibold text-slate-700">
                  {Math.min(
                    currentPage *
                      PRODUCTS_PER_PAGE,
                    filteredProducts.length
                  )}
                </span>{" "}
                of{" "}
                <span className="font-semibold text-slate-700">
                  {filteredProducts.length}
                </span>{" "}
                products
              </p>

              <div className="flex items-center justify-center gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    setCurrentPage((page) =>
                      Math.max(1, page - 1)
                    )
                  }
                  disabled={currentPage === 1}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700 focus:outline-none focus:ring-4 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Go to previous page"
                >
                  <ChevronLeft
                    size={18}
                    aria-hidden="true"
                  />
                </button>

                {visiblePageNumbers.map(
                  (pageNumber) => {
                    const isCurrentPage =
                      currentPage === pageNumber;

                    return (
                      <button
                        key={pageNumber}
                        type="button"
                        onClick={() =>
                          setCurrentPage(
                            pageNumber
                          )
                        }
                        aria-current={
                          isCurrentPage
                            ? "page"
                            : undefined
                        }
                        className={`inline-flex h-10 min-w-10 items-center justify-center rounded-xl px-3 text-sm font-semibold transition focus:outline-none focus:ring-4 focus:ring-emerald-100 ${
                          isCurrentPage
                            ? "bg-emerald-700 text-white shadow-sm"
                            : "border border-slate-200 bg-white text-slate-600 hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700"
                        }`}
                      >
                        {pageNumber}
                      </button>
                    );
                  }
                )}

                <button
                  type="button"
                  onClick={() =>
                    setCurrentPage((page) =>
                      Math.min(
                        totalPages,
                        page + 1
                      )
                    )
                  }
                  disabled={
                    currentPage === totalPages
                  }
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700 focus:outline-none focus:ring-4 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Go to next page"
                >
                  <ChevronRight
                    size={18}
                    aria-hidden="true"
                  />
                </button>
              </div>
            </nav>
          )}

        {/* Plant care tip */}
        <aside className="mt-10 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-emerald-700 shadow-sm">
            <Sprout size={17} aria-hidden="true" />
          </div>

          <div>
            <p className="text-sm font-bold text-emerald-900">
              Plant care tip
            </p>

            <p className="mt-1 text-sm leading-6 text-emerald-900/75">
              Give succulents enough sunlight, water only
              when the soil is dry, and use a
              well-draining potting mix.
            </p>
          </div>
        </aside>
      </main>
    </div>
  );
}
