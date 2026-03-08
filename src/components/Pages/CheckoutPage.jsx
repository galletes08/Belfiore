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

  async function handlePlaceOrder(payload) {
    return apiPlaceOrder(payload);
  }

  function handleCheckoutComplete(order) {
    onOrderPlaced?.(order);
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
