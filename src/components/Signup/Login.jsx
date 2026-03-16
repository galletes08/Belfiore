import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { KeyRound, Leaf, Mail } from "lucide-react";
import { apiLogin, clearCustomerToken, setCustomerToken, setCustomerUser } from "../../api/client";

export default function LoginPage() {
  const navigate = useNavigate();
  const [formValues, setFormValues] = useState({
    email: "",
    password: ""
  });
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (field, value) => {
    setFormValues((previous) => ({
      ...previous,
      [field]: value
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setErrorMessage("");
    setIsSubmitting(true);

    try {
      const response = await apiLogin(formValues.email, formValues.password);
      const fullName = response.user?.name || [response.user?.firstName, response.user?.lastName].filter(Boolean).join(" ");

      clearCustomerToken();

      if (fullName) {
        localStorage.setItem("customerName", fullName);
      }
      localStorage.setItem("customerEmail", response.user?.email || formValues.email);
      localStorage.setItem("isLoggedIn", "true");
      if (response.token) {
        setCustomerToken(response.token);
      }
      setCustomerUser(response.user || null);
      navigate("/dashboard");
    } catch (error) {
      setErrorMessage(error.message || "Login failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-[linear-gradient(180deg,#f3f8f3_0%,#ffffff_40%,#f4f7f3_100%)] px-6 py-10">
      <div className="mx-auto grid min-h-[72vh] max-w-6xl overflow-hidden rounded-3xl border border-emerald-100 bg-white shadow-sm lg:grid-cols-[0.95fr_1.05fr]">
        <aside className="hidden bg-[linear-gradient(145deg,#0f766e_0%,#047857_45%,#065f46_100%)] p-8 text-white lg:block">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-emerald-100">Welcome Back</p>
          <h1 className="mt-4 text-4xl font-bold leading-tight">
            Login to manage
            <br />
            your plant orders
          </h1>
          <p className="mt-4 max-w-sm text-sm text-emerald-50/90">
            Access your dashboard, view order updates, and continue shopping from where you left off.
          </p>

          <div className="mt-8 rounded-2xl border border-emerald-300/30 bg-emerald-950/20 p-4">
            <p className="inline-flex items-center gap-2 text-sm font-semibold">
              <Leaf size={16} />
              Belfiore Succulents PH
            </p>
            <p className="mt-2 text-sm text-emerald-50/85">Secure sign-in with a cleaner and faster account flow.</p>
          </div>
        </aside>

        <main className="p-6 sm:p-8 md:p-10">
          <h2 className="text-3xl font-bold text-gray-900">Login</h2>
          <p className="mt-2 text-sm text-gray-600">Sign in to continue to your account.</p>

          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            <label className="text-sm">
              <span className="mb-1 block text-gray-600">Email Address</span>
              <div className="relative">
                <Mail size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="email"
                  value={formValues.email}
                  onChange={(event) => handleChange("email", event.target.value)}
                  className="w-full rounded-xl border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 outline-none ring-emerald-200 focus:ring-2"
                  required
                />
              </div>
            </label>

            <label className="text-sm">
              <span className="mb-1 block text-gray-600">Password</span>
              <div className="relative">
                <KeyRound size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="password"
                  value={formValues.password}
                  onChange={(event) => handleChange("password", event.target.value)}
                  className="w-full rounded-xl border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 outline-none ring-emerald-200 focus:ring-2"
                  required
                />
              </div>
            </label>

            {errorMessage && <p className="text-sm font-medium text-rose-600">{errorMessage}</p>}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-xl bg-emerald-700 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800"
            >
              {isSubmitting ? "Signing In..." : "Sign In"}
            </button>
          </form>

          <div className="mt-5 space-y-2 text-sm">
            <p className="text-gray-600">
              Do not have an account?{" "}
              <Link to="/signup" className="font-semibold text-emerald-700 hover:text-emerald-800">
                Create one
              </Link>
            </p>
            <Link to="/forgot-password" className="text-gray-500 hover:text-gray-700">
              Forgot your password?
            </Link>
          </div>
        </main>
      </div>
    </div>
  );
}
