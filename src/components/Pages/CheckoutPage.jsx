import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { apiPlaceOrder } from "../../api/client";
import CheckoutSection from "../../customer/sections/CheckoutSection";

const formatPrice = (value) =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP"
  }).format(Number(value) || 0);

export default function CheckoutPage({ cartItems, onOrderPlaced }) {
  const navigate = useNavigate();
  const total = cartItems.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.qty || 0), 0);

  useEffect(() => {
    if (!cartItems.length) return;
    try {
      const savedAddresses = JSON.parse(localStorage.getItem("customerAddresses") || "[]");
      if (!Array.isArray(savedAddresses) || savedAddresses.length === 0) {
        navigate("/addresses", { state: { fromCheckout: true }, replace: true });
      }
    } catch {
      navigate("/addresses", { state: { fromCheckout: true }, replace: true });
    }
  }, [cartItems.length, navigate]);

  async function handlePlaceOrder(payload) {
    return apiPlaceOrder(payload);
  }

  function handleCheckoutComplete(order, options = {}) {
    onOrderPlaced?.(order);
    if (options.redirectToOrders === false) {
      return;
    }
    navigate("/orders");
  }

  return (
    <CheckoutSection
      items={cartItems}
      total={total}
      formatPrice={formatPrice}
      onPlaceOrder={handlePlaceOrder}
      onOrderPlaced={handleCheckoutComplete}
    />
  );
}
