import { useState } from "react";
import { Link } from "react-router-dom";
import { KeyRound, Mail } from "lucide-react";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (event) => {
    event.preventDefault();
    setSubmitted(true);
  };

  return (
    <div className="bg-[linear-gradient(180deg,#f3f8f3_0%,#ffffff_40%,#f4f7f3_100%)] px-6 py-10">
      <div className="mx-auto grid min-h-[72vh] max-w-6xl overflow-hidden rounded-3xl border border-emerald-100 bg-white shadow-sm lg:grid-cols-[0.95fr_1.05fr]">
        <aside className="hidden bg-[linear-gradient(145deg,#0f766e_0%,#047857_45%,#065f46_100%)] p-8 text-white lg:block">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-emerald-100">Account Recovery</p>
          <h1 className="mt-4 text-4xl font-bold leading-tight">
            Forgot your
            <br />
            password?
          </h1>
          <p className="mt-4 max-w-sm text-sm text-emerald-50/90">
            Enter your email and we will send password reset instructions.
          </p>
        </aside>

        <main className="p-6 sm:p-8 md:p-10">
          <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
            <KeyRound size={14} />
            Reset Password
          </p>
          <h2 className="mt-2 text-3xl font-bold text-gray-900">Forgot Password</h2>
          <p className="mt-2 text-sm text-gray-600">Input your email address, then click submit.</p>

          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            <label className="text-sm">
              <span className="mb-1 block text-gray-600">Email Address</span>
              <div className="relative mb-3">
                <Mail size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="w-full rounded-xl border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 outline-none ring-emerald-200 focus:ring-2"
                  required
                />
              </div>
            </label>

            <button
              type="submit"
              className="w-full rounded-xl bg-emerald-700 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800"
            >
              Submit
            </button>
          </form>

          {submitted && (
            <p className="mt-4 text-sm font-medium text-emerald-700">
              If this email exists, password reset instructions have been sent.
            </p>
          )}

          <p className="mt-5 text-sm text-gray-600">
            Remember your password?{" "}
            <Link to="/login" className="font-semibold text-emerald-700 hover:text-emerald-800">
              Back to login
            </Link>
          </p>
        </main>
      </div>
    </div>
  );
}
