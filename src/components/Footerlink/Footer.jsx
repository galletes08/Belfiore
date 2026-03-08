import { Facebook, Globe, Instagram, Mail, MapPin, Phone } from "lucide-react";
import { Link } from "react-router-dom";
import logoImage from "../../assets/Logo.png";

const quickLinks = [
  { label: "Home", to: "/" },
  { label: "Products", to: "/products" },
  { label: "About Us", to: "/about" },
  { label: "Contact", to: "/contact" }
];

const accountLinks = [
  { label: "Sign Up", to: "/signup" },
  { label: "Login", to: "/login" },
  { label: "Dashboard", to: "/dashboard" },
  { label: "My Orders", to: "/orders" }
];

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-auto border-t border-emerald-100 bg-[linear-gradient(180deg,#123629_0%,#0d2b20_100%)] text-emerald-50">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <section className="mb-8 grid gap-4 rounded-2xl border border-emerald-900/60 bg-emerald-900/20 p-5 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-200">Join Belfiore Community</p>
            <h2 className="mt-2 text-xl font-bold text-white">Get first access to new plant drops and restocks</h2>
            <p className="mt-1 text-sm text-emerald-100/90">Perfect for collectors who do not want to miss rare tags.</p>
          </div>

          <Link
            to="/signup"
            className="inline-flex items-center justify-center rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-400"
          >
            Sign Up Now
          </Link>
        </section>

        <section className="grid gap-8 md:grid-cols-2 xl:grid-cols-4">
          <article>
            <img src={logoImage} alt="Belfiore Succulents PH logo" className="h-16 w-auto object-contain" />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-emerald-100/90">
              Belfiore Succulents PH delivers healthy, hand-picked plants for every kind of plant lover.
            </p>
          </article>

          <article>
            <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-200">Quick Links</h3>
            <div className="mt-4 flex flex-col gap-2 text-sm">
              {quickLinks.map((link) => (
                <Link key={link.to} to={link.to} className="text-emerald-50/90 transition hover:text-white">
                  {link.label}
                </Link>
              ))}
            </div>
          </article>

          <article>
            <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-200">Account</h3>
            <div className="mt-4 flex flex-col gap-2 text-sm">
              {accountLinks.map((link) => (
                <Link key={link.to} to={link.to} className="text-emerald-50/90 transition hover:text-white">
                  {link.label}
                </Link>
              ))}
            </div>
          </article>

          <article>
            <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-200">Contact</h3>
            <div className="mt-4 space-y-3 text-sm text-emerald-50/90">
              <p className="flex items-start gap-2">
                <MapPin size={16} className="mt-0.5 text-emerald-200" />
                Brgy. Palo-Alto, Calamba City, Laguna, Philippines
              </p>
              <p className="flex items-center gap-2">
                <Phone size={16} className="text-emerald-200" />
                0976 197 2581
              </p>
              <p className="flex items-center gap-2">
                <Mail size={16} className="text-emerald-200" />
                hello@belfioresucculents.ph
              </p>
            </div>

            <div className="mt-4 flex items-center gap-3">
              <a href="#" aria-label="Instagram" className="rounded-full border border-emerald-300/40 p-2 hover:bg-emerald-700/50">
                <Instagram size={16} />
              </a>
              <a href="#" aria-label="Website" className="rounded-full border border-emerald-300/40 p-2 hover:bg-emerald-700/50">
                <Globe size={16} />
              </a>
              <a href="#" aria-label="Facebook" className="rounded-full border border-emerald-300/40 p-2 hover:bg-emerald-700/50">
                <Facebook size={16} />
              </a>
            </div>
          </article>
        </section>

        <div className="mt-10 border-t border-emerald-900/70 pt-4 text-center text-xs text-emerald-200/90">
          (c) {year} Belfiore Succulents PH. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
