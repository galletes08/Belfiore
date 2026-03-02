export default function ProfilePage() {
  return (
    <section className="max-w-6xl mx-auto px-6 py-12">
      <div className="rounded-3xl border border-[#e1e7dc] bg-white p-8">
        <p className="text-xs uppercase tracking-[0.35em] text-[#5e6f65] font-['Montserrat']">User Profile</p>
        <h2 className="mt-3 text-3xl sm:text-4xl font-['Playfair_Display'] text-[#0f4d2e]">My account</h2>
        <p className="mt-4 text-sm sm:text-base text-[#5e6f65]">
          This is your profile page. You can add account details and order history here.
        </p>
      </div>
    </section>
  );
}
