import { Link } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { getImageUrl } from '../../api/client';

const PROFILE_STORAGE_KEY = 'customerProfile';

function getStoredCustomerDetails() {
  try {
    const rawProfile = localStorage.getItem(PROFILE_STORAGE_KEY);
    const profile = rawProfile ? JSON.parse(rawProfile) : {};

    return {
      fullName: String(profile?.name || localStorage.getItem('customerName') || '').trim(),
      gmail: String(profile?.email || localStorage.getItem('customerEmail') || '').trim(),
      mobileNumber: String(profile?.phone || localStorage.getItem('customerPhone') || '').trim(),
      location: '',
      paymentMethod: 'COD',
    };
  } catch {
    return {
      fullName: String(localStorage.getItem('customerName') || '').trim(),
      gmail: String(localStorage.getItem('customerEmail') || '').trim(),
      mobileNumber: String(localStorage.getItem('customerPhone') || '').trim(),
      location: '',
      paymentMethod: 'COD',
    };
  }
}

export default function CheckoutSection({ items, total, formatPrice, onOrderPlaced, onPlaceOrder }) {
  const [form, setForm] = useState(getStoredCustomerDetails);
  const [errors, setErrors] = useState({});
  const [confirmation, setConfirmation] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const totalItems = useMemo(
    () => items.reduce((count, item) => count + Number(item.qty || 0), 0),
    [items]
  );

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      ...getStoredCustomerDetails(),
      location: prev.location,
      paymentMethod: prev.paymentMethod,
    }));
  }, []);

  function resolveItemImage(item) {
    if (item.image) return item.image;
    return getImageUrl(item.imageUrl);
  }

  function handleChange(event) {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (items.length === 0) {
      setConfirmation({
        type: 'error',
        message: 'Your cart is empty. Add items before checking out.',
      });
      return;
    }

    const nextErrors = {};
    if (!form.fullName.trim()) nextErrors.fullName = 'Full name is required.';
    if (!form.gmail.trim()) {
      nextErrors.gmail = 'Gmail is required.';
    } else if (!/^[^\s@]+@gmail\.com$/i.test(form.gmail.trim())) {
      nextErrors.gmail = 'Enter a valid Gmail address (example@gmail.com).';
    }
    if (!form.mobileNumber.trim()) {
      nextErrors.mobileNumber = 'Mobile number is required.';
    } else if (!/^[0-9+\-\s()]{7,15}$/.test(form.mobileNumber.trim())) {
      nextErrors.mobileNumber = 'Enter a valid mobile number.';
    }
    if (!form.location.trim()) nextErrors.location = 'Location is required.';
    if (!form.paymentMethod) nextErrors.paymentMethod = 'Please select a payment method.';

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    try {
      setIsSubmitting(true);
      const order = await onPlaceOrder({
        fullName: form.fullName.trim(),
        gmail: form.gmail.trim(),
        mobileNumber: form.mobileNumber.trim(),
        location: form.location.trim(),
        paymentMethod: form.paymentMethod,
        items: items.map((item) => ({ id: item.id, qty: item.qty })),
      });

      const reference = `BF-${String(order.id).padStart(6, '0')}`;
      const paymentText =
        form.paymentMethod === 'COD'
          ? 'Cash on Delivery selected. Please prepare exact amount on delivery.'
          : 'Online Payment selected. Payment instructions will be sent to you.';

      setConfirmation({
        type: 'success',
        message: `Order placed successfully. Reference: ${reference}. ${paymentText}`,
      });
      onOrderPlaced(order);
      setForm((prev) => ({
        ...getStoredCustomerDetails(),
        location: '',
        paymentMethod: prev.paymentMethod,
      }));
      setErrors({});
    } catch (error) {
      setConfirmation({
        type: 'error',
        message: error?.message || 'Failed to place order. Please try again.',
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="max-w-6xl mx-auto px-6 py-12" id="checkout">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-[#5e6f65] font-['Montserrat']">Checkout</p>
          <h2 className="mt-3 text-3xl sm:text-4xl font-['Playfair_Display'] text-[#0f4d2e]">
            Complete your order
          </h2>
        </div>
        <div className="rounded-full border border-[#d8dfd3] px-5 py-2 text-xs uppercase tracking-[0.3em] text-[#5e6f65]">
          {totalItems} item{totalItems === 1 ? '' : 's'}
        </div>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[2fr_1fr]">
        <form className="rounded-2xl border border-[#e1e7dc] bg-white p-6 sm:p-8 space-y-6" onSubmit={handleSubmit}>
          <div className="rounded-2xl border border-[#e7ede3] bg-[#f8fbf6] p-5">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-lg font-['Playfair_Display'] text-[#0f4d2e]">Personal details</h3>
                <p className="text-sm text-[#5e6f65]">Your saved account name and Gmail are filled in automatically.</p>
              </div>
              <span className="text-xs uppercase tracking-[0.28em] text-[#7b867d]">Editable before checkout</span>
            </div>

            <div className="mt-5 grid gap-5 md:grid-cols-2">
              <div>
                <label htmlFor="fullName" className="block text-sm text-[#1f2f28] mb-2">
                  Full Name
                </label>
                <input
                  id="fullName"
                  name="fullName"
                  type="text"
                  value={form.fullName}
                  onChange={handleChange}
                  className="w-full rounded-xl border border-[#d8dfd3] bg-white px-4 py-3 text-sm outline-none focus:border-[#0b7a3c] focus:ring-2 focus:ring-[#0b7a3c]/20"
                  placeholder="Juan Dela Cruz"
                />
                {errors.fullName ? <p className="mt-2 text-sm text-[#8b4a4a]">{errors.fullName}</p> : null}
              </div>

              <div>
                <label htmlFor="gmail" className="block text-sm text-[#1f2f28] mb-2">
                  Gmail
                </label>
                <input
                  id="gmail"
                  name="gmail"
                  type="email"
                  value={form.gmail}
                  onChange={handleChange}
                  className="w-full rounded-xl border border-[#d8dfd3] bg-white px-4 py-3 text-sm outline-none focus:border-[#0b7a3c] focus:ring-2 focus:ring-[#0b7a3c]/20"
                  placeholder="yourname@gmail.com"
                />
                {errors.gmail ? <p className="mt-2 text-sm text-[#8b4a4a]">{errors.gmail}</p> : null}
              </div>

              <div>
                <label htmlFor="mobileNumber" className="block text-sm text-[#1f2f28] mb-2">
                  Mobile Number
                </label>
                <input
                  id="mobileNumber"
                  name="mobileNumber"
                  type="tel"
                  value={form.mobileNumber}
                  onChange={handleChange}
                  className="w-full rounded-xl border border-[#d8dfd3] bg-white px-4 py-3 text-sm outline-none focus:border-[#0b7a3c] focus:ring-2 focus:ring-[#0b7a3c]/20"
                  placeholder="09XXXXXXXXX"
                />
                {errors.mobileNumber ? <p className="mt-2 text-sm text-[#8b4a4a]">{errors.mobileNumber}</p> : null}
              </div>

              <div className="md:col-span-2">
                <label htmlFor="location" className="block text-sm text-[#1f2f28] mb-2">
                  Delivery Location
                </label>
                <textarea
                  id="location"
                  name="location"
                  value={form.location}
                  onChange={handleChange}
                  rows={4}
                  className="w-full rounded-xl border border-[#d8dfd3] bg-white px-4 py-3 text-sm outline-none focus:border-[#0b7a3c] focus:ring-2 focus:ring-[#0b7a3c]/20"
                  placeholder="House number, street, barangay, city, province"
                />
                {errors.location ? <p className="mt-2 text-sm text-[#8b4a4a]">{errors.location}</p> : null}
              </div>
            </div>
          </div>

          <fieldset>
            <legend className="block text-sm text-[#1f2f28] mb-3">Payment Method</legend>
            <div className="space-y-3">
              <label className="flex items-center gap-3 rounded-xl border border-[#d8dfd3] p-4 cursor-pointer">
                <input
                  type="radio"
                  name="paymentMethod"
                  value="COD"
                  checked={form.paymentMethod === 'COD'}
                  onChange={handleChange}
                  className="h-4 w-4 accent-[#0b7a3c]"
                />
                <span className="text-sm text-[#1f2f28]">Cash on Delivery (COD)</span>
              </label>
              <label className="flex items-center gap-3 rounded-xl border border-[#d8dfd3] p-4 cursor-pointer">
                <input
                  type="radio"
                  name="paymentMethod"
                  value="ONLINE"
                  checked={form.paymentMethod === 'ONLINE'}
                  onChange={handleChange}
                  className="h-4 w-4 accent-[#0b7a3c]"
                />
                <span className="text-sm text-[#1f2f28]">Online Payment</span>
              </label>
            </div>
            {errors.paymentMethod ? <p className="mt-2 text-sm text-[#8b4a4a]">{errors.paymentMethod}</p> : null}
          </fieldset>

          <button
            className="w-full rounded-full border border-[#0b7a3c] bg-[#0b7a3c] py-3 text-xs uppercase tracking-[0.35em] text-white transition hover:bg-[#0d6a35] disabled:cursor-not-allowed disabled:border-[#95a29b] disabled:bg-[#95a29b]"
            type="submit"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Placing Order...' : 'Place Order'}
          </button>

          {confirmation ? (
            <p className={`text-sm ${confirmation.type === 'success' ? 'text-[#0f4d2e]' : 'text-[#8b4a4a]'}`}>
              {confirmation.message}
            </p>
          ) : null}
        </form>

        <aside className="rounded-2xl border border-[#e1e7dc] bg-white p-6 h-fit">
          <h3 className="text-lg font-['Playfair_Display'] text-[#0f4d2e]">Order Summary</h3>

          <div className="mt-5 space-y-3">
            {items.length === 0 ? (
              <p className="text-sm text-[#5e6f65]">Your cart is empty.</p>
            ) : (
              items.map((item) => (
                <div key={item.id} className="flex items-start justify-between gap-4 text-sm">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="h-12 w-12 overflow-hidden rounded-lg bg-[#eef2ea] shrink-0">
                      {resolveItemImage(item) ? (
                        <img
                          src={resolveItemImage(item)}
                          alt={item.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="h-full w-full bg-gradient-to-br from-[#e9efe6] via-[#f4f6f0] to-[#dce5d9]" />
                      )}
                    </div>
                    <div className="text-[#1f2f28] min-w-0">
                      <p className="truncate">{item.name}</p>
                      <p className="text-xs text-[#5e6f65]">Qty: {item.qty}</p>
                    </div>
                  </div>
                  <span className="text-[#0f4d2e] font-medium">{formatPrice(item.price * item.qty)}</span>
                </div>
              ))
            )}
          </div>

          <div className="mt-6 border-t border-[#e1e7dc] pt-4">
            <div className="flex items-center justify-between text-sm text-[#5e6f65]">
              <span>Total</span>
              <span className="font-semibold text-[#0f4d2e]">{formatPrice(total)}</span>
            </div>
            <Link
              to="/cart"
              className="mt-4 inline-flex w-full items-center justify-center rounded-full border border-[#d8dfd3] py-3 text-xs uppercase tracking-[0.25em] text-[#1f2f28] hover:border-[#0b7a3c] hover:text-[#0b7a3c]"
            >
              Back to Cart
            </Link>
          </div>
        </aside>
      </div>
    </section>
  );
}
