import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Heart,
  Search,
  ShoppingCart,
  SlidersHorizontal,
  Sprout
} from "lucide-react";

import { apiProducts, getImageUrl } from "../../api/client";
import catalogHero from "../../assets/belfiore-catalog-hero.png";
import "./catalogHero.css";
import "./catalogMobile.css";
import "./catalogCategories.css";
import CatalogCategories from "./CatalogCategories";
import { getWishlistIds, saveWishlistIds } from "../../utils/wishlist";

const categoryTabs = [
 {key:'all',label:'All Products'},{key:'succulents',label:'Succulents'},
 {key:'lettuce',label:'Lettuce'},{key:'gardening_supply',label:'Gardening Supplies'}
];
const subcategoryTabs = {
 succulents: ['white','green','red'].map(key=>({key,label:key[0].toUpperCase()+key.slice(1)+' Tags'})),
};

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


const AQUAPONICS_TAG = "aquaponics";
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

  if(normalizedTag==='gardening supplies')return 'gardening_supply';
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

const getCustomerProductName = (item) => {
  return String(item?.name || 'Untitled product').trim();
};

const getCustomerProductDescription = (item) => {
  const category = String(item?.category || '').trim();
  const description = String(item?.description || '').trim().replace(/^\((.*)\)$/, '$1').trim();
  if (category.toLowerCase() === 'aloe hybrids') return description ? `Aloe Hybrids (${description})` : 'Aloe Hybrids';
  return description;
};

