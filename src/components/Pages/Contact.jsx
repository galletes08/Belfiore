import { Clock3, Mail, MapPin, MessageCircle, Phone, Send } from "lucide-react";

const contactCards = [
  {
    icon: MapPin,
    title: "Visit Us",
    value: "Brgy. Palo-Alto, Calamba City, Laguna, Philippines"
  },
  {
    icon: Mail,
    title: "Email",
    value: "belfioresucculentsph@gmail.com"
  },
  {
    icon: Phone,
    title: "Phone",
    value: "0976 197 2581"
  },
  {
    icon: MessageCircle,
    title: "Facebook",
    value: "Belfiore Succulents PH"
  }
];

export default function ContactSection() {
  return (
    <div className="bg-[linear-gradient(180deg,#f3f8f3_0%,#ffffff_42%,#f4f7f3_100%)] text-gray-900">
      <section className="border-b border-emerald-100 bg-[radial-gradient(circle_at_top_right,#bbf7d0_0%,#ecfdf5_35%,#f8fafc_75%)]">
        <div className="mx-auto max-w-6xl px-6 py-12">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700">Contact Us</p>
          <h1 className="mt-3 text-3xl font-bold md:text-4xl">We are here to help your plant journey</h1>
          <p className="mt-3 max-w-2xl text-sm text-gray-600 md:text-base">
            Questions about orders, deliveries, or plant care? Reach out and our team will get back to you as soon as possible.
          </p>
        </div>
      </section>

      <main className="mx-auto max-w-6xl space-y-8 px-6 py-10">
        <section className="grid gap-6 lg:grid-cols-[1fr_1.15fr]">
          <article className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="text-xl font-semibold text-gray-900">Get in touch</h2>
            <p className="mt-2 text-sm text-gray-600">Choose your preferred channel and we will assist you quickly.</p>

            <div className="mt-5 grid gap-3">
              {contactCards.map((item) => {
                const Icon = item.icon;
                const isEmail = item.title === "Email";

                return (
                  <div key={item.title} className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-4">
                    <p className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
                      <Icon size={16} />
                      {item.title}
                    </p>
                    {isEmail ? (
                      <a
                        href={`mailto:${item.value}`}
                        className="mt-1 inline-block text-sm text-gray-700 underline decoration-1 underline-offset-2"
                      >
                        {item.value}
                      </a>
                    ) : (
                      <p className="mt-1 text-sm text-gray-700">{item.value}</p>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="mt-5 rounded-xl border border-gray-200 bg-gray-50 p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                <Clock3 size={16} className="text-emerald-700" />
                Support Hours
              </p>
              <p className="mt-1 text-sm text-gray-600">Monday to Saturday, 9:00 AM to 5:00 PM</p>
            </div>
          </article>

          <article className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="text-xl font-semibold text-gray-900">Send us a message</h2>
            <p className="mt-2 text-sm text-gray-600">
              Fill out the form and include your order details for faster support.
            </p>

            <form className="mt-5 grid gap-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm">
                  <span className="mb-1 block text-gray-600">Complete Name</span>
                  <input
                    type="text"
                    placeholder="Juan Dela Cruz"
                    className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none ring-emerald-200 focus:ring-2"
                  />
                </label>

                <label className="text-sm">
                  <span className="mb-1 block text-gray-600">Phone Number</span>
                  <input
                    type="tel"
                    placeholder="09XX XXX XXXX"
                    className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none ring-emerald-200 focus:ring-2"
                  />
                </label>
              </div>

              <label className="text-sm">
                <span className="mb-1 block text-gray-600">Email Address</span>
                <input
                  type="email"
                  placeholder="you@email.com"
                  className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none ring-emerald-200 focus:ring-2"
                />
              </label>

              <label className="text-sm">
                <span className="mb-1 block text-gray-600">Subject</span>
                <input
                  type="text"
                  placeholder="Order inquiry / Plant care question"
                  className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none ring-emerald-200 focus:ring-2"
                />
              </label>

              <label className="text-sm">
                <span className="mb-1 block text-gray-600">Message</span>
                <textarea
                  rows={6}
                  placeholder="Type your message here..."
                  className="w-full resize-none rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none ring-emerald-200 focus:ring-2"
                />
              </label>

              <button
                type="submit"
                className="mt-1 inline-flex w-fit items-center gap-2 rounded-lg bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800"
              >
                <Send size={16} />
                Send Message
              </button>
            </form>
          </article>
        </section>

        <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          <iframe
            title="Belfiore Succulents Location"
            src="https://www.google.com/maps?q=Idoy+Robles+Farm,+Calamba+City,+Laguna,+Philippines&output=embed"
            className="h-80 w-full md:h-96"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
          <div className="flex justify-end border-t border-gray-100 px-4 py-3">
            <a
              href="https://www.google.com/maps/search/?api=1&query=Idoy+Robles+Farm+Calamba+City+Laguna+Philippines"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-semibold text-emerald-700 hover:text-emerald-800"
            >
              Open in Google Maps
            </a>
          </div>
        </section>
      </main>
    </div>
  );
}
