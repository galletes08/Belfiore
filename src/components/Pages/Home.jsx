import { Link } from "react-router-dom";
import { ArrowRight, CreditCard, Headset, Leaf, ShieldCheck, Truck } from "lucide-react";
import { productsData } from "../../data/productsData";
import awardImage from "../../assets/Award.jpg";
import blogImage from "../../assets/Blog.png";
import plantsImage from "../../assets/Plants.jpg";

const serviceHighlights = [
  {
    icon: Truck,
    title: "Personally Delivered",
    description: "Our team handles shipping with careful packing so your plants arrive in healthy condition."
  },
  {
    icon: Leaf,
    title: "Affordable Quality",
    description: "From rare tags to everyday varieties, we keep quality high and prices fair."
  },
  {
    icon: Headset,
    title: "Live Plant Support",
    description: "Need care guidance or order updates? We are ready to help during store hours."
  },
  {
    icon: CreditCard,
    title: "Secure Payments",
    description: "Pay with trusted channels and get clear order tracking after checkout."
  }
];

const collectionCards = [
  { key: "white", label: "White Tags", image: awardImage, accent: "text-gray-700", bg: "bg-gray-100" },
  { key: "green", label: "Green Tags", image: plantsImage, accent: "text-emerald-700", bg: "bg-emerald-100" },
  { key: "red", label: "Red Tags", image: blogImage, accent: "text-rose-700", bg: "bg-rose-100" },
  { key: "aquaponics", label: "Aquaponics", image: plantsImage, accent: "text-amber-700", bg: "bg-amber-100" }
];

const featuredProducts = productsData.filter((item) => item.tag === "red").slice(0, 4);
const featuredImages = [plantsImage, awardImage, blogImage, plantsImage];

const normalizeTag = (tag) => {
  const normalizedTag = String(tag || "").trim().toLowerCase();
  if (normalizedTag === "others") return "aquaponics";
  return normalizedTag;
};

const getTagCount = (tag) => productsData.filter((item) => normalizeTag(item.tag) === tag).length;

export default function Home() {
  return (
    <div className="bg-[linear-gradient(180deg,#f5f8f4_0%,#ffffff_40%,#f4f7f3_100%)] text-gray-900">
      <section className="relative isolate overflow-hidden">
        <img src={blogImage} alt="Succulent collection showcase" className="h-[58vh] w-full object-cover md:h-[70vh]" />
        <div className="absolute inset-0 bg-[linear-gradient(115deg,rgba(6,78,59,0.82)_0%,rgba(6,95,70,0.58)_50%,rgba(0,0,0,0.35)_100%)]" />

        <div className="absolute left-1/2 top-1/2 mx-auto w-full max-w-6xl -translate-x-1/2 -translate-y-1/2 px-6">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-emerald-200">Belfiore Succulents PH</p>
          <h1 className="mt-4 max-w-3xl text-3xl font-bold leading-tight text-white md:text-5xl">
            Rare finds and classic favorites for every plant lover
          </h1>
          <p className="mt-4 max-w-2xl text-sm text-emerald-50 md:text-base">
            Build your collection with healthy succulents, careful delivery, and reliable support from our team.
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Link
              to="/products"
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
            >
              Shop Plants
              <ArrowRight size={16} />
            </Link>
            <Link
              to="/about"
              className="rounded-lg border border-white/40 bg-white/10 px-5 py-2.5 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/20"
            >
              Learn About Us
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-14">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {serviceHighlights.map((service) => {
            const Icon = service.icon;
            return (
              <article
                key={service.title}
                className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-md"
              >
                <div className="inline-flex rounded-xl bg-emerald-100 p-2.5 text-emerald-700">
                  <Icon size={18} />
                </div>
                <h2 className="mt-4 text-lg font-semibold text-gray-900">{service.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-gray-600">{service.description}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-14">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-emerald-700">Collections</p>
            <h2 className="mt-2 text-2xl font-bold text-gray-900 md:text-3xl">Browse by Tags</h2>
          </div>
          <Link to="/products" className="text-sm font-semibold text-emerald-700 hover:text-emerald-800">
            View all products
          </Link>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {collectionCards.map((collection) => (
            <article key={collection.key} className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
              <img src={collection.image} alt={collection.label} className="h-44 w-full object-cover" />
              <div className="p-4">
                <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${collection.bg} ${collection.accent}`}>
                  {collection.label}
                </span>
                <p className="mt-3 text-sm text-gray-600">
                  Available items: <span className="font-semibold text-gray-900">{getTagCount(collection.key)}</span>
                </p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-16">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-rose-600">Featured</p>
            <h2 className="mt-2 text-2xl font-bold text-gray-900 md:text-3xl">Rare Plant Red Tags</h2>
          </div>
          <Link to="/products" className="text-sm font-semibold text-rose-700 hover:text-rose-800">
            Explore red tags
          </Link>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {featuredProducts.map((product, index) => (
            <article
              key={product.id}
              className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-md"
            >
              <img src={featuredImages[index]} alt={product.name} className="h-44 w-full object-cover" />
              <div className="p-4">
                <p className="inline-flex rounded-full bg-rose-100 px-2.5 py-1 text-xs font-semibold text-rose-700">Red Tag</p>
                <h3 className="mt-3 text-base font-semibold text-gray-900">{product.name}</h3>
                <p className="mt-1 text-sm text-gray-500">{product.note}</p>
                <div className="mt-3 flex items-center justify-between">
                  <p className="font-semibold text-emerald-700">{product.price}</p>
                  <p className="text-xs text-gray-500">Stock: {product.stock}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="border-t border-emerald-100 bg-emerald-50/60">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-10 text-center md:flex-row md:text-left">
          <div>
            <p className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-700">
              <ShieldCheck size={16} />
              Trusted by plant lovers nationwide
            </p>
            <h2 className="mt-2 text-2xl font-bold text-gray-900">Ready to grow your plant collection?</h2>
          </div>

          <Link
            to="/products"
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800"
          >
            Start Shopping
            <ArrowRight size={16} />
          </Link>
        </div>
      </section>
    </div>
  );
}