export default function Products({ onAddToCart, cartItems = [] }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedTag = searchParams.get("tag");
  const legacyTag = ['white','green','red'].includes(requestedTag);
  const initialTag = legacyTag ? 'succulents' : requestedTag === 'aquaponics' ? 'lettuce' : categoryTabs.some(tab=>tab.key===requestedTag) ? requestedTag : 'all';

  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [activeTag, setActiveTag] = useState(initialTag);
  const [activeSubcategory, setActiveSubcategory] = useState(legacyTag ? requestedTag : 'all');
  const [searchValue, setSearchValue] = useState("");
  const [sortBy, setSortBy] = useState("featured");
  const [currentPage, setCurrentPage] = useState(1);
  const [productsPerPage,setProductsPerPage]=useState(16);
  useEffect(()=>{
    const desktop=window.matchMedia('(min-width: 1440px)');
    const laptop=window.matchMedia('(min-width: 1024px)');
    const tablet=window.matchMedia('(min-width: 768px)');
    const update=()=>setProductsPerPage(desktop.matches?20:laptop.matches?16:tablet.matches?18:16);
    const queries=[desktop,laptop,tablet];
    update();queries.forEach(query=>query.addEventListener('change',update));
    return()=>queries.forEach(query=>query.removeEventListener('change',update));
  },[]);
  const resultsHeading=useRef(null);
  const paginationScroll=useRef(false);
  const changePage=(page)=>{
    if(page===currentPage)return;
    paginationScroll.current=true;
    setCurrentPage(page);
  };
  useLayoutEffect(()=>{
    if(!paginationScroll.current||!resultsHeading.current)return;
    paginationScroll.current=false;
    const heading=resultsHeading.current;
    const header=document.querySelector('.customer-navigation')?.closest('header');
    const offset=header?.getBoundingClientRect().height||0;
    heading.focus({preventScroll:true});
    window.scrollTo({top:Math.max(0,window.scrollY+heading.getBoundingClientRect().top-offset-12),behavior:'instant'});
  },[currentPage]);
  const [showWishlistOnly, setShowWishlistOnly] = useState(false);
  const [wishlistIds, setWishlistIds] = useState(getWishlistIds);

  const wishlistIdSet = useMemo(
    () => new Set(wishlistIds),
    [wishlistIds]
  );
  // Count records that the current catalog can actually display, not stale saved IDs.
  const catalogWishlistCount = useMemo(
    () => products.filter(product => wishlistIdSet.has(String(product.id))).length,
    [products, wishlistIdSet]
  );

  useEffect(() => {
    let ignore = false;

    const loadProducts = async (initial = false) => {
      if (initial) setLoading(true);
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

    loadProducts(true);
    const refresh = () => { if (!document.hidden) loadProducts(); };
    const timer = setInterval(refresh, 30000);
    document.addEventListener('visibilitychange', refresh);

    return () => {
      ignore = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);

  const filteredProducts = useMemo(() => {
    const keyword = searchValue.trim().toLowerCase();

    const mappedProducts = products.map((item) => ({
      ...item,
      name: getCustomerProductName(item),
      note: getCustomerProductDescription(item),
      stock: getStockNumber(item.stock),
      tagKey: normalizeTag(item.tag, item.category),
      image:
        getImageUrl(item.imageUrl) ||
        '/product-placeholder.svg'
    }));

    const baseList = mappedProducts.filter((item) => {
      if (!showWishlistOnly&&item.stock <= 0&&item.inventoryType==='succulent') {
        return false;
      }

      if (
        showWishlistOnly &&
        !wishlistIdSet.has(String(item.id))
      ) {
        return false;
      }

      const matchesTag =
        activeTag === "all" || activeTag==='gardening_supply'&&item.inventoryType==='GARDENING_SUPPLY' || activeTag==='succulents'&&item.inventoryType==='succulent' || activeTag==='lettuce'&&item.inventoryType==='edible';

      const matchesSubcategory = activeSubcategory === 'all' ||
        activeTag === 'succulents' && item.tagKey === activeSubcategory ||
        activeTag === 'lettuce' ||
        activeTag === 'gardening_supply';
      if (!matchesTag || !matchesSubcategory) {
        return false;
      }

      if (!keyword) {
        return true;
      }

      const searchableText = [
        item.name,
        item.productCode,
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
  }, [activeTag, activeSubcategory, products, searchValue, showWishlistOnly, sortBy, wishlistIdSet]);

  const totalPages = Math.max(
    1,
    Math.ceil(
      filteredProducts.length / productsPerPage
    )
  );

  const paginatedProducts = useMemo(() => {
    const startIndex =
      (currentPage - 1) * productsPerPage;

    return filteredProducts.slice(
      startIndex,
      startIndex + productsPerPage
    );
  }, [currentPage, filteredProducts, productsPerPage]);

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
  }, [activeTag, activeSubcategory, searchValue, showWishlistOnly, sortBy, productsPerPage]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const filtersAreActive =
    activeTag !== "all" ||
    showWishlistOnly ||
    searchValue.trim() !== "" ||
    sortBy !== "featured";

  const clearFilters = () => {
    setActiveTag("all");
    setActiveSubcategory("all");
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
    <div className="product-catalog min-h-screen bg-slate-50 text-slate-900">
      <header className="catalog-hero border-b border-emerald-900" style={{ '--catalog-hero-image': `url("${catalogHero}")` }}>
        <div className="mx-auto flex min-h-[190px] max-w-[1600px] items-center px-4 py-6 sm:min-h-[200px] sm:px-6 lg:px-8">
          <div className="max-w-[34rem] md:w-[52%]">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-100">
            <Sprout size={14} aria-hidden="true" /> Product catalog
          </p>
          <h1 className="mt-2 text-2xl font-bold leading-tight tracking-tight text-white lg:text-[28px]">Plants &amp; Gardening Essentials</h1>
          <p className="mt-2 text-sm leading-6 text-white">Explore our succulents, fresh lettuce, and gardening supplies.</p>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1600px] px-4 py-4 sm:px-6 lg:px-8">
        {/* Filters */}
        <section className="rounded-2xl border border-slate-300 bg-white p-4 shadow-sm sm:p-4">
          <div className="catalog-search-sort grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px] lg:items-center lg:gap-4">
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


          </div>

          <CatalogCategories selected={showWishlistOnly?'wishlist':activeTag} count={loading?'?':catalogWishlistCount} onSelect={key=>{
            setShowWishlistOnly(key==='wishlist');
            setActiveTag(key==='wishlist'?'all':key);
            setActiveSubcategory('all');
            if(key==='wishlist')setSearchValue('');
          }}/>
          {subcategoryTabs[activeTag] && (
            <div className="catalog-filter-row mt-3 flex flex-wrap gap-2" role="group" aria-label="Category options">
              {[{key:'all',label:activeTag==='succulents'?'All Succulents':activeTag==='lettuce'?'All Lettuce':'All Supplies'},...subcategoryTabs[activeTag]].map(tab=>(
                <button key={tab.key} type="button" aria-pressed={activeSubcategory===tab.key}
                  onClick={event=>{setActiveSubcategory(tab.key);event.currentTarget.scrollIntoView({block:"nearest",inline:"nearest",behavior:"instant"});}}
                  className={'min-h-10 rounded-lg border px-3 py-2 text-xs font-medium transition focus:outline-none focus:ring-4 focus:ring-emerald-100 '+(activeSubcategory===tab.key?'border-emerald-700 bg-emerald-50 text-emerald-900':'border-slate-200 text-slate-600 hover:border-emerald-300')}>
                  {tab.label}
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Product heading */}
        <div ref={resultsHeading} tabIndex={-1} aria-label="Product results" className="mt-4 flex items-end justify-between gap-4 focus:outline-none">
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
        <section className="catalog-product-grid mt-3 grid gap-5">
          {loading ? (
            Array.from({ length: 10 }).map(
              (_, index) => (
                <div
                  key={index}
                  className="overflow-hidden rounded-2xl border border-slate-200 bg-white"
                  aria-hidden="true"
                >
                  <div className="aspect-square animate-pulse bg-slate-200" />

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
                {showWishlistOnly && catalogWishlistCount === 0 ? 'Your wishlist is empty' : 'No products found'}
              </h3>

              <p className="mt-2 text-sm text-slate-500">
                {showWishlistOnly && catalogWishlistCount === 0
                  ? 'Tap the heart on a product to save it here. Products no longer in the catalog are not counted.'
                  : 'Try another keyword or clear the active filters.'}
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
                product.inventoryType === 'edible' && product.stock > 0 &&
                product.stock <= product.lowStockThreshold;

              const inCart=product.inventoryType!=='GARDENING_SUPPLY'&&cartItems.some(item=>String(item.id)===String(product.id));
              const isWishlisted = wishlistIdSet.has(
                String(product.id)
              );
              return (
                <article
                  key={product.id}
                  className="catalog-product-card group flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition duration-300 hover:-translate-y-1 hover:border-slate-300 hover:shadow-lg hover:shadow-slate-200/60"
                >
                  {/* Product image */}
                  <button
                    type="button"
                    onClick={() =>
                      navigate(
                        `/product/${product.id}`
                      )
                    }
                    className="relative block aspect-square w-full overflow-hidden bg-slate-100 text-left focus:outline-none focus:ring-4 focus:ring-inset focus:ring-emerald-200"
                    aria-label={`View ${product.name}`}
                  >
                    <img
                      src={product.image}
                      onError={e => { if (!e.currentTarget.src.endsWith('/product-placeholder.svg')) e.currentTarget.src = '/product-placeholder.svg'; }}
                      alt={product.name}
                      loading="lazy"
                      className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]"
                    />

                    <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-slate-950/35 to-transparent" />

                    {/* Tag badge */}
                    <span
                      className={`catalog-tag absolute left-3 top-3 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide shadow-sm ${
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
                        className={"catalog-stock-badge absolute bottom-3 right-3 rounded-full px-2.5 py-1 text-[11px] font-semibold shadow-sm backdrop-blur " + (
                          isOutOfStock
                            ? "bg-slate-950/80 text-white"
                            : isLowStock
                              ? "bg-amber-50/95 text-amber-700"
                              : "bg-white/95 text-slate-700"
                        )}
                      >
                        {product.inventoryType==='GARDENING_SUPPLY'?`${product.variants?.length||0} variants | ${product.status}`:isOutOfStock ? (product.inventoryType==='GARDENING_SUPPLY'?product.status:"Out of stock") : product.stock + (product.inventoryType === 'edible' ? " packs available · 400g each" : " individual plant available")}
                      </span>
                    ) : null}
                  </button>

                  {/* Product details */}
                  <div className="catalog-card-content flex flex-1 flex-col p-5">
                    <div className="flex-1">
                      <h3 className="line-clamp-2 text-base font-bold leading-6 text-slate-950">
                        {product.name}
                      </h3>
                      {product.inventoryType === 'succulent' && <p className="mt-1 font-mono text-xs text-slate-500">{product.productCode}</p>}

                      <p className="catalog-mobile-status mt-1 text-xs text-slate-600">
                        {product.inventoryType==='GARDENING_SUPPLY' ? (product.variants?.length||0)+' variants ? '+product.status : product.inventoryType==='edible' ? product.stock+' packs ? 400g each' : isOutOfStock ? 'Unavailable' : 'Available ? 1 plant'}
                      </p>
                      {product.note ? (
                        <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-500">{product.note}</p>
                      ) : null}
                    </div>

                    <p className="catalog-price mt-5 text-xl font-bold tracking-tight text-emerald-700">
                      {product.inventoryType==='GARDENING_SUPPLY'?`From ${formatPhp(numericPrice)} / selling unit`:product.inventoryType==='edible' ? product.batches?.length ? `${formatPhp(product.batches[0].price)} · oldest eligible batch` : 'No eligible batches' : formatPhp(numericPrice)}
                    </p>

                    {/* Product actions */}
                    <div className="catalog-card-actions mt-4 grid grid-cols-[minmax(0,1fr)_auto_auto] gap-2">
                      <button
                        type="button"
                        disabled={isOutOfStock||inCart}
                        onClick={(event) =>
                          product.inventoryType==='GARDENING_SUPPLY'?navigate(`/product/${product.id}`):onAddToCart?.(product, 1, event.currentTarget)
                        }
                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 text-sm font-semibold text-white transition hover:bg-emerald-800 focus:outline-none focus:ring-4 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
                      >
                        <ShoppingCart
                          size={16}
                          aria-hidden="true"
                        />

                        {isOutOfStock
                          ? "Unavailable"
                          : product.inventoryType==='GARDENING_SUPPLY'?"View Options":"Add to cart"}
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
                    productsPerPage +
                    1}
                </span>{" "}
                to{" "}
                <span className="font-semibold text-slate-700">
                  {Math.min(
                    currentPage *
                      productsPerPage,
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
                    changePage(Math.max(1, currentPage - 1))
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
                          changePage(
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
                    changePage(Math.min(totalPages, currentPage + 1))
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
