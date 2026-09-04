import { useState } from "react";
import { CreditCard, KeyRound, ShieldCheck } from "lucide-react";
import { apiChangePassword, clearCustomerToken } from "../../api/client";
import AccountSidebar from "./AccountSidebar";

const fieldClass = "mt-2 w-full rounded-xl border border-[#dce5d8] bg-white px-4 py-3 text-sm text-[#173d2b] outline-none transition focus:border-[#0f6b45] focus:ring-4 focus:ring-[#d9ebdc]";

export default function AccountSettings({ section }) {
  const [passwords, setPasswords] = useState({ current: "", next: "", confirm: "" });
  const [message, setMessage] = useState("");
  const [messageIsError, setMessageIsError] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleLogout = () => {
    localStorage.removeItem("isLoggedIn");
    clearCustomerToken();
  };

  const handlePasswordSubmit = async (event) => {
    event.preventDefault();
    setMessageIsError(true);

    if (passwords.next.length < 6) {
      setMessage("New password must be at least 6 characters.");
      return;
    }
    if (passwords.next !== passwords.confirm) {
      setMessage("New passwords do not match.");
      return;
    }

    setSaving(true);
    setMessage("");
    try {
      const result = await apiChangePassword(passwords.current, passwords.next);
      setPasswords({ current: "", next: "", confirm: "" });
      setMessageIsError(false);
      setMessage(result.message || "Password updated successfully.");
    } catch (error) {
      setMessageIsError(true);
      setMessage(error.message || "Unable to update password.");
    } finally {
      setSaving(false);
    }
  };

  const isCards = section === "cards";

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#f8faf6] font-['Montserrat'] text-[#24372d]">
      <div className="mx-auto grid w-full max-w-[1500px] grid-cols-1 gap-0 px-4 md:px-6 lg:grid-cols-[250px_minmax(0,1fr)]">
        <AccountSidebar onLogout={handleLogout} />

        <main className="min-w-0 space-y-6 py-6 lg:px-6">
          <section className="py-2">
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[#5e6f65]">My Account</p>
            <h1 className="mt-3 font-['Playfair_Display'] text-3xl leading-tight text-[#0f4d2e] md:text-4xl">
              {isCards ? "Bank & Cards" : "Change Password"}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[#5e6f65]">
              {isCards
                ? "Manage the payment methods connected to your Belfiore purchases."
                : "Use a strong, unique password to keep your account protected."}
            </p>
          </section>

          {isCards ? (
            <section className="rounded-[1.35rem] border border-[#e1e7dc] bg-white p-6 shadow-[0_18px_45px_rgba(15,77,46,0.06)]">
              <span className="grid h-12 w-12 place-items-center rounded-xl bg-[#e8f3ea] text-[#0f4d2e]">
                <CreditCard size={21} />
              </span>
              <h2 className="mt-5 text-xl font-semibold text-[#173d2b]">No saved banks or cards</h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-[#5e6f65]">
                Saved payment methods will appear here once secure card storage is enabled.
              </p>
              <div className="mt-6 rounded-2xl border border-[#e1e7dc] bg-[#fbfcf8] p-4 text-sm leading-6 text-[#405145]">
                For your security, card numbers are never stored directly in this browser.
              </div>
            </section>
          ) : (
            <form onSubmit={handlePasswordSubmit} className="max-w-2xl rounded-[1.35rem] border border-[#e1e7dc] bg-white p-6 shadow-[0_18px_45px_rgba(15,77,46,0.06)]">
              <div className="flex items-start gap-3 border-b border-[#eef2ea] pb-5">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#e8f3ea] text-[#0f4d2e]">
                  <ShieldCheck size={18} />
                </span>
                <div>
                  <h2 className="text-xl font-semibold text-[#173d2b]">Password security</h2>
                  <p className="mt-1 text-sm text-[#5e6f65]">Enter your current password before choosing a new one.</p>
                </div>
              </div>

              <div className="mt-6 grid gap-5">
                <label>
                  <span className="text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-[#6c786f]">Current Password</span>
                  <input type="password" required value={passwords.current} onChange={(event) => setPasswords({ ...passwords, current: event.target.value })} className={fieldClass} />
                </label>
                <label>
                  <span className="text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-[#6c786f]">New Password</span>
                  <input type="password" required value={passwords.next} onChange={(event) => setPasswords({ ...passwords, next: event.target.value })} className={fieldClass} />
                </label>
                <label>
                  <span className="text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-[#6c786f]">Confirm New Password</span>
                  <input type="password" required value={passwords.confirm} onChange={(event) => setPasswords({ ...passwords, confirm: event.target.value })} className={fieldClass} />
                </label>
              </div>

              <button type="submit" disabled={saving} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#0f4d2e] px-5 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-white transition hover:bg-[#173d2b] disabled:cursor-not-allowed disabled:opacity-60">
                <KeyRound size={15} />
                {saving ? "Updating..." : "Update Password"}
              </button>
              {message ? <p className={"mt-4 text-sm " + (messageIsError ? "text-red-600" : "text-emerald-700")}>{message}</p> : null}
            </form>
          )}
        </main>
      </div>
    </div>
  );
}