export default function AboutSection() {
  return (
    <section className="max-w-6xl mx-auto px-6 py-12" id="about">
      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <div className="rounded-3xl border border-[#e1e7dc] bg-white p-8">
          <p className="text-xs uppercase tracking-[0.35em] text-[#5e6f65] font-['Montserrat']">About Us</p>
          <h2 className="mt-3 text-3xl sm:text-4xl font-['Playfair_Display'] text-[#0f4d2e]">
            Rooted in Calamba, growing for every home.
          </h2>
          <p className="mt-4 text-sm sm:text-base text-[#5e6f65]">
            Belfiore Succulents PH sources healthy, low-maintenance plants and pairs them with handcrafted planters. Every
            item is inspected before dispatch so your shelf stays lush.
          </p>
        </div>
        <div className="rounded-3xl border border-[#e1e7dc] bg-[#0f4d2e] p-8 text-white">
          <p className="text-xs uppercase tracking-[0.35em] text-white/70 font-['Montserrat']">What we do</p>
          <ul className="mt-4 space-y-3 text-sm sm:text-base">
            <li>Weekly greenhouse drops.</li>
            <li>Curated sets for gifting.</li>
            <li>Care tips included in every order.</li>
          </ul>
        </div>
      </div>
    </section>
  );
}
