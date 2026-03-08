import { Link } from "react-router-dom";
import { HeartHandshake, Leaf, ShieldCheck, Sprout, Truck } from "lucide-react";
import awardImage from "../../assets/Award.jpg";
import blogImage from "../../assets/Blog.png";
import plantsImage from "../../assets/Plants.jpg";

const values = [
  {
    icon: Leaf,
    title: "Healthy Plant Quality",
    description: "Every plant is checked for roots, leaf health, and freshness before it reaches your cart."
  },
  {
    icon: Truck,
    title: "Careful Delivery",
    description: "Our packing process is built to protect delicate leaves and stems from pickup to drop-off."
  },
  {
    icon: ShieldCheck,
    title: "Trusted Transactions",
    description: "Clear prices, clear status updates, and reliable support for every order."
  },
  {
    icon: HeartHandshake,
    title: "Customer Care",
    description: "We guide beginners and collectors with practical tips for long-term plant care."
  }
];

export default function About() {
  return (
    <div className="bg-[linear-gradient(180deg,#f3f7f2_0%,#ffffff_40%,#f4f7f3_100%)] text-gray-900">
      <section className="relative isolate overflow-hidden">
        <img src={blogImage} alt="Belfiore Succulents collection" className="h-[48vh] w-full object-cover md:h-[58vh]" />
        <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(6,78,59,0.82)_0%,rgba(6,95,70,0.56)_50%,rgba(0,0,0,0.35)_100%)]" />
        <div className="absolute left-1/2 top-1/2 mx-auto w-full max-w-6xl -translate-x-1/2 -translate-y-1/2 px-6">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-200">About Us</p>
          <h1 className="mt-3 max-w-3xl text-3xl font-bold leading-tight text-white md:text-5xl">
            Growing spaces with rare succulents and everyday favorites
          </h1>
          <p className="mt-4 max-w-2xl text-sm text-emerald-50 md:text-base">
            Belfiore Succulents PH helps plant lovers build collections that are beautiful, healthy, and easy to care for.
          </p>
        </div>
      </section>

      <main className="mx-auto max-w-6xl space-y-16 px-6 py-14">
        <section className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          <article className="rounded-3xl border border-emerald-100 bg-white p-7 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-emerald-700">Our Story</p>
            <h2 className="mt-3 text-2xl font-bold text-gray-900 md:text-3xl">From simple hobby to trusted plant shop</h2>
            <div className="mt-4 space-y-4 text-sm leading-relaxed text-gray-600">
              <p>
                Belfiore started with a small home collection and a goal: make quality succulents accessible to more Filipino plant enthusiasts.
              </p>
              <p>
                Today, we focus on curated varieties, fair pricing, and dependable service so every customer can grow with confidence.
              </p>
              <p>
                Whether you are a first-time buyer or a long-time collector, we want every order to feel personal and worth keeping.
              </p>
            </div>
          </article>

          <article className="overflow-hidden rounded-3xl border border-white bg-white shadow-sm">
            <img src={awardImage} alt="Belfiore recognition and achievements" className="h-full min-h-[340px] w-full object-cover" />
          </article>
        </section>

        <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {values.map((value) => {
            const Icon = value.icon;
            return (
              <article
                key={value.title}
                className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-md"
              >
                <div className="inline-flex rounded-xl bg-emerald-100 p-2.5 text-emerald-700">
                  <Icon size={18} />
                </div>
                <h3 className="mt-4 text-lg font-semibold text-gray-900">{value.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-600">{value.description}</p>
              </article>
            );
          })}
        </section>

        <section className="grid gap-8 rounded-3xl border border-emerald-100 bg-white p-6 shadow-sm md:grid-cols-[0.9fr_1.1fr] md:p-8">
          <div className="overflow-hidden rounded-2xl">
            <img src={plantsImage} alt="Rows of healthy succulents inside greenhouse" className="h-full w-full object-cover" />
          </div>

          <div className="flex flex-col justify-center">
            <p className="inline-flex w-fit items-center gap-2 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
              <Sprout size={14} />
              Our Commitment
            </p>
            <h2 className="mt-3 text-2xl font-bold text-gray-900 md:text-3xl">Plants that thrive beyond checkout</h2>
            <p className="mt-4 text-sm leading-relaxed text-gray-600">
              We do not just sell plants. We help you keep them alive and thriving through practical care guidance, responsive customer support, and careful order handling.
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link
                to="/products"
                className="rounded-lg bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800"
              >
                Explore Products
              </Link>
              <Link
                to="/contact"
                className="rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
              >
                Contact Us
              </Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
