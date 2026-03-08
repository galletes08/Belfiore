import CheckoutSection from '../../sections/CheckoutSection';
import { formatPrice, useCustomerStore } from '../../context/CustomerStore';
import { apiPlaceOrder } from '../../../api/client';

export default function CheckoutPage() {
  const { cartItems, cartTotal, clearCart, rememberOrder } = useCustomerStore();

  async function placeOrder(payload) {
    return apiPlaceOrder(payload);
  }

  function handleOrderPlaced(order) {
    rememberOrder(order);
    clearCart();
  }

  return (
    <CheckoutSection
      items={cartItems}
      total={cartTotal}
      formatPrice={formatPrice}
      onOrderPlaced={handleOrderPlaced}
      onPlaceOrder={placeOrder}
    />
  );
}
