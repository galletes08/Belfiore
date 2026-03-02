export default function HomeSection() {
  return (
    <section className="max-w-6xl mx-auto px-6 py-12" id="home-intro">
      <div className="rounded-3xl border border-[#e1e7dc] bg-white/80 px-8 py-10 shadow-[0_30px_60px_rgba(15,77,46,0.08)]">
        <p className="text-xs uppercase tracking-[0.35em] text-[#5e6f65] font-['Montserrat']">Customer Page</p>
        <h2 className="mt-3 text-3xl sm:text-4xl font-['Playfair_Display'] text-[#0f4d2e]">
          A calm, curated space for your next plant.
        </h2>
        <p className="mt-3 max-w-2xl text-sm sm:text-base text-[#5e6f65]">
          Browse our greenhouse picks, build your cart, and review everything in one place before checkout. Fresh stock is
          updated by the Belfiore team.
        </p>
      </div>
    </section>
  );
}
