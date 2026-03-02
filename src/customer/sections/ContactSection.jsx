export default function ContactSection() {
  return (
    <section className="max-w-6xl mx-auto px-6 py-12" id="contact">
      <div className="rounded-3xl border border-[#e1e7dc] bg-white p-8">
        <p className="text-xs uppercase tracking-[0.35em] text-[#5e6f65] font-['Montserrat']">Contact</p>
        <h2 className="mt-3 text-3xl sm:text-4xl font-['Playfair_Display'] text-[#0f4d2e]">
          Let us help you choose the right plant.
        </h2>
        <div className="mt-6 grid gap-6 md:grid-cols-3 text-sm text-[#5e6f65]">
          <div>
            <p className="uppercase tracking-[0.2em] text-xs font-['Montserrat'] text-[#9aa69a]">Address</p>
            <p className="mt-2">Brgy. Palo-Alto, Calamba City, Laguna, Philippines, 2028</p>
          </div>
          <div>
            <p className="uppercase tracking-[0.2em] text-xs font-['Montserrat'] text-[#9aa69a]">Phone</p>
            <p className="mt-2">0976 197 2581</p>
          </div>
          <div>
            <p className="uppercase tracking-[0.2em] text-xs font-['Montserrat'] text-[#9aa69a]">Email</p>
            <p className="mt-2">hello@belfiore.ph</p>
          </div>
        </div>
      </div>
    </section>
  );
}
