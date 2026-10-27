import {cartLineId} from '../../../shared/cartIdentity';
import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Minus, PackageCheck, Plus, ShoppingCart } from "lucide-react";
import { apiProducts, getImageUrl } from "../../api/client";

const badgeStyles = {
  white: "bg-gray-100 text-gray-700 ring-gray-200",
  green: "bg-emerald-100 text-emerald-700 ring-emerald-200",
  red: "bg-rose-100 text-rose-700 ring-rose-200",
  aquaponics: "bg-amber-100 text-amber-700 ring-amber-200"
};


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

const getCustomerProductName = (item) => {
  return String(item?.name || 'Untitled product').trim();
};

const getCustomerProductDescription = (item) => {
  const category = String(item?.category || '').trim();
  const description = String(item?.description || '').trim().replace(/^\((.*)\)$/, '$1').trim();
  if (category.toLowerCase() === 'aloe hybrids') return description ? `Aloe Hybrids (${description})` : 'Aloe Hybrids';
  return description;
};

export default function ProductDetail({ onAddToCart, cartItems = [] }) {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [addedMessage, setAddedMessage] = useState("");

  const [selectedVariantId,setSelectedVariantId]=useState('');

  useEffect(() => {
    let ignore = false;

    const loadProduct = async (initial = false) => {
      if (initial) setLoading(true);
      setLoadError("");
      try {
        const data = await apiProducts();
        if (ignore) return;
        const match = Array.isArray(data) ? data.find((item) => Number(item.id) === Number(id)) : null;
        setProduct(match || null);
      } catch (error) {
        if (ignore) return;
        setLoadError(error.message || "Failed to load product");
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    };

    loadProduct(true);
    const refresh = () => { if (!document.hidden) loadProduct(); };
    const timer = setInterval(refresh, 30000);
    document.addEventListener('visibilitychange', refresh);

    return () => {
      ignore = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [id]);

  useEffect(() => {
    setQuantity(1);
    setAddedMessage("");
  }, [id]);

  if (loading) {
    return <div className="p-10 text-center text-gray-500">Loading product...</div>;
  }

  if (loadError) {
    return <div className="p-10 text-center text-red-700">{loadError}</div>;
  }

  if (!product) {
    return <div className="p-10">Product not found</div>;
  }

  const isSupply=product.inventoryType==='GARDENING_SUPPLY';
  const selectedVariant=product.variants?.find(v=>String(v.id)===selectedVariantId)||product.variants?.find(v=>v.available_stock>0)||product.variants?.[0];
  const availableStock=isSupply?(selectedVariant?.available_stock||0):product.stock;

  const numericPrice = getPriceNumber(isSupply?(selectedVariant?.price||0):product.price);
  const displayImage = getImageUrl(isSupply&&selectedVariant?.image_url?selectedVariant.image_url:product.imageUrl) || '/product-placeholder.svg';
  const tagKey = normalizeTag(product.tag, product.category);
  const isAquaponics = !isSupply&&tagKey === AQUAPONICS_TAG;
  const maxQuantity = isSupply?Math.max(1,availableStock):isAquaponics ? Math.max(1, availableStock) : 1;
  const isOrderView = location.state?.from === "/orders";
  const customerProductName = getCustomerProductName(product);
  const customerProductDescription = getCustomerProductDescription(product);
  const backTarget = isOrderView ? "/orders" : "/products";
  const backLabel = isOrderView ? "Back to Orders" : "Back to Products";

  const selectedCartId=cartLineId({...product,variantId:isSupply?selectedVariant?.id:null,batchId:null});
  const inCart=cartItems.some(item=>String(item.id)===String(selectedCartId));
  const handleAddToCart = (event) => {
    if(inCart)return;
    if(isSupply){if(!selectedVariant||availableStock<1)return;const accepted=onAddToCart?.({...product,price:selectedVariant.price,stock:availableStock,variantId:selectedVariant.id,variantName:selectedVariant.name,variantSku:selectedVariant.sku,sellingUnit:selectedVariant.selling_unit,piecesPerUnit:selectedVariant.pieces_per_unit,weightKg:selectedVariant.weight_kg,imageUrl:selectedVariant.image_url||product.imageUrl},Math.min(quantity,maxQuantity),event.currentTarget);if(accepted===true)setAddedMessage('Added to cart');return;}
    if(isAquaponics&&product.lettuceStockModel!=='quantity')return;
    const accepted=onAddToCart?.(product,Math.min(quantity,maxQuantity),event.currentTarget);
    if(accepted!==true)return;
    setAddedMessage("Added to cart");
    setTimeout(() => setAddedMessage(""), 1500);
  };

  return (
    <div className="bg-[linear-gradient(180deg,#f8faf9_0%,#f2f6f4_45%,#eef3f1_100%)] px-6 py-10">
      <div className="mx-auto max-w-7xl">
        <button
          onClick={() => navigate(backTarget)}
          className="mb-5 inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
        >
          <ArrowLeft size={16} />
          {backLabel}
        </button>

        <section className="rounded-2xl border border-white/80 bg-white/95 p-5 shadow-sm backdrop-blur md:p-8">
          {isOrderView ? (
            <div className="mb-6 rounded-2xl border border-emerald-100 bg-[linear-gradient(135deg,#ecfdf5_0%,#f8fafc_65%)] p-6 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Order Details</p>
              <h1 className="mt-2 text-2xl font-bold text-gray-900 md:text-3xl">{customerProductName}</h1>
              <p className="mt-2 max-w-2xl text-sm text-gray-600">
                Product information for the item in your order. Review the image, category, and stock details here.
              </p>
            </div>
          ) : null}

          <div className={`grid gap-6 ${isOrderView ? "xl:grid-cols-[0.82fr_1.18fr]" : "md:grid-cols-[1.05fr_0.95fr]"}`}>
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-[linear-gradient(180deg,#eef7ef_0%,#f8fbf8_100%)] shadow-sm">
            <img
              src={displayImage}
              onError={e => { if (!e.currentTarget.src.endsWith('/product-placeholder.svg')) e.currentTarget.src = '/product-placeholder.svg'; }}
              alt={product.name}
              className={`w-full object-cover ${isOrderView ? "h-[260px] sm:h-[320px] xl:h-[360px]" : "h-full min-h-[340px]"}`}
            />
          </div>

          <div className="flex flex-col">
            <span className={`w-fit rounded-full px-3 py-1 text-xs font-semibold ring-1 ${badgeStyles[tagKey]}`}>
              {getDisplayTag(product.tag, product.category).toUpperCase()}
            </span>

            <h1 className="mt-3 text-3xl font-bold text-gray-900">{customerProductName}</h1>
            {isSupply&&<label className="mt-4 block text-sm font-medium text-gray-700">Choose variant<select className="mt-2 w-full rounded-xl border border-gray-200 p-3" value={String(selectedVariant?.id||'')} onChange={e=>{setSelectedVariantId(e.target.value);setQuantity(1);}}>{product.variants?.map(v=><option key={v.id} value={v.id}>{v.name} | {formatPhp(v.price)} / {v.selling_unit} | {v.available_stock} available | {v.status}</option>)}</select><span className="mt-2 block text-xs">{selectedVariant?.sku} | {selectedVariant?.pieces_per_unit?`${selectedVariant.pieces_per_unit} pieces / ${selectedVariant.selling_unit}`:`${selectedVariant?.weight_kg||0} kg / bag`} | {availableStock} {selectedVariant?.selling_unit} available</span></label>}
            {product.inventoryType === 'succulent' && <p className="mt-1 font-mono text-sm text-gray-500">{product.productCode}</p>}
            {customerProductDescription ? <p className="mt-2 text-sm text-gray-600">{customerProductDescription}</p> : null}

            <div className={`${isOrderView ? "mt-5 rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4" : "mt-5"}`}>
              <p className="text-3xl font-bold text-emerald-700">{formatPhp(numericPrice)}</p>
              {isAquaponics ? (
                <p className={"mt-2 text-sm font-medium " + (product.inventoryType === 'edible' && product.stock <= product.lowStockThreshold ? "text-rose-600" : "text-gray-600")}>
                  Available stock: {product.stock} {isAquaponics ? 'packs · 1 Pack = 400g' : 'individual plant'}
                </p>
              ) : null}
            </div>

            <div className="mt-6 grid gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4 sm:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Category</p>
                <p className="mt-1 text-sm font-medium text-gray-800">{product.category || "Plants"}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Availability</p>
                <p className="mt-1 inline-flex items-center gap-2 text-sm font-medium text-gray-800">
                  <PackageCheck size={15} className="text-emerald-700" />
                  {isSupply?(availableStock>0?"Ready for checkout":selectedVariant?.status||product.status):product.stock > 0 ? "Ready for checkout" : "Out of stock"}
                </p>
              </div>
            </div>

            {isOrderView ? (
              <div className="mt-6 rounded-2xl border border-gray-200 bg-gray-50/70 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Description</p>
                <p className="mt-3 text-sm leading-6 text-gray-700">
                  {customerProductDescription || "No additional product description was provided for this item."}
                </p>
              </div>
            ) : (
              <>
                <div className="mt-6">
                  <p className="mb-2 text-sm font-semibold text-gray-700">Quantity</p>
                  {(isAquaponics||isSupply) ? (
                    <div className="inline-flex items-center rounded-lg border border-gray-300">
                      <button
                        onClick={() => setQuantity((previous) => Math.max(1, previous - 1))}
                        className="px-3 py-2 text-gray-600 hover:bg-gray-50"
                        aria-label="Decrease quantity"
                      >
                        <Minus size={16} />
                      </button>
                      <span className="min-w-10 px-3 text-center text-sm font-semibold text-gray-900">{quantity}</span>
                      <button
                        onClick={() => setQuantity((previous) => Math.min(maxQuantity, previous + 1))}
                        className="px-3 py-2 text-gray-600 hover:bg-gray-50"
                        aria-label="Increase quantity"
                      >
                        <Plus size={16} />
                      </button>
                    </div>
                  ) : (
                    <p className="inline-flex rounded-lg border border-gray-200 bg-gray-50 px-4 py-2 text-sm font-medium text-gray-600">
                      1 unique item only
                    </p>
                  )}
                </div>

                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <button
                    onClick={handleAddToCart}
                    disabled={inCart || availableStock <= 0 || (isAquaponics&&product.lettuceStockModel!=='quantity')}
                    className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-600"
                  >
                    <ShoppingCart size={16} />
                    {inCart ? "Added to cart" : availableStock > 0 ? "Add to Cart" : "Out of Stock"}
                  </button>
                  {addedMessage && <p className="text-sm font-semibold text-emerald-700">{addedMessage}</p>}
                </div>
              </>
            )}
          </div>
          </div>
        </section>
      </div>
    </div>
  );
}
